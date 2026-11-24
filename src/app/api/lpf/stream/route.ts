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

    let upstreamRes = await fetch(upstream, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    let viaHomeRelay = false;

    if (!upstreamRes.ok && needsHomeRelay(upstream.hostname)) {
      const relay = await getHomeRelayUrl();
      const secret = process.env.LPF_HOME_SECRET?.trim() ?? "";
      if (relay && secret) {
        const relayRes = await fetch(
          `${relay}/fetch?u=${encodeURIComponent(upstream.toString())}&key=${encodeURIComponent(secret)}`,
          {
            headers,
            redirect: "follow",
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
            cache: "no-store",
          }
        );
        if (relayRes.ok) {
          upstreamRes = relayRes;
          viaHomeRelay = true;
        }
      }
    }

    if (!upstreamRes.ok) {
      return new Response("Stream unavailable", { status: upstreamRes.status === 404 ? 503 : upstreamRes.status });
    }

    const contentType = upstreamRes.headers.get("content-type") ?? "";
    const isPlaylist =
      upstream.pathname.toLowerCase().endsWith(".m3u8") || contentType.includes("mpegurl");

    if (isPlaylist) {
      const body = await upstreamRes.text();
      // Through the home relay the response URL is the tunnel's, so relative
      // URIs must resolve against the original CDN URL instead.
      const finalUrl = !viaHomeRelay && upstreamRes.url ? new URL(upstreamRes.url) : upstream;
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
