import { getViewersCollection, type ViewerDoc } from "./mongo";
import type { ViewerMeta } from "./viewer-meta";

const ACTIVE_WINDOW_MS = 60_000; // viewer counted if heartbeat < 60s ago
const HEARTBEAT_INTERVAL_MS = 20_000;
// Presence is now inferred from requests the client already makes (chat
// polls, playlist reloads, agenda fetches). Writes are throttled per
// viewer+scope so a 4s playlist poll costs at most one Mongo write per
// TOUCH_THROTTLE_MS — well inside the 60s active window.
const TOUCH_THROTTLE_MS = 30_000;

export const SITE_PRESENCE_ID = "__site__";

// In-memory fallback (no MONGODB_URI): matchId:viewerId -> lastSeen
const memoryViewers = new Map<string, number>();
// Chat nicks learned from messages, keyed the same way (memory fallback only)
const memoryNicks = new Map<string, string>();
// Header metadata + firstSeen, keyed the same way (memory fallback only)
const memoryMeta = new Map<string, { meta: ViewerMeta; firstSeen: number }>();
// Throttle bookkeeping: "matchId:viewerId" -> last write attempt
const lastTouchWrite = new Map<string, number>();

export const VIEWER_HEARTBEAT_MS = HEARTBEAT_INTERVAL_MS;

export interface ActiveViewer {
  matchId: string;
  viewerId: string;
  nick: string | null;
  lastSeen: number;
  firstSeen: number | null;
  ip: string | null;
  country: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  lang: string | null;
  referrer: string | null;
}

function toActiveViewer(d: ViewerDoc): ActiveViewer {
  return {
    matchId: d.matchId,
    viewerId: d.viewerId,
    nick: d.nick ?? null,
    lastSeen: d.lastSeen,
    firstSeen: d.firstSeen ?? null,
    ip: d.ip ?? null,
    country: d.country ?? null,
    device: d.device ?? null,
    browser: d.browser ?? null,
    os: d.os ?? null,
    lang: d.lang ?? null,
    referrer: d.referrer ?? null,
  };
}

/**
 * Everyone active right now (site-wide `__site__` docs plus per-match
 * docs), most recent first. Admin panel only — never call on hot paths.
 */
export async function listActiveViewers(): Promise<ActiveViewer[]> {
  const now = Date.now();
  const cutoff = now - ACTIVE_WINDOW_MS;
  const collection = await getViewersCollection();

  if (!collection) return listActiveViewersMemoryFallback(cutoff);

  try {
    const docs = await collection
      .find<ViewerDoc>({ lastSeen: { $gte: cutoff } })
      .project<ViewerDoc>({
        matchId: 1,
        viewerId: 1,
        nick: 1,
        lastSeen: 1,
        firstSeen: 1,
        ip: 1,
        country: 1,
        device: 1,
        browser: 1,
        os: 1,
        lang: 1,
        referrer: 1,
        _id: 0,
      })
      .sort({ lastSeen: -1 })
      .limit(2000)
      .toArray();
    return docs.map(toActiveViewer);
  } catch {
    return listActiveViewersMemoryFallback(cutoff);
  }
}

function listActiveViewersMemoryFallback(cutoff: number): ActiveViewer[] {
  pruneMemory();
  const out: ActiveViewer[] = [];
  for (const [key, ts] of memoryViewers) {
    if (ts < cutoff) continue;
    const sep = key.indexOf(":");
    const meta = memoryMeta.get(key);
    const doc: ViewerDoc = {
      matchId: key.slice(0, sep),
      viewerId: key.slice(sep + 1),
      lastSeen: ts,
      nick: memoryNicks.get(key) ?? undefined,
      firstSeen: meta?.firstSeen,
      ...meta?.meta,
    };
    out.push(toActiveViewer(doc));
  }
  return out.sort((a, b) => b.lastSeen - a.lastSeen);
}

function pruneTouchWrites(): void {
  if (lastTouchWrite.size < 5_000) return;
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  for (const [key, ts] of lastTouchWrite) {
    if (ts < cutoff) lastTouchWrite.delete(key);
  }
}

function memoryKey(matchId: string, viewerId: string): string {
  return `${matchId}:${viewerId}`;
}

function pruneMemory(): void {
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  for (const [key, ts] of memoryViewers) {
    if (ts < cutoff) {
      memoryViewers.delete(key);
      memoryMeta.delete(key);
    }
  }
}

function memoryCount(matchId: string): number {
  pruneMemory();
  const prefix = `${matchId}:`;
  let count = 0;
  for (const key of memoryViewers.keys()) {
    if (key.startsWith(prefix)) count++;
  }
  return count;
}

/**
 * Registers/refreshes a viewer heartbeat for a match and returns the
 * current active-viewer count for that match.
 * Falls back to the in-memory map without MONGODB_URI (tests / local dev).
 */
export async function heartbeatViewer(
  matchId: string,
  viewerId: string,
  meta?: ViewerMeta
): Promise<number> {
  const now = Date.now();
  const collection = await getViewersCollection();

  if (!collection) {
    memoryViewers.set(memoryKey(matchId, viewerId), now);
    if (meta) rememberMeta(matchId, viewerId, meta, now);
    return memoryCount(matchId);
  }

  try {
    await collection.updateOne(
      { matchId, viewerId },
      {
        $set: { lastSeen: now, ...meta },
        $setOnInsert: { firstSeen: now },
      },
      { upsert: true }
    );
    return await collection.countDocuments({
      matchId,
      lastSeen: { $gte: now - ACTIVE_WINDOW_MS },
    });
  } catch {
    // fall through to the in-memory fallback
    memoryViewers.set(memoryKey(matchId, viewerId), now);
    if (meta) rememberMeta(matchId, viewerId, meta, now);
    return memoryCount(matchId);
  }
}

/** Memory-fallback counterpart of the Mongo `$setOnInsert: firstSeen`. */
function rememberMeta(matchId: string, viewerId: string, meta: ViewerMeta, now: number): void {
  const key = memoryKey(matchId, viewerId);
  const prev = memoryMeta.get(key);
  memoryMeta.set(key, {
    meta: { ...prev?.meta, ...meta },
    firstSeen: prev?.firstSeen ?? now,
  });
}

/**
 * Registers a viewer from ambient traffic (no dedicated heartbeat). Only
 * refreshes `lastSeen` — never counts — and writes at most once per
 * TOUCH_THROTTLE_MS per viewer+scope. Safe to call on every hot request.
 */
export async function touchViewer(
  matchId: string,
  viewerId: string,
  nick?: string,
  meta?: ViewerMeta
): Promise<void> {
  const key = `${matchId}:${viewerId}`;
  const now = Date.now();
  if (now - (lastTouchWrite.get(key) ?? 0) < TOUCH_THROTTLE_MS) {
    // Throttled writes still learn the nick locally so the admin list is
    // not stuck on "anonymous" until the next write window.
    if (nick) {
      const collection = await getViewersCollection();
      if (!collection) memoryNicks.set(key, nick);
      else {
        void collection
          .updateOne({ matchId, viewerId }, { $set: { nick } }, { upsert: false })
          .catch(() => {});
      }
    }
    return;
  }
  lastTouchWrite.set(key, now);
  pruneTouchWrites();

  const collection = await getViewersCollection();
  if (!collection) {
    memoryViewers.set(memoryKey(matchId, viewerId), now);
    if (nick) memoryNicks.set(key, nick);
    if (meta) rememberMeta(matchId, viewerId, meta, now);
    return;
  }

  try {
    await collection.updateOne(
      { matchId, viewerId },
      {
        $set: { lastSeen: now, ...(nick ? { nick } : {}), ...meta },
        $setOnInsert: { firstSeen: now },
      },
      { upsert: true }
    );
  } catch {
    memoryViewers.set(memoryKey(matchId, viewerId), now);
    if (nick) memoryNicks.set(key, nick);
    if (meta) rememberMeta(matchId, viewerId, meta, now);
  }
}

/** Active viewers for a match without registering the caller. */
export async function getViewerCount(matchId: string): Promise<number> {
  const now = Date.now();
  const collection = await getViewersCollection();

  if (!collection) {
    return memoryCount(matchId);
  }

  try {
    return await collection.countDocuments({
      matchId,
      lastSeen: { $gte: now - ACTIVE_WINDOW_MS },
    });
  } catch {
    // fall through to the in-memory fallback
    return memoryCount(matchId);
  }
}

/**
 * Removes a viewer immediately (player closed / navigated away) and returns
 * the remaining active-viewer count for that match.
 * Falls back to the in-memory map without MONGODB_URI (tests / local dev).
 */
export async function removeViewer(matchId: string, viewerId: string): Promise<number> {
  const now = Date.now();
  const collection = await getViewersCollection();

  if (!collection) {
    memoryViewers.delete(memoryKey(matchId, viewerId));
    return memoryCount(matchId);
  }

  try {
    await collection.deleteOne({ matchId, viewerId });
    return await collection.countDocuments({
      matchId,
      lastSeen: { $gte: now - ACTIVE_WINDOW_MS },
    });
  } catch {
    // fall through to the in-memory fallback
    memoryViewers.delete(memoryKey(matchId, viewerId));
    return memoryCount(matchId);
  }
}

/**
 * Drops every presence doc for a viewer across all matches (admin kick).
 * Ambient traffic will not re-add them: touchRequestPresence skips kicked
 * ids. Memory fallback removes all keys ending in `:${viewerId}`.
 */
export async function removeViewerEverywhere(viewerId: string): Promise<void> {
  const collection = await getViewersCollection();
  const suffix = `:${viewerId}`;

  if (!collection) {
    for (const key of [...memoryViewers.keys()]) {
      if (key.endsWith(suffix)) {
        memoryViewers.delete(key);
        memoryNicks.delete(key);
        memoryMeta.delete(key);
        lastTouchWrite.delete(key);
      }
    }
    return;
  }

  try {
    await collection.deleteMany({ viewerId });
  } catch {
    // best effort — presence docs expire on their own within ACTIVE_WINDOW_MS
  }
}
