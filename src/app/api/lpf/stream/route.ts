import { isLpfStreamHost, openLpfUrl, rewriteLpfPlaylist } from "@/lib/lpf-play";

export const dynamic = "force-dynamic";

/**
 * Anonymous relay for LPF Play.
 *
 * The URL arrives sealed inside `?t=`. Playlists are rewritten so every
 * segment and key reference comes back through here as another sealed token,
 * which keeps the provider host out of the browser entirely.
 */

const UPSTREAM_TIMEOUT_MS = 30_000;

const PASSTHROUGH_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

const PLAYLIST_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/vnd.apple.mpegurl",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const target = openLpfUrl(token);
  if (!target) return new Response("Invalid stream reference", { status: 400 });

  const upstream = new URL(target);
  if (!isLpfStreamHost(upstream)) {
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
      cache: "no-store",
    });

    if (!upstreamRes.ok) {
      return new Response("Stream unavailable", { status: upstreamRes.status === 404 ? 503 : upstreamRes.status });
    }

    const contentType = upstreamRes.headers.get("content-type") ?? "";
    const isPlaylist =
      upstream.pathname.toLowerCase().endsWith(".m3u8") || contentType.includes("mpegurl");

    if (isPlaylist) {
      const body = await upstreamRes.text();
      const finalUrl = upstreamRes.url ? new URL(upstreamRes.url) : upstream;
      return new Response(rewriteLpfPlaylist(body, finalUrl), {
        status: 200,
        headers: PLAYLIST_HEADERS,
      });
    }

    const outHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    };
    for (const name of PASSTHROUGH_HEADERS) {
      const value = upstreamRes.headers.get(name);
      if (value) outHeaders[name] = value;
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: outHeaders,
    });
  } catch (error) {
    console.warn("[lpf] relay failed:", error);
    return new Response("Stream unavailable", { status: 502 });
  }
}
