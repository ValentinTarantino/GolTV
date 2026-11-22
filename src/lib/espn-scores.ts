import { matchTeamsPair } from "./team-matching";

/**
 * Live scores from ESPN's public scoreboard API — no key, no documented rate
 * limit. Used to fill score/minute/status on fixture matches so the card shows
 * the real match state instead of only "En Juego".
 *
 * One request per league slug per TTL window; failures are cached briefly so a
 * dead slug does not get hammered by every poll.
 */

const SCOREBOARD_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const CACHE_TTL_MS = 20_000;
const FETCH_TIMEOUT_MS = 8_000;

/** Our league id -> ESPN scoreboard slugs (a league can span two comps). */
const LEAGUE_SLUGS: Record<number, string[]> = {
  128: ["arg.1"], // Liga Profesional
  129: ["arg.2", "arg.3"], // Primera Nacional (Nacional B + Primera B)
  130: ["arg.copaargentina"], // Copa Argentina
  71: ["bra.1"], // Brasileirão
  73: ["bra.copa_do_brazil"], // Copa do Brasil
  268: ["uru.1"], // Liga AUF Uruguaya
  265: ["chi.1"], // Campeonato Nacional (Chile)
  267: ["chi.copa_chile"], // Copa Chile
  239: ["col.1"], // Liga BetPlay
  281: ["per.1"], // Liga 1 Perú
  57: ["ecu.1"], // Liga Pro Ecuador
  255: ["par.1"], // Copa de Primera / Primera PY
  13: ["conmebol.libertadores"],
  11: ["conmebol.sudamericana"],
  2: ["uefa.champions"],
  3: ["uefa.europa"],
  140: ["esp.1"], // La Liga
  141: ["esp.2"], // Segunda División
  143: ["esp.copa_del_rey"],
  39: ["eng.1"], // Premier League
  78: ["ger.1"], // Bundesliga
  135: ["ita.1"], // Serie A
  332: ["usa.1"], // MLS
  18: ["concacaf.champions_cup"],
};

export interface EspnEvent {
  /** ISO date of the event (UTC). */
  date: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  /** Our status vocabulary: NS | 1H | HT | 2H | ET | FT */
  statusShort: string;
  /** "45+2" style clock, or null when there is no running clock. */
  elapsed: string | null;
}

interface CacheEntry {
  at: number;
  events: EspnEvent[];
}

const globalRef = globalThis as typeof globalThis & {
  __goltvEspnScores?: Map<string, CacheEntry>;
};

function cache(): Map<string, CacheEntry> {
  if (!globalRef.__goltvEspnScores) globalRef.__goltvEspnScores = new Map();
  return globalRef.__goltvEspnScores;
}

/** ESPN clock "90'+3'" -> our "90+3" (MatchCard appends the apostrophe). */
function normalizeClock(displayClock: unknown): string | null {
  if (typeof displayClock !== "string" || !displayClock.trim()) return null;
  const cleaned = displayClock.replace(/'\+/g, "+").replace(/'/g, "").trim();
  return cleaned || null;
}

function mapStatus(type: { name?: string; state?: string; completed?: boolean } | undefined, period: unknown): string {
  if (!type) return "NS";
  if (type.completed || type.state === "post") return "FT";
  if (type.state === "pre") return "NS";
  if (type.name === "STATUS_HALFTIME" || type.name === "STATUS_END_OF_REGULATION") return "HT";
  const p = typeof period === "number" ? period : Number(period) || 1;
  if (p >= 3) return "ET";
  return p === 1 ? "1H" : "2H";
}

interface RawEvent {
  date?: string;
  competitions?: {
    status?: { displayClock?: string; period?: number; type?: { name?: string; state?: string; completed?: boolean } };
    competitors?: { homeAway?: string; score?: string; team?: { displayName?: string } }[];
  }[];
}

function parseEvent(raw: RawEvent): EspnEvent | null {
  const comp = raw.competitions?.[0];
  const home = comp?.competitors?.find((c) => c.homeAway === "home");
  const away = comp?.competitors?.find((c) => c.homeAway === "away");
  if (!home?.team?.displayName || !away?.team?.displayName || !raw.date) return null;
  const toScore = (v: string | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    date: raw.date,
    home: home.team.displayName,
    away: away.team.displayName,
    homeScore: toScore(home.score),
    awayScore: toScore(away.score),
    statusShort: mapStatus(comp?.status?.type, comp?.status?.period),
    elapsed: normalizeClock(comp?.status?.displayClock),
  };
}

async function fetchSlug(slug: string): Promise<EspnEvent[]> {
  const store = cache();
  const hit = store.get(slug);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.events;

  try {
    const res = await fetch(`${SCOREBOARD_BASE}/${slug}/scoreboard`, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "goltv-libre/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { events?: RawEvent[] };
    const events = (data.events ?? [])
      .map(parseEvent)
      .filter((e): e is EspnEvent => e !== null);
    store.set(slug, { at: Date.now(), events });
    return events;
  } catch {
    // Keep stale data rather than nothing; empty on first failure.
    store.set(slug, { at: Date.now(), events: hit?.events ?? [] });
    return hit?.events ?? [];
  }
}

/** Slugs mapped to one league id (empty when ESPN does not cover it). */
export function espnSlugsForLeague(leagueId: number): string[] {
  return LEAGUE_SLUGS[leagueId] ?? [];
}

/** Slugs we may need for the leagues present in today's fixture. */
export function espnSlugsForLeagues(leagueIds: Iterable<number>): string[] {
  const slugs = new Set<string>();
  for (const id of leagueIds) {
    for (const slug of LEAGUE_SLUGS[id] ?? []) slugs.add(slug);
  }
  return [...slugs];
}

/** Fetches every slug once (parallel) and returns slug -> events. */
export async function loadEspnScoreboards(slugs: string[]): Promise<Map<string, EspnEvent[]>> {
  const entries = await Promise.all(
    slugs.map(async (slug) => [slug, await fetchSlug(slug)] as const)
  );
  return new Map(entries);
}

function argentinaDay(dateISO: string): string {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

/**
 * Finds the ESPN event for a fixture: same Argentine calendar day + both team
 * pairs matching (order-insensitive, via the shared fuzzy matcher).
 */
export function findEspnEvent(
  events: EspnEvent[],
  homeTeam: string,
  awayTeam: string,
  dateISO: string
): EspnEvent | null {
  const day = argentinaDay(dateISO);
  if (!day) return null;
  for (const event of events) {
    if (argentinaDay(event.date) !== day) continue;
    if (matchTeamsPair(homeTeam, awayTeam, event.home, event.away)) return event;
  }
  return null;
}
