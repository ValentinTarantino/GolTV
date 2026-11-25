import { getViewersCollection, type ViewerDoc } from "./mongo";

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
// Throttle bookkeeping: "matchId:viewerId" -> last write attempt
const lastTouchWrite = new Map<string, number>();

export const VIEWER_HEARTBEAT_MS = HEARTBEAT_INTERVAL_MS;

export interface ActiveViewer {
  matchId: string;
  viewerId: string;
  nick: string | null;
  lastSeen: number;
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
      .project<ViewerDoc>({ matchId: 1, viewerId: 1, nick: 1, lastSeen: 1, _id: 0 })
      .sort({ lastSeen: -1 })
      .limit(2000)
      .toArray();
    return docs.map((d) => ({
      matchId: d.matchId,
      viewerId: d.viewerId,
      nick: d.nick ?? null,
      lastSeen: d.lastSeen,
    }));
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
    out.push({
      matchId: key.slice(0, sep),
      viewerId: key.slice(sep + 1),
      nick: memoryNicks.get(key) ?? null,
      lastSeen: ts,
    });
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
    if (ts < cutoff) memoryViewers.delete(key);
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
export async function heartbeatViewer(matchId: string, viewerId: string): Promise<number> {
  const now = Date.now();
  const collection = await getViewersCollection();

  if (!collection) {
    memoryViewers.set(memoryKey(matchId, viewerId), now);
    return memoryCount(matchId);
  }

  try {
    await collection.updateOne(
      { matchId, viewerId },
      { $set: { lastSeen: now } },
      { upsert: true }
    );
    return await collection.countDocuments({
      matchId,
      lastSeen: { $gte: now - ACTIVE_WINDOW_MS },
    });
  } catch {
    // fall through to the in-memory fallback
    memoryViewers.set(memoryKey(matchId, viewerId), now);
    return memoryCount(matchId);
  }
}

/**
 * Registers a viewer from ambient traffic (no dedicated heartbeat). Only
 * refreshes `lastSeen` — never counts — and writes at most once per
 * TOUCH_THROTTLE_MS per viewer+scope. Safe to call on every hot request.
 */
export async function touchViewer(matchId: string, viewerId: string, nick?: string): Promise<void> {
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
    return;
  }

  try {
    await collection.updateOne(
      { matchId, viewerId },
      { $set: { lastSeen: now, ...(nick ? { nick } : {}) } },
      { upsert: true }
    );
  } catch {
    memoryViewers.set(memoryKey(matchId, viewerId), now);
    if (nick) memoryNicks.set(key, nick);
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
