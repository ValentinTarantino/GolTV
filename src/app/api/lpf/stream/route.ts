import { isLpfStreamHost, openLpfUrl, rewriteLpfPlaylist } from "@/lib/lpf-play";
import { getHomeRelayUrl } from "@/lib/lpf-home-relay";
import { settleSegmentPopulates } from "@/lib/r2-segments";
import { getSharedPlaylist, setSharedPlaylist } from "@/lib/playlist-cache";
import { isIPBanned } from "@/lib/chat";
import { touchRequestPresence } from "@/lib/presence";
import { BANNED_HEADER } from "@/lib/viewer-id";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Anonymous relay for LPF Play.
 *
 * The URL arrives sealed inside `?t=`. Playlists are rewritten so every
 * segment and key reference comes back through here as another sealed token,
 * which keeps the provider host out of the browser entirely.
 */

const UPSTREAM_TIMEOUT_MS = 30_000;

/**
 * CDN hosts that only answer residential IPs. When the direct fetch fails
 * (datacenter block), the request is retried through the home relay — the
 * owner's machine exposed by a Cloudflare tunnel.
 */
const HOME_RELAY_HOSTS = (process.env.LPF_HOME_HOSTS || "sportvideodata.com")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

function needsHomeRelay(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return HOME_RELAY_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

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

function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

/**
 * Residential fallback: the provider only answers home IPs for some hosts,
 * so the owner's machine (Cloudflare tunnel) fetches on our behalf.
 */
async function fetchViaHomeRelay(
  upstream: URL,
  headers: Record<string, string>
): Promise<Response | null> {
  if (!needsHomeRelay(upstream.hostname)) return null;
  const relay = await getHomeRelayUrl();
  const secret = process.env.LPF_HOME_SECRET?.trim() ?? "";
  if (!relay || !secret) return null;
  try {
    const res = await fetch(
      `${relay}/fetch?u=${encodeURIComponent(upstream.toString())}&key=${encodeURIComponent(secret)}`,
      {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        cache: "no-store",
      }
    );
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/**
 * Last-resort fallback: the segment-relay worker fetches the same sealed
 * token from its own egress. Datacenter IPs are blocked for some providers,
 * but the worker reaches hosts Render cannot (and vice versa).
 */
async function fetchViaWorkerSeg(
  token: string,
  headers: Record<string, string>
): Promise<Response | null> {
  const populateUrl = (process.env.SEG_POPULATE_URL ?? "").trim();
  if (!populateUrl) return null;
  try {
    const origin = new URL(populateUrl).origin;
    const res = await fetch(`${origin}/api/hls/seg?t=${encodeURIComponent(token)}`, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  if (await isIPBanned(getClientIP(request))) {
    return new Response("Access denied", {
      status: 403,
      headers: { [BANNED_HEADER]: "1" },
    });
  }

  const params = new URL(request.url).searchParams;
  touchRequestPresence(request, params.get("m"));

  const token = params.get("t") ?? "";
  const target = openLpfUrl(token);
  if (!target) return new Response("Invalid stream reference", { status: 400 });

  const upstream = new URL(target);
  if (!isLpfStreamHost(upstream)) {
    console.warn(`[lpf] stream host rejected: ${upstream.hostname}`);
    return new Response("Stream host not allowed", { status: 403 });
  }

  // .m3u8 requests are playlists: repeat viewers of the same channel share
  // one upstream fetch per 2s window via the shared playlist cache.
  const maybePlaylist = upstream.pathname.toLowerCase().endsWith(".m3u8");
  if (maybePlaylist && !request.headers.get("range")) {
    const cached = getSharedPlaylist(upstream.href);
    if (cached !== null) {
      await settleSegmentPopulates();
      return new Response(cached, { status: 200, headers: PLAYLIST_HEADERS });
    }
  }

  try {
    const headers: Record<string, string> = { Accept: "*/*" };
    const range = request.headers.get("range");
    if (range) headers.Range = range;

    // Direct fetch first; on a thrown error (timeout, DNS, reset) or a
    // non-OK status, walk the fallback chain. The old code only fell back
    // on !ok, so connect timeouts — the usual datacenter block — skipped
    // the residential relay entirely and went straight to a 502.
    let upstreamRes: Response | null = null;
    let viaFallback = false;
    try {
      upstreamRes = await fetch(upstream, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      upstreamRes = null;
    }

    if (!upstreamRes?.ok) {
      const fallback =
        (await fetchViaHomeRelay(upstream, headers)) ??
        (await fetchViaWorkerSeg(token, headers));
      if (fallback) {
        upstreamRes = fallback;
        viaFallback = true;
      }
    }

    if (!upstreamRes?.ok) {
      return new Response("Stream unavailable", {
        status: upstreamRes && upstreamRes.status === 404 ? 503 : upstreamRes?.status ?? 502,
      });
    }

    const contentType = upstreamRes.headers.get("content-type") ?? "";
    const isPlaylist =
      upstream.pathname.toLowerCase().endsWith(".m3u8") || contentType.includes("mpegurl");

    if (isPlaylist) {
      const body = await upstreamRes.text();
      // Through a fallback relay the response URL is the tunnel's/worker's,
      // so relative URIs must resolve against the original CDN URL instead.
      const finalUrl = !viaFallback && upstreamRes.url ? new URL(upstreamRes.url) : upstream;
      const rewritten = rewriteLpfPlaylist(body, finalUrl);
      // Wait for the populates of the segments just referenced so viewers
      // never hit an R2 object that is not stored yet.
      await settleSegmentPopulates();
      if (maybePlaylist && !range) setSharedPlaylist(upstream.href, rewritten);
      return new Response(rewritten, {
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
