import {
  isAllowedStreamUrl,
  rewriteHlsPlaylist,
  rewritePlaylistToAbsolute,
} from "@/lib/hls-proxy";
import {
  EMBED_USER_AGENT,
  isEmbedPlayerPage,
  resolveEmbedPlaylist,
} from "@/lib/embed-resolver";

// Server-side HLS relay for the allowlisted providers in src/lib/hls-proxy.ts.
//
// Two entry points:
//   ?u=<absolute playlist or segment URL>  → straight relay (host allowlist)
//   ?e=<frame-restricted player page URL>  → resolve the page's signed playlist
//                                            and hand back a rewritten manifest

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

const PLAYLIST_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/vnd.apple.mpegurl",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const rawEmbed = params.get("e");
  if (rawEmbed) return relayEmbedPage(rawEmbed);

  const rawTarget = params.get("u");

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
      const finalUrl = upstreamRes.url ? new URL(upstreamRes.url) : upstream;
      return new Response(rewriteHlsPlaylist(text, finalUrl), {
        status: upstreamRes.status,
        headers: PLAYLIST_HEADERS,
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

async function relayEmbedPage(rawPage: string): Promise<Response> {
  let page: URL;
  try {
    page = new URL(rawPage);
  } catch {
    return new Response("Invalid player page", { status: 400 });
  }
  if (page.protocol !== "https:" || !isEmbedPlayerPage(page)) {
    return new Response("Player page not allowed", { status: 403 });
  }

  const playlist = await resolveEmbedPlaylist(page);
  if (!playlist) return new Response("Embed signal unavailable", { status: 503 });

  try {
    const upstreamRes = await fetch(playlist, {
      headers: { "User-Agent": EMBED_USER_AGENT, Accept: "*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!upstreamRes.ok) {
      return new Response("Embed playlist unavailable", {
        status: upstreamRes.status === 404 ? 503 : upstreamRes.status,
      });
    }
    const body = await upstreamRes.text();
    const finalUrl = upstreamRes.url ? new URL(upstreamRes.url) : playlist;
    return new Response(rewritePlaylistToAbsolute(body, finalUrl), {
      status: 200,
      headers: PLAYLIST_HEADERS,
    });
  } catch (error) {
    console.warn("[hls-proxy] embed playlist failed:", error);
    return new Response("Embed playlist unavailable", { status: 502 });
  }
}
