import { isAllowedStreamUrl, rewriteHlsPlaylist } from "@/lib/hls-proxy";

// Player 4 (futbolvideos) HLS relay: the ftlly.com CDN serves our server on
// every attempt but intermittently denies the browser itself (403 +
// `x-deny-reason: wrong_domain`) for the same URL and headers. Playlists and
// segments are fetched here and relayed with permissive CORS so hls.js works
// from any origin. See src/lib/hls-proxy.ts for the URL rules.

const UPSTREAM_TIMEOUT_MS = 45_000;

const PASSTHROUGH_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
};

export async function GET(request: Request): Promise<Response> {
  const rawTarget = new URL(request.url).searchParams.get("u");

  let upstream: URL;
  try {
    upstream = new URL(rawTarget ?? "");
  } catch {
    return new Response("Missing or invalid stream URL", { status: 400 });
  }
  if (!isAllowedStreamUrl(upstream)) {
    return new Response("Stream host not allowed", { status: 403 });
  }

  try {
    const headers: Record<string, string> = { Accept: "*/*" };
    const range = request.headers.get("range");
    if (range) headers.Range = range;

    const upstreamRes = await fetch(upstream, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const contentType = upstreamRes.headers.get("content-type") ?? "";
    const isPlaylist =
      upstream.pathname.toLowerCase().endsWith(".m3u8") ||
      contentType.includes("mpegurl");

    if (isPlaylist) {
      // Live playlists must never be cached: they change every few seconds.
      const text = await upstreamRes.text();
      return new Response(rewriteHlsPlaylist(text, upstream), {
        status: upstreamRes.status,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // Segments and keys: relay the body through as-is (Range-respecting).
    const outHeaders: Record<string, string> = { ...CORS_HEADERS };
    for (const name of PASSTHROUGH_HEADERS) {
      const value = upstreamRes.headers.get(name);
      if (value) outHeaders[name] = value;
    }
    outHeaders["Cache-Control"] = "no-store";

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: outHeaders,
    });
  } catch (error) {
    console.warn("[hls-proxy] upstream failed:", error);
    return new Response("Upstream stream unavailable", { status: 502 });
  }
}
