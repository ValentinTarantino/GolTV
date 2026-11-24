import {
  EMBED_USER_AGENT,
  isEmbedPlayerPage,
  resolveEmbedPlaylist,
} from "@/lib/embed-resolver";
import { isAllowedStreamUrl, rewriteHlsPlaylist, rewritePlaylistToAbsolute } from "@/lib/hls-proxy";
import { isBlockedNetworkTarget } from "@/lib/url-guard";

export const UPSTREAM_TIMEOUT_MS = 45_000;

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

function upstreamHeaders(upstream: URL, request: Request): Record<string, string> {
  const isEdgeCdn = upstream.hostname.startsWith("fhlsport");
  const headers: Record<string, string> = { Accept: "*/*" };
  const range = request.headers.get("range");
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
  request: Request
): Promise<Response> {
  const headers = upstreamHeaders(upstream, request);
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
export async function relayUpstream(upstream: URL, request: Request): Promise<Response> {
  try {
    const upstreamRes = await fetchWithMirrorFallback(upstream, request);

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

/**
 * Relay a media segment for the CDN-cacheable `/api/hls/seg` route. The body
 * is immutable, so it is served with long-lived public cache headers — a CDN
 * edge can then answer repeat viewers without touching this server.
 */
export async function relaySegment(upstream: URL, request: Request): Promise<Response> {
  try {
    const upstreamRes = await fetchWithMirrorFallback(upstream, request);

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
    return new Response(rewritePlaylistToAbsolute(body, finalUrl), {
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
