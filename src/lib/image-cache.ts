/**
 * Shared in-memory cache for badge images.
 * Used by /api/img (serving) and /api/matches (prefetching).
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_CACHE_ENTRIES = 500;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 2 * 1024 * 1024;

const imageCache = new Map<string, { bytes: ArrayBuffer; contentType: string; expiresAt: number }>();

export function getCachedImage(key: string) {
  const entry = imageCache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry;
  if (entry) imageCache.delete(key);
  return null;
}

export function setCachedImage(key: string, bytes: ArrayBuffer, contentType: string) {
  imageCache.set(key, { bytes, contentType, expiresAt: Date.now() + CACHE_TTL_MS });
  if (imageCache.size > MAX_CACHE_ENTRIES) {
    const oldest = imageCache.keys().next().value;
    if (oldest) imageCache.delete(oldest);
  }
}

/**
 * Fetch an image from upstream and store it in the shared cache.
 * Used for prefetching badges when the match list is built.
 * Failures are silent — the image will be fetched on demand later.
 */
export async function prefetchImage(target: string): Promise<void> {
  const cached = getCachedImage(target);
  if (cached) return;

  try {
    const upstream = await fetch(target, {
      headers: { "User-Agent": "goltv-libre/1.0", Accept: "image/*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
      redirect: "follow",
    });
    if (!upstream.ok) return;

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return;

    const contentType = upstream.headers.get("content-type") ?? "image/png";
    setCachedImage(target, bytes, contentType);
  } catch {
    // Silent — image will be fetched on demand later.
  }
}
