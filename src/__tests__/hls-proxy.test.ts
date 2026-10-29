/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import {
  isAllowedStreamUrl,
  rewriteHlsPlaylist,
  toHlsProxyUrl,
} from "@/lib/hls-proxy";
import { GET } from "@/app/api/hls/route";

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

describe("rewriteHlsPlaylist", () => {
  it("routes segment lines and URI attributes through the relay", () => {
    const upstream = new URL("https://4.ftlly.com/mls1es/mono.m3u8?token=abc");
    const out = rewriteHlsPlaylist(PLAYLIST, upstream);
    const lines = out.split("\n");

    expect(lines[0]).toBe("#EXTM3U");
    expect(lines[1]).toBe(
      '#EXT-X-KEY:METHOD=AES-128,URI="/api/hls?u=https%3A%2F%2F4.ftlly.com%2Fmls1es%2Fkey.bin",IV=0x9c7db8778570d05c3f9ae7afbafa6423'
    );
    expect(lines[4]).toBe(
      `/api/hls?u=${encodeURIComponent("https://4.ftlly.com/mls1es/2026/10/29/00/29/40-05405.ts?token=seg1")}`
    );
    expect(lines[6]).toBe(
      `/api/hls?u=${encodeURIComponent("https://8.ftlly.com/mls1es/2026/10/29/00/29/46-06006.ts?token=seg2")}`
    );
  });

  it("toHlsProxyUrl percent-encodes the upstream URL", () => {
    expect(toHlsProxyUrl("https://a.b/c?d=e&f=g")).toBe(
      "/api/hls?u=https%3A%2F%2Fa.b%2Fc%3Fd%3De%26f%3Dg"
    );
  });
});

describe("/api/hls", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch;
    else delete (globalThis as { fetch?: typeof fetch }).fetch;
  });

  const proxyUrl = (upstream: string) =>
    `http://localhost/api/hls?u=${encodeURIComponent(upstream)}`;

  it("returns 400 without a target URL", async () => {
    const res = await GET(makeRequest("http://localhost/api/hls"));
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
    expect(body).toContain(
      `/api/hls?u=${encodeURIComponent("https://4.ftlly.com/mls1es/2026/10/29/00/29/40-05405.ts?token=seg1")}`
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
