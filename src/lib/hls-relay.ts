import {
  EMBED_USER_AGENT,
  isEmbedPlayerPage,
  resolveEmbedPlaylist,
} from "@/lib/embed-resolver";
import { isAllowedStreamUrl, rewriteHlsPlaylist, rewritePlaylistToAbsolute } from "@/lib/hls-proxy";
import { getCache, setCache } from "@/lib/cache";
import { getSharedPlaylist, setSharedPlaylist } from "@/lib/playlist-cache";
import {
  resolveDeferredSegmentUrls,
  settleSegmentPopulates,
  type DeferredSegmentUrl,
} from "@/lib/r2-segments";
import { isBlockedNetworkTarget } from "@/lib/url-guard";

// Healthy upstreams answer in ~1-2s. 45s let dead signals hold the origin
// for ~90s (two mirror candidates) and 504'd unrelated routes; 15s still
// covers slow-but-alive providers while freeing the server ~3x faster.
export const UPSTREAM_TIMEOUT_MS = 15_000;

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

export const PLAYLIST_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/vnd.apple.mpegurl",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

const EDGE_REFERER = process.env.PLAYER_SIX_REFERER || "";
const EDGE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function rot13(value: string): string {
  return value.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(base + ((c.charCodeAt(0) - base + 13) % 26));
  });
}

function decodeMirrorParam(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return atob(rot13(decodeURIComponent(raw.slice(8))));
  } catch {
    return null;
  }
}

/** Backup CDN URL embedded in a smart-link segment URL, when present. */
function mirrorBackupUrl(upstream: URL): URL | null {
  const rawQuery = upstream.search;
  if (!rawQuery.includes("_ctuph=") || !rawQuery.includes("_ctump=")) return null;
  const pick = (key: string): string | null => {
    const m = rawQuery.match(new RegExp(`[?&]${key}=([^&]*)`));
    return m ? m[1] : null;
  };
  const path = decodeMirrorParam(pick("_ctuph"));
  const mirror = decodeMirrorParam(pick("_ctump"));
  if (!path || !mirror) return null;
  const host = mirror.split("@").pop();
  if (!host) return null;
  try {
    const url = new URL(`https://${host}${path}`);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

async function fetchUpstream(
  candidate: URL,
  headers: Record<string, string>
): Promise<Response> {
  return fetch(candidate, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

function upstreamHeaders(upstream: URL, range: string | null): Record<string, string> {
  const isEdgeCdn = upstream.hostname.startsWith("fhlsport");
  const headers: Record<string, string> = { Accept: "*/*" };
  if (range) headers.Range = range;
  if (isEdgeCdn) {
    headers["User-Agent"] = EDGE_UA;
    if (EDGE_REFERER) headers["Referer"] = EDGE_REFERER;
  }
  return headers;
}

/**
 * Smart-link segments carry an encrypted backup host+path; the primary
 * edge 302s them to nodes that reset the connection, so try backup first.
 */
async function fetchWithMirrorFallback(
  upstream: URL,
  range: string | null
): Promise<Response> {
  const headers = upstreamHeaders(upstream, range);
  const candidates: URL[] = [];
  const backup = mirrorBackupUrl(upstream);
  if (backup && backup.hostname !== upstream.hostname && !isBlockedNetworkTarget(backup)) {
    candidates.push(backup);
  }
  candidates.push(upstream);

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const res = await fetchUpstream(candidate, headers);
      if (res.ok || res.status === 206 || candidate === candidates[candidates.length - 1]) {
        return res;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("all upstream candidates failed");
}

/**
 * Relay a playlist or segment through the app server. Playlists are rewritten
 * so their child URIs also point at the relay; segments pass through as-is.
 */
export async function relayUpstream(
  upstream: URL,
  range: string | null
): Promise<Response> {
  // .m3u8 URLs are playlists before we even fetch them: serve repeat viewers
  // of the same channel from the shared 2s cache and skip the upstream trip.
  // Populate waits still run on hits — segments referenced by the cached
  // body may still be uploading to R2.
  const maybePlaylist = upstream.pathname.toLowerCase().endsWith(".m3u8");
  if (maybePlaylist && !range) {
    const cached = getSharedPlaylist(upstream.href);
    if (cached !== null) {
      await settleSegmentPopulates();
      return new Response(cached, { status: 200, headers: PLAYLIST_HEADERS });
    }
  }

  try {
    const upstreamRes = await fetchWithMirrorFallback(upstream, range);

    const contentType = upstreamRes.headers.get("content-type") ?? "";
    const isPlaylist =
      upstream.pathname.toLowerCase().endsWith(".m3u8") ||
      contentType.includes("mpegurl");

    if (isPlaylist) {
      // Live playlists must never be cached: they change every few seconds.
      // The shared 2s cache still applies — every viewer of the same channel
      // asks for the same URL within the same window, so one upstream fetch
      // serves them all.
      const text = await upstreamRes.text();
      const finalUrl = upstreamRes.url ? new URL(upstreamRes.url) : upstream;
      const deferred: DeferredSegmentUrl[] = [];
      const rewritten = rewriteHlsPlaylist(text, finalUrl, deferred);
      // Hold the response until the populates for the segments we just
      // referenced finish, so viewers never request an object that is not
      // in R2 yet (a 404 would be edge-cached for hours). Segments whose
      // populate failed resolve to the worker relay instead of an R2 404.
      await settleSegmentPopulates();
      const resolved = resolveDeferredSegmentUrls(rewritten, deferred);
      if (!range) setSharedPlaylist(upstream.href, resolved);
      return new Response(resolved, {
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

/**
 * Relay a media segment for the CDN-cacheable `/api/hls/seg` route. The body
 * is immutable, so it is served with long-lived public cache headers — a CDN
 * edge can then answer repeat viewers without touching this server.
 */
export async function relaySegment(
  upstream: URL,
  range: string | null
): Promise<Response> {
  try {
    const upstreamRes = await fetchWithMirrorFallback(upstream, range);

    const contentType = upstreamRes.headers.get("content-type") ?? "";
    const isPlaylist =
      upstream.pathname.toLowerCase().endsWith(".m3u8") ||
      contentType.includes("mpegurl");

    const outHeaders: Record<string, string> = { ...CORS_HEADERS };
    for (const name of PASSTHROUGH_HEADERS) {
      const value = upstreamRes.headers.get(name);
      if (value) outHeaders[name] = value;
    }
    outHeaders["Cache-Control"] = isPlaylist
      ? "no-store"
      : "public, max-age=86400, immutable";
    // Next.js stamps every response with `Vary: rsc, next-router-*`, which
    // makes CDN edges refuse to cache. Claim Vary ourselves so the segment
    // stays cacheable; Accept-Encoding is the only variation that matters.
    if (!isPlaylist) outHeaders["Vary"] = "Accept-Encoding";

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: outHeaders,
    });
  } catch (error) {
    console.warn("[hls-proxy] segment upstream failed:", error);
    return new Response("Upstream stream unavailable", { status: 502 });
  }
}

/**
 * Some embed providers serve segments from a CDN with
 * `access-control-allow-origin: *` (safe to hand the browser directly);
 * others do not, and an absolutized URL leaves hls.js with a black screen.
 * Probe one byte range per host and memoise the answer — the check costs a
 * single upstream request per host per ~10 minutes, not per viewer.
 */
const SEG_CORS_TTL = 10 * 60 * 1000;

async function segmentHostAllowsCors(segmentUrl: string): Promise<boolean> {
  let host: string;
  try {
    host = new URL(segmentUrl).hostname;
  } catch {
    return false;
 }
  const key = `embed-seg-cors:${host}`;
  const cached = await getCache<boolean>(key).catch(() => null);
  if (cached !== null) return cached;
  let allowed = false;
  try {
    const res = await fetch(segmentUrl, {
      headers: {
        "User-Agent": EMBED_USER_AGENT,
        Range: "bytes=0-0",
        Accept: "*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const acao = res.headers.get("access-control-allow-origin");
    allowed = Boolean(acao && acao !== "null");
    await res.body?.cancel().catch(() => {});
  } catch {
    allowed = false;
  }
  await setCache(key, allowed, SEG_CORS_TTL).catch(() => {});
  return allowed;
}

/** First media-segment URL in a playlist body, resolved against the playlist. */
function firstSegmentUrl(body: string, playlist: URL): string | null {
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    try {
      return new URL(trimmed, playlist).href;
    } catch {
      return null;
    }
  }
  return null;
}

export async function relayEmbedPage(rawPage: string): Promise<Response> {
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
    // CORS-free segment CDNs can be absolutized (saves relay bandwidth);
    // anything else must go through /api/hls/seg so hls.js never hits a
    // cross-origin fetch the provider did not opt into.
    const firstSegment = firstSegmentUrl(body, finalUrl);
    const directOk = firstSegment ? await segmentHostAllowsCors(firstSegment) : false;
    if (directOk) {
      return new Response(rewritePlaylistToAbsolute(body, finalUrl), {
        status: 200,
        headers: PLAYLIST_HEADERS,
      });
    }
    // Segments go through R2 under the "embed" kind: populate settles before
    // the playlist is emitted so viewers never hit an unpopulated object.
    const deferred: DeferredSegmentUrl[] = [];
    const rewritten = rewriteHlsPlaylist(body, finalUrl, deferred, "embed");
    await settleSegmentPopulates();
    return new Response(resolveDeferredSegmentUrls(rewritten, deferred), {
      status: 200,
      headers: PLAYLIST_HEADERS,
    });
  } catch (error) {
    console.warn("[hls-proxy] embed playlist failed:", error);
    return new Response("Embed playlist unavailable", { status: 502 });
  }
}

export function isAllowedRelayTarget(url: URL): boolean {
  return isAllowedStreamUrl(url);
}
