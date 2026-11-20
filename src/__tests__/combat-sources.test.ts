/**
 * @jest-environment node
 */
import {
  isPlayablePlaylist,
  parseKoraPlayerPage,
  parseSourcePlaylist,
  resolveCombatSources,
  streamIdFromUrl,
} from "@/lib/combat-sources";
import { openCombatToken, rewriteCombatPlaylist, sealCombatUrl } from "@/lib/combat-relay";
import type { CombatMatch } from "@/lib/combat-source";

// Shape of the wrapper the agenda publishes as `embed_url` (scripts trimmed to
// the constants this resolver reads). It frames `<edge>.kora-plus.mov`.
const KORA_WRAPPER_HTML = `
<iframe id="player-frame" src="" allow="autoplay; fullscreen" allowfullscreen></iframe>
<script>
const edges = ['a11','a12','a13','a14','a15','a16'];
const params = new URLSearchParams(location.search);
const id = params.get('id') || '';
const edge = params.get('edge') || 'a11';
frame.src = \`https://\${edge}.kora-plus.mov/framestream.php?id=\${encodeURIComponent(id)}\`;
</script>
`;

// Shape of the `real_url` page: a Blade template that exposes its playlist.
const GOOZ_PAGE_HTML = `
<script>
  const IS_MULTI     = false;
  const SOURCE       = "https:\\/\\/chatgpt.hereisman.net\\/playlist\\/60521\\/load-playlist";
  const TITLE        = "Lauren Price vs Michaela Kotaskova";
</script>
`;

const MASTER = [
  "#EXTM3U",
  "#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1280x720",
  "https://red.mirror-test.space/playlist/60521/a.demain4.space/caxi",
].join("\n");

const VARIANT = [
  "#EXTM3U",
  "#EXT-X-VERSION:3",
  "#EXT-X-TARGETDURATION:5",
  "#EXT-X-MEDIA-SEQUENCE:1315",
  "#EXTINF:5.000000,",
  "https://a.segments-test.space/scripts/NjA1MjM=/p1315.txt",
].join("\n");

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string, contentType = "application/vnd.apple.mpegurl"): Response {
  return new Response(body, { status: 200, headers: { "content-type": contentType } });
}

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
}

function match(
  id: number,
  streams: { embed_url?: string; real_url?: string }[]
): CombatMatch {
  return {
    id,
    title: "Lauren Price vs Michaela Kotaskova",
    sport: "boxing",
    sportName: "Boxing",
    startsAt: "2026-11-20T16:45:00Z",
    timestamp: 0,
    live: true,
    finished: false,
    streams: streams.map((stream, index) => ({ id: index, ...stream })),
  };
}

describe("combat embed parsing", () => {
  it("reads the kora player page out of the wrapper script", () => {
    const page = parseKoraPlayerPage(KORA_WRAPPER_HTML, "60521");
    expect(page?.pathname).toBe("/framestream.php");
    expect(page?.searchParams.get("id")).toBe("60521");
    expect(page?.hostname).toMatch(/^a1[1-6]\.kora-plus\.mov$/);
    // Same fight → same edge, so repeated resolutions do not shuffle upstreams.
    expect(parseKoraPlayerPage(KORA_WRAPPER_HTML, "60521")?.hostname).toBe(page?.hostname);

    expect(parseKoraPlayerPage("<html></html>", "60521")).toBeNull();
    expect(parseKoraPlayerPage(KORA_WRAPPER_HTML, "../../etc/passwd")).toBeNull();
  });

  it("refuses a wrapper that points at a domain outside the player family", () => {
    const hijacked = KORA_WRAPPER_HTML.replace("kora-plus.mov", "attacker.example");
    expect(parseKoraPlayerPage(hijacked, "60521")).toBeNull();
  });

  it("reads the gooz playlist and rejects foreign hosts", () => {
    expect(parseSourcePlaylist(GOOZ_PAGE_HTML)?.hostname).toBe("chatgpt.hereisman.net");
    expect(
      parseSourcePlaylist(
        '<script>const SOURCE = "https:\\/\\/attacker.example\\/playlist\\/1";</script>'
      )
    ).toBeNull();
    expect(parseSourcePlaylist("<html></html>")).toBeNull();
  });

  it("extracts the stream id from the embed paths", () => {
    expect(streamIdFromUrl("https://gooz.aapmains.net/new-stream-embed/60521")).toBe("60521");
    expect(streamIdFromUrl("https://golygoals.com/streameast.html?id=60521")).toBe("60521");
    expect(streamIdFromUrl("https://gooz.aapmains.net/new-stream-embed/abc")).toBeNull();
  });
});

describe("combat source resolution", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("only publishes the gooz chain once a real segment answers", async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://gooz.aapmains.net/new-stream-embed/70001")) {
        return htmlResponse(GOOZ_PAGE_HTML);
      }
      if (url.startsWith("https://chatgpt.hereisman.net/playlist/60521/load-playlist")) {
        return textResponse(MASTER);
      }
      if (url.startsWith("https://red.mirror-test.space/")) return textResponse(VARIANT);
      if (url.startsWith("https://a.segments-test.space/")) {
        return new Response(new Uint8Array([0x47, 0x40, 0x11]), {
          status: 206,
          headers: { "content-type": "video/mp2t" },
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const sources = await resolveCombatSources(
      match(70001, [{ real_url: "https://gooz.aapmains.net/new-stream-embed/70001" }])
    );

    expect(sources).toHaveLength(1);
    expect(sources[0].kind).toBe("hls");
    expect(sources[0].src.startsWith("/api/combat/stream?t=")).toBe(true);

    // The sealed token round-trips to the master playlist and its referer.
    const token = decodeURIComponent(sources[0].src.split("t=")[1]);
    const sealed = openCombatToken(token);
    expect(sealed?.url).toBe("https://chatgpt.hereisman.net/playlist/60521/load-playlist");
    expect(sealed?.referer).toBe("https://gooz.aapmains.net/");
  });

  it("reports no source when the provider's cache still names dead segments", async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://gooz.aapmains.net/new-stream-embed/70002")) {
        return htmlResponse(GOOZ_PAGE_HTML);
      }
      if (url.startsWith("https://chatgpt.hereisman.net/")) return textResponse(MASTER);
      if (url.startsWith("https://red.mirror-test.space/")) return textResponse(VARIANT);
      // The fight ended hours ago: the playlist survived in the CDN cache but
      // every segment is gone.
      return new Response("<html>404</html>", {
        status: 404,
        headers: { "content-type": "text/html" },
      });
    }) as typeof fetch;

    const sources = await resolveCombatSources(
      match(70002, [{ real_url: "https://gooz.aapmains.net/new-stream-embed/70002" }])
    );
    expect(sources).toEqual([]);
  });

  it("publishes the kora chain through the embed relay when the fight is ready", async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("golygoals.com/streameast.html")) return htmlResponse(KORA_WRAPPER_HTML);
      if (url.includes("/framestream.php") && url.includes("_json=1")) {
        return jsonResponse({
          url: "/playlist/60521/index/caxi?token=t&exp=9999999999",
          exp: 9999999999,
          ready: true,
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const sources = await resolveCombatSources(
      match(70003, [{ embed_url: "https://golygoals.com/streameast.html?id=60521" }])
    );

    expect(sources).toHaveLength(1);
    expect(sources[0].src).toMatch(
      /^\/api\/hls\?e=https%3A%2F%2Fa1[1-6]\.kora-plus\.mov%2Fframestream\.php%3Fid%3D60521$/
    );
  });

  it("does not frame a signal the provider has not provisioned", async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("streameast.html")) return htmlResponse(KORA_WRAPPER_HTML);
      if (url.includes("_json=1")) {
        return jsonResponse({ url: "/playlist/60521/index/caxi?token=t", exp: 0, ready: false });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const sources = await resolveCombatSources(
      match(70004, [
        {
          embed_url: "https://golygoals.com/streameast.html?id=60999",
          real_url: "https://foreign.example/new-stream-embed/60521",
        },
      ])
    );
    expect(sources).toEqual([]);
  });

  it("walks master → variant → segment before trusting a playlist", async () => {
    const calls: string[] = [];
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("load-playlist")) return textResponse(MASTER);
      if (url.startsWith("https://red.mirror-test.space/")) return textResponse(VARIANT);
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "video/mp2t" },
      });
    }) as typeof fetch;

    const master = new URL("https://chatgpt.hereisman.net/playlist/60521/load-playlist");
    await expect(isPlayablePlaylist(master, "https://gooz.aapmains.net/")).resolves.toBe(true);
    expect(calls.at(-1)).toBe("https://a.segments-test.space/scripts/NjA1MjM=/p1315.txt");
  });
});

describe("combat relay tokens", () => {
  it("rejects tampered tokens", () => {
    const token = sealCombatUrl("https://red.mirror-test.space/a.m3u8", "https://gooz.aapmains.net/");
    expect(openCombatToken(token)?.referer).toBe("https://gooz.aapmains.net/");

    const bytes = Buffer.from(token, "base64url");
    bytes[bytes.length - 1] ^= 0xff;
    expect(openCombatToken(bytes.toString("base64url"))).toBeNull();
  });

  it("refuses to seal a reference into the private network", () => {
    const token = sealCombatUrl("https://127.0.0.1/stream.m3u8", "https://gooz.aapmains.net/");
    expect(openCombatToken(token)).toBeNull();
  });

  it("rewrites every playlist reference through the relay", () => {
    const body = [
      "#EXTM3U",
      '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
      "#EXTINF:5,",
      "seg-1.ts",
    ].join("\n");
    const rewritten = rewriteCombatPlaylist(
      body,
      new URL("https://red.mirror-test.space/playlist/60521/a.demain4.space/caxi"),
      "https://gooz.aapmains.net/"
    );
    const lines = rewritten.split("\n");
    expect(lines[1]).toMatch(/^#EXT-X-KEY:METHOD=AES-128,URI="\/api\/combat\/stream\?t=/);
    expect(lines[3]).toMatch(/^\/api\/combat\/stream\?t=/);
    expect(rewritten).not.toContain("mirror-test.space");
  });
});
