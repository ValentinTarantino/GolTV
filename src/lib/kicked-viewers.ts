import { getCache, setCache } from "./cache";
import { getDb } from "./mongo";

/**
 * Kicked viewer ids: viewers the admin sent to `about:blank` from the
 * panel. Unlike banned IPs this targets the anonymous viewer cookie
 * (`gt_vid`), so it survives NATs/shared IPs and does not punish anyone
 * else on the same address. Persisted in Mongo (`config` collection) so a
 * redeploy does not silently un-kick everyone.
 */

const KICKED_CONFIG_KEY = "kicked_viewers";
const KICKED_CACHE_KEY = "viewers:kicked";
const KICKED_CACHE_TTL_MS = 15_000;
const MAX_KICKED = 5_000;

interface KickedDoc {
  key?: string;
  viewerIds?: unknown;
}

async function readKickedFromDb(): Promise<string[] | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const doc = await db.collection<KickedDoc>("config").findOne({ key: KICKED_CONFIG_KEY });
    if (!doc || !Array.isArray(doc.viewerIds)) return doc ? [] : null;
    return doc.viewerIds.filter((id): id is string => typeof id === "string");
  } catch {
    return null;
  }
}

async function writeKickedToDb(ids: Set<string>): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db
      .collection("config")
      .updateOne({ key: KICKED_CONFIG_KEY }, { $set: { viewerIds: Array.from(ids) } }, { upsert: true });
  } catch {
    // Memory cache still holds the list for this instance.
  }
}

async function getKickedViewerIds(): Promise<Set<string>> {
  const cached = await getCache<string[]>(KICKED_CACHE_KEY);
  if (cached) return new Set(cached);

  const fromDb = await readKickedFromDb();
  const ids = fromDb ?? [];
  await setCache(KICKED_CACHE_KEY, ids, KICKED_CACHE_TTL_MS);
  return new Set(ids);
}

async function saveKickedViewerIds(ids: Set<string>): Promise<void> {
  await Promise.all([
    setCache(KICKED_CACHE_KEY, Array.from(ids), 24 * 60 * 60 * 1000),
    writeKickedToDb(ids),
  ]);
}

export async function isViewerKicked(viewerId: string | null | undefined): Promise<boolean> {
  if (!viewerId) return false;
  const kicked = await getKickedViewerIds();
  return kicked.has(viewerId);
}

export async function kickViewer(viewerId: string): Promise<void> {
  if (!viewerId) return;
  const kicked = await getKickedViewerIds();
  if (kicked.size >= MAX_KICKED) kicked.delete(kicked.values().next().value as string);
  kicked.add(viewerId);
  await saveKickedViewerIds(kicked);
}

export async function unkickViewer(viewerId: string): Promise<void> {
  if (!viewerId) return;
  const kicked = await getKickedViewerIds();
  if (!kicked.delete(viewerId)) return;
  await saveKickedViewerIds(kicked);
}

export async function getKickedViewerIdList(): Promise<string[]> {
  const kicked = await getKickedViewerIds();
  return Array.from(kicked);
}
