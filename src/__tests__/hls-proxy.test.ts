/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import {
  isAllowedStreamUrl,
  rewriteHlsPlaylist,
  toHlsProxyUrl,
} from "@/lib/hls-proxy";
import { openLpfUrl, sealLpfSegmentUrl, sealLpfUrl } from "@/lib/sealed-url";
import { GET } from "@/app/api/hls/route";
import { relaySegment } from "@/lib/hls-relay";

beforeAll(() => {
  process.env.LPF_PROXY_SECRET = "test-relay-secret";
  process.env.HLS_STREAM_HOSTS = "ftlly.com,fhlsport*";
});

const PLAYLIST = [
  "#EXTM3U",
  '#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x9c7db8778570d05c3f9ae7afbafa6423',
  "#EXT-X-TARGETDURATION:7",
  "#EXTINF:6.006,",
  "2026/10/29/00/29/40-05405.ts?token=seg1",
  "#EXTINF:6.006,",
  "https://8.ftlly.com/mls1es/2026/10/29/00/29/46-06006.ts?token=seg2",
  "",
].join("\n");

function makeRequest(url: string, headers?: Record<string, string>) {
  return new NextRequest(url, headers ? { headers } : undefined);
}

describe("isAllowedStreamUrl", () => {
  it("allows https on ftlly.com and its subdomains", () => {
    expect(isAllowedStreamUrl(new URL("https://4.ftlly.com/x/mono.m3u8?token=a"))).toBe(true);
    expect(isAllowedStreamUrl(new URL("https://ftlly.com/x/mono.m3u8"))).toBe(true);
  });

  it("rejects other hosts, plain http, and lookalike domains", () => {
    expect(isAllowedStreamUrl(new URL("https://evil.com/x.m3u8"))).toBe(false);
    expect(isAllowedStreamUrl(new URL("http://4.ftlly.com/x.m3u8"))).toBe(false);
    expect(isAllowedStreamUrl(new URL("https://notftlly.com/x.m3u8"))).toBe(false);
    expect(isAllowedStreamUrl(new URL("https://ftlly.com.evil.com/x.m3u8"))).toBe(false);
  });
});

const RELAY_TOKEN_RE = /\/api\/hls(?:\/seg)?\?t=([A-Za-z0-9_-]+)/;

/** Decodes the upstream URL sealed inside a rewritten `/api/hls?t=` reference. */
function relayTarget(reference: string): string | null {
  const match = reference.match(RELAY_TOKEN_RE);
  return match ? openLpfUrl(match[1]) : null;
}

describe("rewriteHlsPlaylist", () => {
  it("routes segment lines and URI attributes through the relay", () => {
    const upstream = new URL("https://4.ftlly.com/mls1es/mono.m3u8?token=abc");
    const out = rewriteHlsPlaylist(PLAYLIST, upstream);
    const lines = out.split("\n");

    expect(lines[0]).toBe("#EXTM3U");
    expect(lines[1]).toMatch(
      /^#EXT-X-KEY:METHOD=AES-128,URI="\/api\/hls\/seg\?t=[A-Za-z0-9_-]+",IV=0x9c7db8778570d05c3f9ae7afbafa6423$/
    );
    const keyUri = lines[1].match(/URI="([^"]+)"/)?.[1] ?? "";
    expect(relayTarget(keyUri)).toBe("https://4.ftlly.com/mls1es/key.bin");
    expect(relayTarget(lines[4])).toBe(
      "https://4.ftlly.com/mls1es/2026/10/29/00/29/40-05405.ts?token=seg1"
    );
    expect(relayTarget(lines[6])).toBe(
      "https://8.ftlly.com/mls1es/2026/10/29/00/29/46-06006.ts?token=seg2"
    );
    // Provider hosts must never appear in the rewritten playlist.
    expect(out).not.toContain("ftlly.com");
  });

  it("toHlsProxyUrl seals the upstream URL behind an opaque token", () => {
    const proxied = toHlsProxyUrl("https://a.b/c?d=e&f=g");
    expect(proxied).toMatch(/^\/api\/hls\?t=[A-Za-z0-9_-]+$/);
    expect(proxied).not.toContain("a.b");
    expect(relayTarget(proxied)).toBe("https://a.b/c?d=e&f=g");
  });

  it("routes nested .m3u8 URIs through the no-store playlist relay", () => {
    const upstream = new URL("https://4.ftlly.com/master.m3u8?token=abc");
    const master = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=1000000",
      "variant/720p.m3u8?token=v1",
      "",
    ].join("\n");
    const out = rewriteHlsPlaylist(master, upstream);
    expect(out).toContain("/api/hls?t=");
    expect(out).not.toContain("/api/hls/seg");
    expect(out).not.toContain("ftlly.com");
  });
});

describe("sealLpfSegmentUrl", () => {
  it("produces identical tokens for the same URL within a bucket", () => {
    const url = "https://4.ftlly.com/mls1es/seg.ts?token=s";
    expect(sealLpfSegmentUrl(url)).toBe(sealLpfSegmentUrl(url));
    expect(openLpfUrl(sealLpfSegmentUrl(url))).toBe(url);
  });

  it("produces different tokens for different URLs", () => {
    const a = sealLpfSegmentUrl("https://4.ftlly.com/a.ts");
    const b = sealLpfSegmentUrl("https://4.ftlly.com/b.ts");
    expect(a).not.toBe(b);
  });
});

describe("/api/hls", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch;
    else delete (globalThis as { fetch?: typeof fetch }).fetch;
  });

  const proxyUrl = (upstream: string) =>
    `http://localhost/api/hls?t=${sealLpfUrl(upstream)}`;

  it("returns 400 without a target URL", async () => {
    const res = await GET(makeRequest("http://localhost/api/hls"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a forged or malformed token", async () => {
    const res = await GET(makeRequest("http://localhost/api/hls?t=not-a-token"));
    expect(res.status).toBe(400);
  });

  it("returns 403 for hosts outside the allowlist", async () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    const res = await GET(
      makeRequest(proxyUrl("https://evil.example.com/mono.m3u8"))
    );
    expect(res.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("relays playlists rewritten to the proxy, uncached", async () => {
    const target = "https://4.ftlly.com/mls1es/mono.m3u8?token=abc";
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(PLAYLIST, {
        status: 200,
        headers: { "Content-Type": "application/vnd.apple.mpegurl" },
      })
    ) as unknown as typeof fetch;

    const res = await GET(makeRequest(proxyUrl(target)));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/vnd.apple.mpegurl");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(body).toContain("/api/hls/seg?t=");
    // The rewritten playlist seals every segment: no upstream host leaks.
    expect(body).not.toContain("ftlly.com");
    const segTargets = body
      .split("\n")
      .filter((line) => line.startsWith("/api/hls/seg?t="))
      .map(relayTarget);
    expect(segTargets).toContain(
      "https://4.ftlly.com/mls1es/2026/10/29/00/29/40-05405.ts?token=seg1"
    );
    const [calledUrl, calledInit] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(String(calledUrl)).toBe(target);
    expect(calledInit.signal).toBeDefined();
  });

  it("streams segment bodies through with passthrough headers", async () => {
    const target = "https://4.ftlly.com/mls1es/seg.ts?token=s";
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response("TSBYTES", {
        status: 200,
        headers: {
          "Content-Type": "video/MP2T",
          "Content-Length": "7",
          "Accept-Ranges": "bytes",
        },
      })
    ) as unknown as typeof fetch;

    const res = await GET(makeRequest(proxyUrl(target), { Range: "bytes=0-6" }));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toBe("TSBYTES");
    expect(res.headers.get("content-type")).toBe("video/MP2T");
    expect(res.headers.get("content-length")).toBe("7");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const callHeaders = (globalThis.fetch as jest.Mock).mock.calls[0][1].headers;
    expect(callHeaders.Range).toBe("bytes=0-6");
  });

  it("returns 502 when the upstream fetch fails", async () => {
    const target = "https://4.ftlly.com/mls1es/mono.m3u8?token=abc";
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const res = await GET(makeRequest(proxyUrl(target)));
    expect(res.status).toBe(502);
  });
});

describe("relaySegment (/api/hls/seg)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch;
    else delete (globalThis as { fetch?: typeof fetch }).fetch;
  });

  it("serves segments with CDN-cacheable headers and no Next Vary", async () => {
    const target = new URL("https://4.ftlly.com/mls1es/seg.ts?token=s");
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response("TSBYTES", {
        status: 200,
        headers: { "Content-Type": "video/MP2T", "Content-Length": "7" },
      })
    ) as unknown as typeof fetch;

    const res = await relaySegment(target, null);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("TSBYTES");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("vary")).toBe("Accept-Encoding");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
