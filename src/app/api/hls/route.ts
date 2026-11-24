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
import { isIPBanned } from "@/lib/chat";
import { openLpfUrl } from "@/lib/sealed-url";
import { isBlockedNetworkTarget } from "@/lib/url-guard";

function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;
  const cfIP = request.headers.get("cf-connecting-ip");
  if (cfIP) return cfIP;
  return "unknown";
}

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

/**
 * Rotating-CDN smart-link: segment URLs carry `_ctump`/`_ctuph` params holding
 * an encrypted backup host+path (ROT13 over base64, 8-char prefix stripped).
 * The primary edge 302s segments to dead nodes, so the backup host is the URL
 * that actually serves bytes — and it only answers requests whose Referer is
 * a play domain.
 */
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

export async function GET(request: Request): Promise<Response> {
  const clientIP = getClientIP(request);
  if (await isIPBanned(clientIP)) {
    return new Response("Access denied", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const rawEmbed = params.get("e");
  if (rawEmbed) return relayEmbedPage(rawEmbed);

  // Sealed token form: the upstream URL never reaches the browser.
  const rawToken = params.get("t");
  if (rawToken) {
    let target: string | null = null;
    try {
      target = openLpfUrl(rawToken);
    } catch {
      target = null;
    }
    if (!target) {
      return new Response("Invalid or expired stream token", { status: 400 });
    }
    let tokenUrl: URL;
    try {
      tokenUrl = new URL(target);
    } catch {
      return new Response("Invalid stream token", { status: 400 });
    }
    if (tokenUrl.protocol === "https:" && isEmbedPlayerPage(tokenUrl)) {
      return relayEmbedPage(target);
    }
    if (!isAllowedStreamUrl(tokenUrl)) {
      return new Response("Stream host not allowed", { status: 403 });
    }
    return relayUpstream(tokenUrl, request);
  }

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

  return relayUpstream(upstream, request);
}

async function relayUpstream(upstream: URL, request: Request): Promise<Response> {
  try {
    const isEdgeCdn = upstream.hostname.startsWith("fhlsport");
    const headers: Record<string, string> = { Accept: "*/*" };
    const range = request.headers.get("range");
    if (range) headers.Range = range;
    if (isEdgeCdn) {
      headers["User-Agent"] = EDGE_UA;
      if (EDGE_REFERER) headers["Referer"] = EDGE_REFERER;
    }

    // Smart-link segments carry an encrypted backup host+path; the primary
    // edge 302s them to nodes that reset the connection, so try backup first.
    const candidates: URL[] = [];
    const backup = mirrorBackupUrl(upstream);
    if (backup && backup.hostname !== upstream.hostname && !isBlockedNetworkTarget(backup)) {
      candidates.push(backup);
    }
    candidates.push(upstream);

    let upstreamRes: Response | null = null;
    for (const candidate of candidates) {
      try {
        const res = await fetch(candidate, {
          headers,
          redirect: "follow",
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
        upstreamRes = res;
        if (res.ok || res.status === 206 || candidate === candidates[candidates.length - 1]) break;
      } catch {
        // try the next candidate
      }
    }
    if (!upstreamRes) throw new Error("all upstream candidates failed");

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
