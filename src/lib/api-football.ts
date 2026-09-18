import { API_FOOTBALL_BASE, SUPPORTED_LEAGUES, getBroadcastChannels } from "./constants";
import type { Match, MatchStatusShort } from "./types";

const API_KEY = process.env.API_FOOTBALL_KEY || "";

const headers: HeadersInit = {
  "x-apisports-key": API_KEY,
};

/* ─── API-Football Response Types ─── */

interface APIFixture {
  fixture: {
    id: number;
    date: string;
    timestamp: number;
    status: {
      short: string;
      long: string;
      elapsed: number | null;
    };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
    season: number;
  };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
}

interface APIResponse<T> {
  response: T;
  errors: Record<string, string> | string[];
  results: number;
}

/* ─── Helpers ─── */

function makeSlug(name: string): string {
  const found = SUPPORTED_LEAGUES.find((l) => l.id === 0);
  if (found) return found.slug;

  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getSlugForLeague(leagueId: number, leagueName: string): string {
  const known = SUPPORTED_LEAGUES.find((l) => l.id === leagueId);
  if (known) return known.slug;
  return makeSlug(leagueName);
}

function mapStatus(apiStatus: string): MatchStatusShort {
  const validStatuses: MatchStatusShort[] = [
    "NS", "1H", "HT", "2H", "ET", "BT", "P", "FT", "AET", "PEN",
    "SUSP", "INT", "PST", "CANC", "ABD", "AWD", "WO", "LIVE", "TBD",
  ];
  if (validStatuses.includes(apiStatus as MatchStatusShort)) {
    return apiStatus as MatchStatusShort;
  }
  return "NS";
}

function fixtureToMatch(fixture: APIFixture): Match {
  const status = mapStatus(fixture.fixture.status.short);
  
  const knownLeague = SUPPORTED_LEAGUES.find((l) => l.id === fixture.league.id);

  return {
    id: fixture.fixture.id,
    league: {
      id: fixture.league.id,
      name: knownLeague ? knownLeague.name : fixture.league.name,
      country: fixture.league.country,
      logo: fixture.league.logo,
      flag: fixture.league.flag || "",
      slug: getSlugForLeague(fixture.league.id, fixture.league.name),
    },
    homeTeam: {
      id: fixture.teams.home.id,
      name: fixture.teams.home.name,
      logo: fixture.teams.home.logo,
    },
    awayTeam: {
      id: fixture.teams.away.id,
      name: fixture.teams.away.name,
      logo: fixture.teams.away.logo,
    },
    date: fixture.fixture.date,
    timestamp: fixture.fixture.timestamp,
    status: {
      short: status,
      long: fixture.fixture.status.long,
      elapsed: fixture.fixture.status.elapsed,
    },
    score: {
      home: fixture.goals.home,
      away: fixture.goals.away,
    },
    channels: [],
    broadcastChannels: getBroadcastChannels(fixture.league.id),
  };
}

/* ─── Public API Functions ─── */

export async function fetchMatchesByDate(date: string): Promise<Match[]> {
  try {
    const url = new URL("/fixtures", API_FOOTBALL_BASE);
    url.searchParams.set("date", date);
    // Force Argentina timezone so late night Latam matches don't slip into the next UTC day
    url.searchParams.set("timezone", "America/Argentina/Buenos_Aires");

    const res = await fetch(url.toString(), {
      headers,
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      console.warn(`API-Football error: ${res.status} ${res.statusText} — showing no matches`);
      return [];
    }

    const data: APIResponse<APIFixture[]> = await res.json();

    // Handle API errors (rate limit, etc.)
    if (data.errors && Object.keys(data.errors).length > 0) {
      const errorMsg = Object.values(data.errors).join(", ");
      console.warn(`API-Football limit reached: ${errorMsg}`);
      return [];
    }

    if (!data.response || data.response.length === 0) {
      return [];
    }

    const supportedIds = new Set(SUPPORTED_LEAGUES.map((l) => l.id));
    const filtered = data.response.filter((f) => supportedIds.has(f.league.id));

    const allMatches = filtered.map(fixtureToMatch);
    
    // Sort so prioritized/supported leagues are first, then alphabetical by league name
    allMatches.sort((a, b) => {
      const aSupported = supportedIds.has(a.league.id) ? 1 : 0;
      const bSupported = supportedIds.has(b.league.id) ? 1 : 0;
      if (aSupported !== bSupported) return bSupported - aSupported;
      return a.league.name.localeCompare(b.league.name);
    });

    return allMatches;
  } catch (error) {
    console.error("Failed to fetch from API-Football:", error);
    return [];
  }
}



export function fetchLeagues() {
  return SUPPORTED_LEAGUES;
}

export async function getMatchById(matchId: number): Promise<Match | undefined> {
  try {
    const url = new URL("/fixtures", API_FOOTBALL_BASE);
    url.searchParams.set("id", String(matchId));

    const res = await fetch(url.toString(), {
      headers,
      next: { revalidate: 300 },
    });

    if (res.ok) {
      const data: APIResponse<APIFixture[]> = await res.json();
      if (data.response && data.response.length > 0) {
        return fixtureToMatch(data.response[0]);
      }
    }
  } catch (error) {
    console.error("Failed to fetch match by id:", error);
  }

  return undefined;
}
