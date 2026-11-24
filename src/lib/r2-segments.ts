/**
 * R2-backed segment delivery.
 *
 * When `MEDIA_CDN_BASE` is set, media segment URIs inside playlists point at
 * the public R2 custom domain instead of the segment relay endpoints. Each segment
 * is pre-fetched into the bucket by the relay worker (`/api/populate`), so
 * viewers are served by the CDN/R2 layer and the worker's daily request quota
 * is only spent once per unique segment instead of once per viewer request.
 *
 * The object key is `v1/<kind>/<sha256(token)[:48]>` — identical on both
 * sides because segment tokens are deterministic per time bucket.
 */

import { createHash } from "node:crypto";
import { after } from "next/server";

const MEDIA_CDN_BASE = (process.env.MEDIA_CDN_BASE ?? "").trim().replace(/\/+$/, "");
const SEG_POPULATE_URL = (
  // workers.dev bypasses the zone's bot challenge, which blocks Render's
  // server-side fetches to goltv.stream/api/populate.
  process.env.SEG_POPULATE_URL ||
  "https://goltv-seg-relay.zaheil444.workers.dev/api/populate"
)
  .trim()
  .replace(/\/+$/, "");

/** True when R2 segment delivery is enabled for this deployment. */
export function r2SegmentsEnabled(): boolean {
  return MEDIA_CDN_BASE.length > 0;
}

/** Public URL of a segment object inside the R2 bucket. */
export function r2SegmentUrl(kind: string, token: string): string {
  const hex = createHash("sha256").update(token).digest("hex").slice(0, 48);
  return `${MEDIA_CDN_BASE}/v1/${kind}/${hex}`;
}

/**
 * Recently triggered populate keys, so playlist refreshes (every few seconds
 * per viewer) only fire one populate call per unique segment.
 */
const triggered = new Map<string, number>();
const TRIGGER_TTL_MS = 10 * 60 * 1000;
const TRIGGER_MAP_MAX = 5000;

/**
 * Asks the relay worker to fetch the segment upstream and store it in R2.
 * Fire-and-forget: failures are logged but never break playlist rewriting —
 * the worst case is the viewer hitting a not-yet-populated object and hls.js
 * retrying a moment later.
 */
export function triggerSegmentPopulate(kind: string, token: string): void {
  if (!SEG_POPULATE_URL || !MEDIA_CDN_BASE) return;
  const dedupKey = `${kind}:${token}`;
  const now = Date.now();
  const last = triggered.get(dedupKey);
  if (last !== undefined && now - last < TRIGGER_TTL_MS) return;
  if (triggered.size > TRIGGER_MAP_MAX) triggered.clear();
  triggered.set(dedupKey, now);

  const url = `${SEG_POPULATE_URL}?kind=${kind}&t=${encodeURIComponent(token)}`;
  const job = () =>
    fetch(url, { method: "GET", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          console.warn(`[r2-segments] populate ${kind} -> ${res.status} ${detail}`.trim());
        }
      })
      .catch((error) => {
        console.warn(`[r2-segments] populate ${kind} failed:`, error);
      });
  try {
    after(job);
  } catch {
    void job();
  }
}
