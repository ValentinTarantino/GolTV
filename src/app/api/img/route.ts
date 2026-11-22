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

export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const target = openImageToken(token);
  if (!target || !isProxiedImageHost(target)) {
    return new Response("Invalid image reference", { status: 400 });
  }

  try {
    const upstream = await fetch(target, {
      headers: { "User-Agent": "goltv-libre/1.0", Accept: "image/*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
    if (!upstream.ok) {
      return new Response("Image unavailable", { status: 404 });
    }

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return new Response("Image too large", { status: 502 });
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/png",
        // Badges are static assets; cache aggressively at the edge/browser.
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}
