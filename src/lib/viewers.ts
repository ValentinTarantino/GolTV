import { getViewersCollection } from "./mongo";

const ACTIVE_WINDOW_MS = 45_000; // viewer counted if heartbeat < 45s ago
const HEARTBEAT_INTERVAL_MS = 15_000;

// In-memory fallback (no MONGODB_URI): matchId:viewerId -> lastSeen
const memoryViewers = new Map<string, number>();

export const VIEWER_HEARTBEAT_MS = HEARTBEAT_INTERVAL_MS;

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

  if (collection) {
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
    }
  }

  memoryViewers.set(memoryKey(matchId, viewerId), now);
  return memoryCount(matchId);
}

/** Active viewers for a match without registering the caller. */
export async function getViewerCount(matchId: string): Promise<number> {
  const now = Date.now();
  const collection = await getViewersCollection();

  if (collection) {
    try {
      return await collection.countDocuments({
        matchId,
        lastSeen: { $gte: now - ACTIVE_WINDOW_MS },
      });
    } catch {
      // fall through to the in-memory fallback
    }
  }

  return memoryCount(matchId);
}
