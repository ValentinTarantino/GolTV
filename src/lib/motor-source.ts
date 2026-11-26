import { getCache, setCache } from "./cache";
import { listMotorsportMatches } from "./player-six-source";

/**
 * Motorsport agenda: the provider's motorsport section lists broadcast
 * sessions (practice, qualifying, races) as single-title events. Each
 * event carries its own matchId, which resolves streams through the same
 * signed feed the team sports use.
 */

const LIST_CACHE = "motor:events:v1";
const LIST_TTL = 60_000;

// A session runs ~1-2h (practice/qualifying shorter, races longer). Past
// this window the card is certainly done even if the provider keeps it.
const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000;

export interface MotorsportEvent {
  id: number;
  title: string;
  league: string;
  country: string;
  sport: string;
  sportName: string;
  startsAt: string;
  timestamp: number;
  status: "live" | "upcoming" | "finished";
}

export async function listMotorsportEvents(): Promise<MotorsportEvent[]> {
  const cached = await getCache<MotorsportEvent[]>(LIST_CACHE);
  if (cached) return cached;
  try {
    const events = await listMotorsportMatches();
    const now = Date.now();
    const matches: MotorsportEvent[] = events.map((e) => ({
      id: e.matchId,
      title: e.title,
      league: e.league,
      country: e.country,
      sport: "motorsport",
      sportName: e.league,
      startsAt: e.kickoffMs ? new Date(e.kickoffMs).toISOString() : "",
      timestamp: e.kickoffMs,
      status:
        e.kickoffMs > now
          ? "upcoming"
          : now - e.kickoffMs <= LIVE_WINDOW_MS
            ? "live"
            : "finished",
    }));
    await setCache(LIST_CACHE, matches, LIST_TTL);
    return matches;
  } catch (error) {
    console.warn("[motor] event list failed:", error);
    return [];
  }
}

export async function findMotorsportEvent(id: number): Promise<MotorsportEvent | null> {
  const matches = await listMotorsportEvents();
  return matches.find((m) => m.id === id) ?? null;
}
