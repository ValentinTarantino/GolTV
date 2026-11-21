import { getDb } from "./mongo";

/**
 * Admin-made ordering of the fixture categories (the league sections).
 *
 * The fixture list groups matches by competition in the order the groups first
 * appear, so sorting the array by a league rank is enough for every visitor —
 * home page, any poll, any instance — to see the same category order. The list
 * lives in Mongo (`config`) so it survives deploys; without Mongo the instance
 * keeps the last saved order in memory, which covers local dev and tests.
 */
const COLLECTION = "config";
const DOC_KEY = "league_order";
const CACHE_TTL_MS = 15_000;
const MAX_ENTRIES = 200;

interface OrderStore {
  order: number[];
  at: number;
}

const globalRef = globalThis as typeof globalThis & {
  __goltvLeagueOrder?: OrderStore;
};

interface OrderDoc {
  key?: string;
  order?: unknown;
}

/** Keeps only positive unique integer league ids, in order. */
export function sanitizeLeagueOrder(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const order: number[] = [];
  for (const entry of value) {
    const id = typeof entry === "number" ? entry : Number(entry);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    if (order.length >= MAX_ENTRIES) break;
  }
  return order;
}

/**
 * League rank map. Leagues missing from the list are unranked and keep their
 * natural (kickoff) order after the ranked ones.
 */
export function leagueRanks(order: number[]): (leagueId: number) => number {
  const ranks = new Map(order.map((id, index) => [id, index]));
  return (leagueId: number) => ranks.get(leagueId) ?? Number.MAX_SAFE_INTEGER;
}

async function readFromDb(): Promise<number[] | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const doc = await db.collection<OrderDoc>(COLLECTION).findOne({ key: DOC_KEY });
    if (!doc || doc.order === undefined) return [];
    return sanitizeLeagueOrder(doc.order);
  } catch {
    return null;
  }
}

/** Current category order. `force` re-reads Mongo (used before writing). */
export async function loadLeagueOrder(force = false): Promise<number[]> {
  const store = globalRef.__goltvLeagueOrder;
  if (!force && store && Date.now() - store.at < CACHE_TTL_MS) return store.order;

  const fromDb = await readFromDb();
  if (fromDb !== null) {
    globalRef.__goltvLeagueOrder = { order: fromDb, at: Date.now() };
    return fromDb;
  }
  // Mongo unavailable: keep serving what this instance already accepted.
  return store?.order ?? [];
}

/** Saves a new category order. An empty list restores the natural order. */
export async function saveLeagueOrder(value: unknown): Promise<number[]> {
  const order = sanitizeLeagueOrder(value);
  globalRef.__goltvLeagueOrder = { order, at: Date.now() };
  try {
    const db = await getDb();
    if (!db) return order;
    await db.collection(COLLECTION).updateOne(
      { key: DOC_KEY },
      { $set: { key: DOC_KEY, order, at: Date.now() } },
      { upsert: true }
    );
  } catch {
    /* the in-memory order is already updated */
  }
  return order;
}
