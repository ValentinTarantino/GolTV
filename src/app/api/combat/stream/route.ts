import { openCombatToken, rewriteCombatPlaylist } from "@/lib/combat-relay";
import { isBlockedNetworkTarget } from "@/lib/url-guard";

export const dynamic = "force-dynamic";

/**
 * Anonymous relay for the boxing/MMA sources.
 *
 * Its CDN answers only when the request carries the embed page as `Referer`,
 * which the browser cannot send, so the playlist and every segment travel
 * through here. The upstream URL and referer arrive sealed inside `?t=`; the
 * route refuses tokens it did not mint, and rewrites each playlist reference
 * into another sealed token so the provider host never reaches the page.
 */

const UPSTREAM_TIMEOUT_MS = 30_000;

const EMBED_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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
  const params = new URL(request.url).searchParams;
  const sealed = openCombatToken(params.get("t") ?? "");
  if (!sealed) return new Response("Invalid stream reference", { status: 400 });

  let upstream: URL;
  try {
    upstream = new URL(sealed.url);
  } catch {
    return new Response("Invalid stream reference", { status: 400 });
  }
  if (upstream.protocol !== "https:" || isBlockedNetworkTarget(upstream)) {
    return new Response("Stream host not allowed", { status: 403 });
  }

  try {
    const headers: Record<string, string> = {
      "User-Agent": EMBED_USER_AGENT,
      Accept: "*/*",
      Referer: sealed.referer,
    };
    const range = request.headers.get("range");
    if (range) headers.Range = range;

    const upstreamRes = await fetch(upstream, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!upstreamRes.ok) {
      // A missing asset is a dead signal, not an error the player can retry.
      const status = upstreamRes.status === 403 || upstreamRes.status === 404 ? 503 : upstreamRes.status;
      return new Response("Stream unavailable", { status });
    }

    const contentType = (upstreamRes.headers.get("content-type") ?? "").toLowerCase();
    const isPlaylist =
      upstream.pathname.toLowerCase().endsWith(".m3u8") || contentType.includes("mpegurl");

    if (isPlaylist) {
      const body = await upstreamRes.text();
      const trimmed = body.trim().replace(/^\uFEFF/, "");
      if (!trimmed.startsWith("#EXTM3U")) {
        return new Response("Stream unavailable", { status: 503 });
      }
      const finalUrl = upstreamRes.url ? new URL(upstreamRes.url) : upstream;
      return new Response(rewriteCombatPlaylist(body, finalUrl, sealed.referer), {
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
    console.warn("[combat] relay failed:", error);
    return new Response("Stream unavailable", { status: 502 });
  }
}
