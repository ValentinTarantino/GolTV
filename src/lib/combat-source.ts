import { getCache, setCache } from "./cache";
import { listFightingEvents } from "./player-six-source";

/**
 * Combat-sports agenda: the fighting section lists broadcast events
 * (Muay Thai shows, fight nights) rather than team-vs-team matches. Each
 * event carries its own slugs, which rebuild the provider's match-detail
 * URL — the page that owns the player.
 */

const LIST_CACHE = "combat:events:v1";
const LIST_TTL = 60_000;

export interface CombatMatch {
  id: number;
  title: string;
  sport: string;
  sportName: string;
  startsAt: string;
  timestamp: number;
  live: boolean;
  finished: boolean;
  home?: string;
  away?: string;
}

export async function listCombatMatches(): Promise<CombatMatch[]> {
  const cached = await getCache<CombatMatch[]>(LIST_CACHE);
  if (cached) return cached;
  try {
    const events = await listFightingEvents();
    const now = Date.now();
    const matches: CombatMatch[] = events.map((e) => ({
      id: e.matchId,
      title: e.title,
      sport: "fighting",
      sportName: "Lucha",
      startsAt: new Date(e.matchDate).toISOString(),
      timestamp: e.matchDate,
      live: e.matchDate > 0 && e.matchDate <= now,
      finished: false,
    }));
    await setCache(LIST_CACHE, matches, LIST_TTL);
    return matches;
  } catch (error) {
    console.warn("[combat] event list failed:", error);
    return [];
  }
}

export async function findCombatMatch(id: number): Promise<CombatMatch | null> {
  const matches = await listCombatMatches();
  return matches.find((m) => m.id === id) ?? null;
}
