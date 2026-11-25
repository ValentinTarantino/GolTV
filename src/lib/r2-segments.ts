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

/**
 * `after()` keeps the populate alive past the response, but importing
 * next/server statically breaks non-Next environments (jest/jsdom has no
 * Request global), so it is required lazily. The populate promise already
 * runs on its own either way — `after` only extends its lifetime.
 */
function scheduleAfter(promise: Promise<unknown>): void {
  if (process.env.JEST_WORKER_ID) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { after } = require("next/server") as typeof import("next/server");
    after(() => promise);
  } catch {
    // Outside a request scope: the promise already runs detached.
  }
}

const MEDIA_CDN_BASE = (process.env.MEDIA_CDN_BASE ?? "").trim().replace(/\/+$/, "");
const SEG_POPULATE_URL = (process.env.SEG_POPULATE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

/**
 * True when R2 segment delivery is enabled. Both variables are required:
 * without the populate URL the bucket would never fill and every segment
 * would 404, so the feature stays off until both are configured.
 */
export function r2SegmentsEnabled(): boolean {
  return MEDIA_CDN_BASE.length > 0 && SEG_POPULATE_URL.length > 0;
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

/** Populate calls in flight — playlist routes await them before responding. */
const pendingPopulates = new Set<Promise<void>>();
/** Image populates tracked separately: badge routes only wait for these, so
 * a busy live match's segment uploads never slow down /api/matches. */
const pendingImagePopulates = new Set<Promise<void>>();

/**
 * Asks the relay worker to fetch the segment upstream and store it in R2.
 * The returned promise resolves once the worker answered; playlist routes
 * await `settleSegmentPopulates` so viewers never receive an R2 URL for an
 * object that is not stored yet. Failures clear the dedup entry so the next
 * playlist poll retries the populate.
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
    fetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(20_000) })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          console.warn(`[r2-segments] populate ${kind} -> ${res.status} ${detail}`.trim());
          triggered.delete(dedupKey);
        }
      })
      .catch((error) => {
        console.warn(`[r2-segments] populate ${kind} failed:`, error);
        triggered.delete(dedupKey);
      });
  const promise = job();
  const pending = kind === "img" ? pendingImagePopulates : pendingPopulates;
  pending.add(promise);
  promise.finally(() => pending.delete(promise));
  scheduleAfter(promise);
}

/**
 * Waits for in-flight populates, bounded by `timeoutMs`. Playlist routes call
 * this after rewriting so the emitted R2 URLs point at stored objects; on
 * timeout the populate still finishes via `after()` and later polls retry.
 */
export async function settleSegmentPopulates(timeoutMs = 8000): Promise<void> {
  if (pendingPopulates.size === 0) return;
  const snapshot = [...pendingPopulates];
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled(snapshot),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Same bounded wait, scoped to image populates only (badges are tiny). */
export async function settleImagePopulates(timeoutMs = 5000): Promise<void> {
  if (pendingImagePopulates.size === 0) return;
  const snapshot = [...pendingImagePopulates];
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled(snapshot),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}
