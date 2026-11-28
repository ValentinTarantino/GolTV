import { getCache, setCache } from "./cache";
import { listPrimaryMatches } from "./primary-player-source";

/**
 * Combat-sports agenda: events come from the provider's second feed
 * (`/api/v1/gsc/matches` — the same one futbolvivo.tv uses for its sport
 * filters). That feed carries clean sport codes (`mma`, `boxing`, `wwe`)
 * alongside team sports; anything that reads as combat is listed here.
 * Each event carries its feed `id`, which resolves its own signals.
 */

const LIST_CACHE = "combat:events:v5";
const LIST_TTL = 60_000;

// Combat keywords checked against sport, sport_name, league and title —
// providers label the same card differently across feeds.
const COMBAT_RE = /ufc|mma|box|combat|fight|pugil|muay|kick|wrestl|bellator|pfl|wwe|bare ?knuckle/i;
const TEAM_SPORT_RE = /futbol|soccer|football(?!.*fight)|basket|hockey|nhl|nba|nfl|mlb|tennis|tenis|baseball|motorsport|formula|f1|motogp|rugby|volley|handball|cricket|golf|darts|snooker/i;

function isCombatMatch(m: {
  sport?: string; sport_name?: string; league?: string; title?: string;
}): boolean {
  const haystack = `${m.sport ?? ""} ${m.sport_name ?? ""} ${m.league ?? ""} ${m.title ?? ""}`;
  if (TEAM_SPORT_RE.test(haystack) && !COMBAT_RE.test(m.sport ?? "")) return false;
  return COMBAT_RE.test(haystack);
}

export interface CombatMatch {
  id: number;
  title: string;
  sport: string;
  sportName: string;
  startsAt: string;
  timestamp: number;
  live: boolean;
  /** Raw `live` flag from the provider feed — `live` also counts kickoff. */
  feedLive: boolean;
  /** Raw `finished` flag from the provider feed. */
  feedFinished: boolean;
  finished: boolean;
  home?: string;
  away?: string;
}

/**
 * The gsc feed stores Argentina wall time encoded as UTC — the same
 * convention LPF uses (`LpfMatch.start`): "15:45Z" means 15:45 ART, i.e.
 * 18:45 UTC. Argentina has no DST, so the real instant is timestamp + 3h.
 * Verified against card times: Kabayel vs Hysa at 17:05 feed = 22:05 CET,
 * a normal German boxing main-event slot.
 */
const ART_WALL_AS_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

function feedInstant(m: { timestamp?: number; starts_at?: string }, now: number): number {
  const raw =
    typeof m.timestamp === "number" && Number.isFinite(m.timestamp)
      ? m.timestamp
      : m.starts_at
        ? Date.parse(m.starts_at)
        : NaN;
  return (Number.isFinite(raw) ? raw : now) + ART_WALL_AS_UTC_OFFSET_MS;
}

export async function listCombatMatches(): Promise<CombatMatch[]> {
  const cached = await getCache<CombatMatch[]>(LIST_CACHE);
  if (cached) return cached;
  try {
    const feed = await listPrimaryMatches("gsc");
    const now = Date.now();
    const matches: CombatMatch[] = feed
      .filter((m) => typeof m.id === "number" && isCombatMatch(m))
      .map((m) => {
        const timestamp = feedInstant(m, now);
        return {
        id: m.id as number,
        title: m.title || `${m.home?.name ?? ""} vs ${m.away?.name ?? ""}`.trim() || m.league || "Combate",
        sport: m.sport ?? "combat",
        sportName: m.sport_name || m.league || "Boxeo",
        startsAt: new Date(timestamp).toISOString(),
        timestamp,
        live: Boolean(m.live) || timestamp <= now,
        feedLive: Boolean(m.live),
        feedFinished: Boolean(m.finished),
        finished: false,
        home: m.home?.name,
        away: m.away?.name,
        };
      });
    matches.sort((a, b) => a.timestamp - b.timestamp);
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

/* ------------------------------------------------------------------ *
 * Recently finished events
 * ------------------------------------------------------------------ */

const RECENT_CACHE = "combat:recent:v1";
/** How long a feed-dropped event stays listed (and playable) as finished. */
export const COMBAT_RECENT_GRACE_MS = 3 * 60 * 60 * 1000;

interface RecentCombatEntry {
  match: CombatMatch;
  seenAt: number;
}

/**
 * The provider feed drops a card soon after the final whistle while the
 * broadcast (celebrations, interviews) keeps running. Every started event
 * seen in the feed is remembered; once it disappears it is revived as
 * finished for the grace window. Upcoming fixtures that vanish were
 * rescheduled, not finished, so they are never stored.
 */
export async function mergeRecentCombatMatches(matches: CombatMatch[]): Promise<CombatMatch[]> {
  const stored = (await getCache<Record<string, RecentCombatEntry>>(RECENT_CACHE)) ?? {};
  const now = Date.now();
  const next: Record<string, RecentCombatEntry> = {};
  const active = new Set(matches.map((m) => String(m.id)));
  for (const m of matches) {
    if (m.timestamp > now) continue;
    next[String(m.id)] = { match: m, seenAt: now };
  }
  const revived: CombatMatch[] = [];
  for (const [id, entry] of Object.entries(stored)) {
    if (active.has(id) || now - entry.seenAt > COMBAT_RECENT_GRACE_MS) continue;
    revived.push({ ...entry.match, live: false, finished: true });
    next[id] = entry;
  }
  await setCache(RECENT_CACHE, next, COMBAT_RECENT_GRACE_MS + 60_000);
  return [...matches, ...revived];
}

/** The stored entry for an event the feed no longer carries, if fresh. */
export async function findRecentCombatMatch(id: number): Promise<CombatMatch | null> {
  const stored = await getCache<Record<string, RecentCombatEntry>>(RECENT_CACHE);
  const entry = stored?.[String(id)];
  if (!entry || Date.now() - entry.seenAt > COMBAT_RECENT_GRACE_MS) return null;
  return { ...entry.match, live: false, finished: true };
}
