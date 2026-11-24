import { getViewersCollection } from "./mongo";

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
// Throttle bookkeeping: "matchId:viewerId" -> last write attempt
const lastTouchWrite = new Map<string, number>();

export const VIEWER_HEARTBEAT_MS = HEARTBEAT_INTERVAL_MS;

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
export async function touchViewer(matchId: string, viewerId: string): Promise<void> {
  const key = `${matchId}:${viewerId}`;
  const now = Date.now();
  if (now - (lastTouchWrite.get(key) ?? 0) < TOUCH_THROTTLE_MS) return;
  lastTouchWrite.set(key, now);
  pruneTouchWrites();

  const collection = await getViewersCollection();
  if (!collection) {
    memoryViewers.set(memoryKey(matchId, viewerId), now);
    return;
  }

  try {
    await collection.updateOne(
      { matchId, viewerId },
      { $set: { lastSeen: now } },
      { upsert: true }
    );
  } catch {
    memoryViewers.set(memoryKey(matchId, viewerId), now);
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
