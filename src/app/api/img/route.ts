/**
 * Badge image proxy.
 *
 * Team and league crests come from third-party CDNs whose hostnames identify
 * the data providers. The upstream URL arrives sealed inside `?t=` (same
 * AES-256-GCM scheme as the stream relay), so neither the query string nor
 * the network panel reveals the CDN host.
 *
 * Only an explicit allowlist of badge hosts is fetched; anything else is
 * rejected so the route can not be used as an open proxy.
 */

import { openImageToken, isProxiedImageHost } from "@/lib/public-url";
import { loadImage } from "@/lib/image-cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const target = openImageToken(token);
  if (!target || !isProxiedImageHost(target)) {
    return new Response("Invalid image reference", { status: 400 });
  }

  // Serves from memory cache, or awaits the shared in-flight fetch started
  // by /api/matches prefetching — no duplicate upstream request.
  const entry = await loadImage(target);
  if (!entry) {
    return new Response("Image unavailable", { status: 502 });
  }

  return new Response(entry.bytes, {
    status: 200,
    headers: {
      "Content-Type": entry.contentType,
      // Badges are static assets; cache aggressively at the edge/browser.
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
