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
import { openLpfUrl } from "./sealed-url";
import { openCanalToken } from "./streams";

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
/** Same worker reached through the zone route: workers.dev direct gets
 * connect-timeouts from some datacenter egress IPs (Render), while the
 * goltv.stream route rides the normal zone pipeline. */
const SEG_POPULATE_FALLBACK_URL = `${(
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://goltv.stream"
)
  .trim()
  .replace(/\/+$/, "")}/api/populate`;

/**
 * True when R2 segment delivery is enabled. Both variables are required:
 * without the populate URL the bucket would never fill and every segment
 * would 404, so the feature stays off until both are configured.
 */
export function r2SegmentsEnabled(): boolean {
  return MEDIA_CDN_BASE.length > 0 && SEG_POPULATE_URL.length > 0;
}

/** Populate endpoints to try, primary first, deduplicated. */
function populateUrls(kind: string, token: string): string[] {
  const qs = `kind=${kind}&t=${encodeURIComponent(token)}`;
  const urls = [
    SEG_POPULATE_URL ? `${SEG_POPULATE_URL}?${qs}` : "",
    `${SEG_POPULATE_FALLBACK_URL}?${qs}`,
  ].filter(Boolean);
  return [...new Set(urls)];
}

/** Public URL of a segment object inside the R2 bucket. */
export function r2SegmentUrl(kind: string, token: string): string {
  const hex = createHash("sha256").update(token).digest("hex").slice(0, 48);
  return `${MEDIA_CDN_BASE}/v1/${kind}/${hex}`;
}

/**
 * Populate outcome per segment key. Playlist rewrites emit deferred markers
 * and resolve them after `settleSegmentPopulates`: stored objects get the R2
 * URL, anything else falls back to the relay so viewers never hit a 404 that
 * the edge would cache for hours.
 */
const populateState = new Map<string, "pending" | "stored" | "failed">();

/** Outcome of the populate for a segment, if one was triggered. */
export function segmentPopulateState(
  kind: string,
  token: string
): "pending" | "stored" | "failed" | undefined {
  return populateState.get(`${kind}:${token}`);
}

export interface DeferredSegmentUrl {
  marker: string;
  kind: string;
  token: string;
  fallback: string;
}

/**
 * Triggers the populate and returns a placeholder that `resolveDeferredSegmentUrls`
 * swaps for the R2 or fallback URL once the populate settles.
 */
export function deferSegmentUrl(
  kind: string,
  token: string,
  fallback: string,
  list: DeferredSegmentUrl[]
): string {
  triggerSegmentPopulate(kind, token);
  const marker = `%%GTV_R2_${list.length}%%`;
  list.push({ marker, kind, token, fallback });
  return marker;
}

/** Replaces deferred markers with R2 URLs for stored objects, fallback otherwise. */
export function resolveDeferredSegmentUrls(
  body: string,
  list: DeferredSegmentUrl[]
): string {
  if (list.length === 0) return body;
  let out = body;
  for (const item of list) {
    const url =
      segmentPopulateState(item.kind, item.token) === "stored"
        ? r2SegmentUrl(item.kind, item.token)
        : item.fallback;
    out = out.split(item.marker).join(url);
  }
  return out;
}

/**
 * Absolute worker segment-relay URL used as the deferred fallback. Going
 * through the zone route (goltv.stream/api/hls/seg) instead of workers.dev
 * keeps browser and datacenter fetches on the normal pipeline; the worker
 * serves the segment from upstream or R2 with Cloudflare edge bandwidth.
 */
export function workerSegFallbackUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://goltv.stream")
    .trim()
    .replace(/\/+$/, "");
  return `${base}/api/hls/seg?t=${encodeURIComponent(token)}`;
}

/**
 * Recently triggered populate keys, so playlist refreshes (every few seconds
 * per viewer) only fire one populate call per unique segment.
 */
const triggered = new Map<string, number>();
const TRIGGER_TTL_MS = 10 * 60 * 1000;
const TRIGGER_MAP_MAX = 5000;
/** Consecutive transient populate failures per key — drives the retry backoff. */
const populateFailures = new Map<string, number>();
/** First retry delay after a transient failure; doubles per failure, capped at TRIGGER_TTL_MS. */
const RETRY_BASE_MS = 30 * 1000;

/** Populate calls in flight — playlist routes await them before responding. */
const pendingPopulates = new Set<Promise<void>>();
/** Image populates tracked separately: badge routes only wait for these, so
 * a busy live match's segment uploads never slow down /api/matches. */
const pendingImagePopulates = new Set<Promise<void>>();

/**
 * Asks the relay worker to fetch the segment upstream and store it in R2.
 * If R2 credentials are available, Render fetches and writes directly instead.
 * The returned promise resolves once the object is stored; playlist routes
 * await `settleSegmentPopulates` so viewers never receive an R2 URL for an
 * object that is not stored yet. Transient failures retry with exponential
 * backoff (30s → 10min cap) so a dead upstream is not hammered by every
 * playlist poll; permanent 4xx failures keep the normal dedup window.
 */
export function triggerSegmentPopulate(kind: string, token: string): void {
  if (!MEDIA_CDN_BASE) return;
  const dedupKey = `${kind}:${token}`;
  const now = Date.now();
  const last = triggered.get(dedupKey);
  if (last !== undefined && now - last < TRIGGER_TTL_MS) return;
  if (triggered.size > TRIGGER_MAP_MAX) {
    triggered.clear();
    populateState.clear();
    populateFailures.clear();
  }
  triggered.set(dedupKey, now);
  populateState.set(dedupKey, "pending");

  const job = async () => {
    // Fallback: populate via worker (if URL configured)
    if (!SEG_POPULATE_URL) {
      triggered.delete(dedupKey);
      populateState.delete(dedupKey);
      return;
    }

    let lastError: unknown = null;
    let permanentFail = false;
    for (const url of populateUrls(kind, token)) {
      try {
        const res = await fetch(url, {
          method: "GET",
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        });
        if (res.ok) {
          populateState.set(dedupKey, "stored");
          populateFailures.delete(dedupKey);
          return;
        }
        const detail = await res.text().catch(() => "");
        console.warn(`[r2-segments] populate ${kind} -> ${res.status} ${detail}`.trim());
        lastError = new Error(`populate ${res.status}`);
        // A reached-but-failed worker will fail the same on both URLs; only
        // transport errors and 5xx justify trying the next endpoint. A 4xx
        // is permanent (bad token, disallowed host): keep the dedup entry so
        // playlist polls do not spam the worker, and mark the segment failed
        // so playlists fall back to the relay URL.
        if (res.status < 500) {
          permanentFail = true;
          break;
        }
      } catch (error) {
        lastError = error;
      }
    }
    console.warn(`[r2-segments] populate ${kind} failed:`, lastError);
    populateState.set(dedupKey, "failed");
    if (!permanentFail) {
      // Exponential backoff: backdate the dedup entry so the key becomes
      // eligible again after the delay instead of on the next poll.
      const fails = (populateFailures.get(dedupKey) ?? 0) + 1;
      populateFailures.set(dedupKey, fails);
      const backoff = Math.min(RETRY_BASE_MS * 2 ** (fails - 1), TRIGGER_TTL_MS);
      triggered.set(dedupKey, Date.now() - TRIGGER_TTL_MS + backoff);
    }
  };
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
