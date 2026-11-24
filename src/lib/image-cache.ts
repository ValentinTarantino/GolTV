/**
 * Shared in-memory cache for badge images.
 * Used by /api/img (serving) and /api/matches (prefetching).
 *
 * In-flight upstream fetches are deduplicated: when /api/matches prefetches
 * a crest and the browser hits /api/img before it finishes, both await the
 * same promise instead of issuing two upstream requests.
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_CACHE_ENTRIES = 500;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 2 * 1024 * 1024;
// Badges render at ~28-48px; 128px covers 3x DPR with headroom. Anything
// larger is wasted bytes through the relay.
const MAX_DIMENSION = 128;

interface ImageEntry {
  bytes: ArrayBuffer;
  contentType: string;
  expiresAt: number;
}

const imageCache = new Map<string, ImageEntry>();
const inflight = new Map<string, Promise<ImageEntry | null>>();

export function getCachedImage(key: string): ImageEntry | null {
  const entry = imageCache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry;
  if (entry) imageCache.delete(key);
  return null;
}

/**
 * Downscales and re-encodes raster badges as WebP. SVGs and decode failures
 * pass through untouched so a bad upstream can never blank a crest.
 *
 * `sharp` is a native module: on runtimes without it (Cloudflare Workers)
 * the dynamic import fails and the original bytes are served as-is.
 */
async function optimizeBadge(
  bytes: ArrayBuffer,
  contentType: string
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  if (!contentType.startsWith("image/") || contentType.includes("svg")) {
    return { bytes, contentType };
  }
  try {
    const { default: sharp } = await import("sharp");
    const out = await sharp(Buffer.from(bytes))
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
    return { bytes: ab, contentType: "image/webp" };
  } catch {
    return { bytes, contentType };
  }
}

async function fetchUpstream(target: string): Promise<ImageEntry | null> {
  // One retry — CDN hiccups are common and badges are cheap to refetch.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const upstream = await fetch(target, {
        headers: { "User-Agent": "goltv-libre/1.0", Accept: "image/*" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
        redirect: "follow",
      });
      if (!upstream.ok) {
        if (attempt === 0) continue;
        return null;
      }

      const bytes = await upstream.arrayBuffer();
      if (bytes.byteLength > MAX_BYTES) return null;

      const contentType = upstream.headers.get("content-type") ?? "image/png";
      const optimized = await optimizeBadge(bytes, contentType);

      return {
        bytes: optimized.bytes,
        contentType: optimized.contentType,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
    } catch {
      if (attempt === 0) continue;
      return null;
    }
  }
  return null;
}

/**
 * Returns the cached entry or awaits the shared in-flight fetch.
 * Concurrent callers for the same URL share one upstream request.
 */
export function loadImage(target: string): Promise<ImageEntry | null> {
  const cached = getCachedImage(target);
  if (cached) return Promise.resolve(cached);

  let pending = inflight.get(target);
  if (!pending) {
    pending = fetchUpstream(target)
      .then((entry) => {
        if (entry) {
          imageCache.set(target, entry);
          if (imageCache.size > MAX_CACHE_ENTRIES) {
            const oldest = imageCache.keys().next().value;
            if (oldest) imageCache.delete(oldest);
          }
        }
        return entry;
      })
      .finally(() => {
        inflight.delete(target);
      });
    inflight.set(target, pending);
  }
  return pending;
}

/**
 * Warm the cache for an upstream image URL. Non-http targets (local badge
 * paths) are ignored. Failures are silent — the image is fetched on demand.
 */
export function prefetchImage(target: string): void {
  if (!target.startsWith("http")) return;
  loadImage(target).catch(() => {});
}
