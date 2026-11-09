/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import {
  collapseDuplicateLabels,
  embedPageFromWrapper,
  embedPageFor,
  isEmbedPlayerPage,
  isPlayerWrapperPage,
  parseWrapperConfig,
  resolveEmbedChannels,
  resolveEmbedPlaylist,
} from "@/lib/embed-resolver";
import { GET } from "@/app/api/hls/route";
import type { Channel } from "@/lib/types";

// Shape of the provider's static wrapper (scripts trimmed to the two constants
// this resolver reads). The wrapper frames `<edge>.<domain>/framelatin.php`.
const WRAPPER_HTML = `
<iframe id="player-frame" src="" allow="autoplay; fullscreen" allowfullscreen></iframe>
<script>
const edges = ['a11','a12','a13','a14','a15','a16'];
function randomEdge() { return edges[Math.floor(Math.random() * edges.length)]; }
const params = new URLSearchParams(location.search);
const edgeDomain = params.get('domain') || 'kora-plus.mov';
const edge = params.get('edge') || randomEdge();
</script>
`;

const WRAPPER_PAGE = "https://wrapper.example/streamlat.html?id=n1746-d7516a5ac8324fd1";

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe("wrapper parsing", () => {
  it("reads the player domain and edge rotation from the wrapper script", () => {
    expect(parseWrapperConfig(WRAPPER_HTML)).toEqual({
      domain: "kora-plus.mov",
      edges: ["a11", "a12", "a13", "a14", "a15", "a16"],
    });
    expect(parseWrapperConfig("<html></html>")).toBeNull();
  });

  it("builds a deterministic player page and honours an allowlisted domain override", () => {
    const config = parseWrapperConfig(WRAPPER_HTML)!;
    const page = embedPageFromWrapper(new URL(WRAPPER_PAGE), config);
    expect(page?.pathname).toBe("/framelatin.php");
    expect(page?.searchParams.get("ch")).toBe("n1746-d7516a5ac8324fd1");
    expect(page?.hostname).toMatch(/^a1[1-6]\.kora-plus\.mov$/);
    // Same channel → same edge, so repeated builds do not shuffle upstreams.
    expect(embedPageFromWrapper(new URL(WRAPPER_PAGE), config)?.hostname).toBe(page?.hostname);

    const overridden = embedPageFromWrapper(
      new URL(`${WRAPPER_PAGE}&domain=kora-plus.li`),
      config
    );
    expect(overridden?.hostname.endsWith(".kora-plus.li")).toBe(true);

    const foreign = embedPageFromWrapper(
      new URL(`${WRAPPER_PAGE}&domain=attacker.example`),
      config
    );
    expect(foreign).toBeNull();
  });

  it("classifies wrapper pages, player pages, and everything else", () => {
    expect(isPlayerWrapperPage(new URL(WRAPPER_PAGE))).toBe(true);
    expect(isPlayerWrapperPage(new URL("http://127.0.0.1/streamlat.html?id=1"))).toBe(false);
    expect(isPlayerWrapperPage(new URL("https://wrapper.example/other.html"))).toBe(false);

    expect(isEmbedPlayerPage(new URL("https://a11.kora-plus.mov/framelatin.php?ch=1"))).toBe(true);
    expect(isEmbedPlayerPage(new URL("https://a11.kora-plus.mov/other.php?ch=1"))).toBe(false);
    expect(isEmbedPlayerPage(new URL("https://kora-plus.mov.attacker.example/framelatin.php"))).toBe(false);
  });

  it("leaves unrelated watch pages untouched", async () => {
    expect(await embedPageFor("https://provider.example/1.php?stream=winsports2")).toBeNull();
    expect(await embedPageFor("javascript:alert(1)")).toBeNull();
  });
});

describe("playlist resolution", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch;
    else delete (globalThis as { fetch?: typeof fetch }).fetch;
  });

  it("asks the player for its signed path as an embedded frame", async () => {
    const page = new URL("https://a11.kora-plus.mov/framelatin.php?ch=n1-abc&_probe=1");
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "/playlist-latin/n1-abc/index/caxi?token=t&exp=1", exp: Math.floor(Date.now() / 1000) + 600, ready: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as unknown as typeof fetch;

    const playlist = await resolveEmbedPlaylist(page);
    expect(playlist?.href).toBe("https://a11.kora-plus.mov/playlist-latin/n1-abc/index/caxi?token=t&exp=1");

    const [calledUrl, calledInit] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(String(calledUrl)).toBe("https://a11.kora-plus.mov/framelatin.php?ch=n1-abc&_probe=1&_json=1");
    expect(calledInit.headers["Sec-Fetch-Dest"]).toBe("iframe");
    expect(calledInit.redirect).toBe("manual");
  });

  it("treats the anti-bypass redirect and unstarted signals as unresolved", async () => {
    const page = new URL("https://a12.kora-plus.mov/framelatin.php?ch=n2-abc");
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: "https://www.google.com/" } })
    ) as unknown as typeof fetch;
    expect(await resolveEmbedPlaylist(page)).toBeNull();

    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ready: false }), { status: 200 })
    ) as unknown as typeof fetch;
    expect(await resolveEmbedPlaylist(new URL("https://a13.kora-plus.mov/framelatin.php?ch=n3-abc"))).toBeNull();
  });

  it("refuses a playlist pointing outside the provider family", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "https://attacker.example/x.m3u8", ready: true }), { status: 200 })
    ) as unknown as typeof fetch;
    expect(await resolveEmbedPlaylist(new URL("https://a14.kora-plus.mov/framelatin.php?ch=n4-abc"))).toBeNull();
  });
});

describe("channel upgrade", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch;
    else delete (globalThis as { fetch?: typeof fetch }).fetch;
  });

  const jsonReply = (channel: string) =>
    new Response(JSON.stringify({ url: `/playlist-latin/${channel}/index/caxi?token=t`, exp: Math.floor(Date.now() / 1000) + 600, ready: true }), {
      status: 200,
    });

  it("upgrades a wrapped signal to HLS and drops its blocked twin", async () => {
    globalThis.fetch = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("wrapper.example")) {
        return new Response(WRAPPER_HTML, { status: 200, headers: { "Content-Type": "text/html" } });
      }
      return jsonReply("n9-abc");
    }) as unknown as typeof fetch;

    const channels: Channel[] = [
      { id: "generated", name: "Win Sports +", url: "https://wrapper.example/streamlat.html?id=n9-abc", kind: "iframe", provider: "primary-feed" },
      { id: "native", name: "Win Sports +", url: "https://native.example/1.php?stream=winsports2", kind: "iframe" },
      { id: "native-op2", name: "Win Sports + | OP2", url: "https://native.example/2.php?stream=winsports2", kind: "iframe" },
    ];

    const result = await resolveEmbedChannels(channels);
    expect(result.map((channel) => [channel.name, channel.kind])).toEqual([
      ["Win Sports +", "hls"],
      ["Win Sports + | OP2", "iframe"],
    ]);
    expect(result[0].url).toMatch(/^\/api\/hls\?e=https%3A%2F%2Fa1[1-6]\.kora-plus\.mov%2Fframelatin\.php%3Fch%3Dn9-abc$/);
    expect(result[1].url).toBe("https://native.example/2.php?stream=winsports2");
  });

  it("collapses only duplicated labels", () => {
    const channels: Channel[] = [
      { id: "a", name: "Same", url: "/1", kind: "hls" },
      { id: "b", name: "Same", url: "/2", kind: "iframe" },
      { id: "c", name: "Other", url: "/3", kind: "iframe" },
      { id: "d", name: "Other", url: "/4", kind: "iframe" },
    ];
    expect(collapseDuplicateLabels(channels).map((channel) => channel.id)).toEqual(["a", "c", "d"]);
  });
});

describe("/api/hls embed entry point", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch;
    else delete (globalThis as { fetch?: typeof fetch }).fetch;
  });

  const embedUrl = (page: string) => `http://localhost/api/hls?e=${encodeURIComponent(page)}`;

  it("rejects player pages outside the allowlisted families", async () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    const res = await GET(makeRequest(embedUrl("https://attacker.example/framelatin.php?ch=1")));
    expect(res.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("relays the signed playlist with absolute segment URLs", async () => {
    const page = "https://a11.kora-plus.mov/framelatin.php?ch=n11-abc";
    const playlist = [
      "#EXTM3U",
      "#EXT-X-TARGETDURATION:6",
      "#EXTINF:5.6,",
      "/seg/la18/index/caxi_1.txt?token=seg1",
      "#EXTINF:5.6,",
      "https://a12.kora-plus.mov/seg/la18/index/caxi_2.txt?token=seg2",
      "",
    ].join("\n");

    globalThis.fetch = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("_json=1")) {
        return new Response(JSON.stringify({ url: "/playlist-latin/n11-abc/index/caxi?token=p", exp: Math.floor(Date.now() / 1000) + 600, ready: true }), { status: 200 });
      }
      return new Response(playlist, { status: 200, headers: { "Content-Type": "application/vnd.apple.mpegurl" } });
    }) as unknown as typeof fetch;

    const res = await GET(makeRequest(embedUrl(page)));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/vnd.apple.mpegurl");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(body).toContain("https://a11.kora-plus.mov/seg/la18/index/caxi_1.txt?token=seg1");
    expect(body).toContain("https://a12.kora-plus.mov/seg/la18/index/caxi_2.txt?token=seg2");
    expect(body).not.toContain('"/seg/');
  });

  it("reports 503 when the signal is not ready", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ready: false }), { status: 200 })
    ) as unknown as typeof fetch;
    const res = await GET(makeRequest(embedUrl("https://a15.kora-plus.mov/framelatin.php?ch=n12-abc")));
    expect(res.status).toBe(503);
  });
});
