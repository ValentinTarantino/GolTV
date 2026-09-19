import { API_FOOTBALL_BASE, SUPPORTED_LEAGUES, getBroadcastChannels } from "./constants";
import type { Match, MatchStatusShort } from "./types";

/* ─── Multi-Key Manager ─── */

const PER_KEY_DAILY_LIMIT = 70;
const COOLDOWN_MS = 5 * 60 * 1000;

interface KeyState {
  key: string;
  callCount: number;
  cooldownUntil: number;
  lastResetDate: string;
  suspended: boolean;
}

const rawKeys = (process.env.API_FOOTBALL_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

const keyStates: KeyState[] = rawKeys.map((key) => ({
  key,
  callCount: 0,
  cooldownUntil: 0,
  lastResetDate: "",
  suspended: false,
}));

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function resetIfNeeded(state: KeyState): void {
  const today = todayStr();
  if (state.lastResetDate !== today) {
    state.lastResetDate = today;
    state.callCount = 0;
    state.cooldownUntil = 0;
  }
}

function isKeyAvailable(state: KeyState): boolean {
  if (state.suspended) return false;
  resetIfNeeded(state);
  if (Date.now() < state.cooldownUntil) return false;
  return state.callCount < PER_KEY_DAILY_LIMIT;
}

function getAvailableKey(): string | null {
  for (const state of keyStates) {
    if (isKeyAvailable(state)) return state.key;
  }
  return null;
}

function incrementKey(key: string): void {
  const state = keyStates.find((s) => s.key === key);
  if (state) state.callCount++;
}

function markKeyFailed(key: string): void {
  const state = keyStates.find((s) => s.key === key);
  if (state) {
    state.cooldownUntil = Date.now() + COOLDOWN_MS;
    console.warn(`[api-football] Key ...${key.slice(-4)} rate limited — cooldown 5 min`);
  }
}

function markKeyExhausted(key: string): void {
  const state = keyStates.find((s) => s.key === key);
  if (state) {
    state.callCount = PER_KEY_DAILY_LIMIT;
    console.warn(`[api-football] Key ...${key.slice(-4)} daily limit reached`);
  }
}

function markKeySuspended(key: string): void {
  const state = keyStates.find((s) => s.key === key);
  if (state) {
    state.suspended = true;
    console.error(`[api-football] Key ...${key.slice(-4)} SUSPENDED — will not be used again`);
  }
}

export function getApiFootballUsage() {
  return keyStates.map((s) => ({
    key: `...${s.key.slice(-4)}`,
    used: s.callCount,
    limit: PER_KEY_DAILY_LIMIT,
    suspended: s.suspended,
    cooldown: Date.now() < s.cooldownUntil,
  }));
}

/* ─── Cache ─── */

const MATCH_BY_ID_TTL_MS = 2 * 60 * 1000;
const matchByIdCache = new Map<number, { match: Match; expiresAt: number }>();
const matchByIdInflight = new Map<number, Promise<Match | undefined>>();

const DATE_MATCHES_TTL_MS = 90 * 1000;
const dateMatchesCache = new Map<string, { matches: Match[]; expiresAt: number }>();
const dateMatchesInflight = new Map<string, Promise<Match[]>>();

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

/* ─── Key Rotation Fetch ─── */

async function fetchWithKeyRotation(
  url: string,
  fetchOptions: RequestInit
): Promise<Response> {
  const triedKeys = new Set<string>();
  let rotated = false;

  for (let attempt = 0; attempt < keyStates.length; attempt++) {
    const key = getAvailableKey();
    if (!key) break;
    if (triedKeys.has(key)) break;
    if (rotated) {
      console.log(`[api-football] Rotating to key ...${key.slice(-4)}`);
    }
    triedKeys.add(key);

    const res = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...fetchOptions.headers,
        "x-apisports-key": key,
      },
    });

    if (res.status === 429) {
      markKeyFailed(key);
      rotated = true;
      continue;
    }

    const cloned = res.clone();
    const data: APIResponse<APIFixture[]> = await cloned.json().catch(() => null);

    if (data?.errors && Object.keys(data.errors).length > 0) {
      const errorMsg = Object.values(data.errors).join(", ");
      if (errorMsg.includes("suspended")) {
        markKeySuspended(key);
        rotated = true;
        continue;
      }
      if (errorMsg.includes("request limit")) {
        markKeyExhausted(key);
        rotated = true;
        continue;
      }
      markKeyFailed(key);
      rotated = true;
      continue;
    }

    incrementKey(key);
    return res;
  }

  return new Response(JSON.stringify({ response: [], errors: {}, results: 0 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function anyKeyAvailable(): boolean {
  return getAvailableKey() !== null;
}

/* ─── Public API Functions ─── */

export async function fetchMatchesByDate(date: string): Promise<Match[]> {
  const now = Date.now();
  const cached = dateMatchesCache.get(date);
  if (cached && now < cached.expiresAt) {
    return cached.matches;
  }

  const inflight = dateMatchesInflight.get(date);
  if (inflight) return inflight;

  if (!anyKeyAvailable()) {
    console.warn(
      `[api-football] All keys exhausted — serving stale/empty for date=${date}`
    );
    return cached?.matches ?? [];
  }

  const promise = (async () => {
    try {
      const url = new URL("/fixtures", API_FOOTBALL_BASE);
      url.searchParams.set("date", date);
      url.searchParams.set("timezone", "America/Argentina/Buenos_Aires");

      const res = await fetchWithKeyRotation(url.toString(), {
        next: { revalidate: 1800 },
      });

      const data: APIResponse<APIFixture[]> = await res.json();

      if (data.errors && Object.keys(data.errors).length > 0) {
        console.warn(`API-Football errors:`, data.errors);
        return cached?.matches ?? [];
      }

      if (!data.response || data.response.length === 0) {
        dateMatchesCache.set(date, { matches: [], expiresAt: Date.now() + DATE_MATCHES_TTL_MS });
        return [];
      }

      const supportedIds = new Set(SUPPORTED_LEAGUES.map((l) => l.id));
      const filtered = data.response.filter((f) => supportedIds.has(f.league.id));

      const allMatches = filtered.map(fixtureToMatch);

      allMatches.sort((a, b) => {
        const aSupported = supportedIds.has(a.league.id) ? 1 : 0;
        const bSupported = supportedIds.has(b.league.id) ? 1 : 0;
        if (aSupported !== bSupported) return bSupported - aSupported;
        return a.league.name.localeCompare(b.league.name);
      });

      dateMatchesCache.set(date, {
        matches: allMatches,
        expiresAt: Date.now() + DATE_MATCHES_TTL_MS,
      });
      return allMatches;
    } catch (error) {
      console.error("Failed to fetch from API-Football:", error);
      return cached?.matches ?? [];
    } finally {
      dateMatchesInflight.delete(date);
    }
  })();

  dateMatchesInflight.set(date, promise);
  return promise;
}

export function fetchLeagues() {
  return SUPPORTED_LEAGUES;
}

export async function getMatchById(matchId: number): Promise<Match | undefined> {
  const now = Date.now();
  const cached = matchByIdCache.get(matchId);
  if (cached && now < cached.expiresAt) {
    return cached.match;
  }

  const inflight = matchByIdInflight.get(matchId);
  if (inflight) return inflight;

  if (!anyKeyAvailable()) {
    console.warn(
      `[api-football] All keys exhausted — serving stale/empty for id=${matchId}`
    );
    return cached?.match;
  }

  const promise = (async () => {
    try {
      const url = new URL("/fixtures", API_FOOTBALL_BASE);
      url.searchParams.set("id", String(matchId));

      const res = await fetchWithKeyRotation(url.toString(), {
        next: { revalidate: 1800 },
      });

      const data: APIResponse<APIFixture[]> = await res.json();

      if (data.errors && Object.keys(data.errors).length > 0) {
        console.warn(`API-Football errors for match ${matchId}:`, data.errors);
        return cached?.match;
      }

      if (data.response && data.response.length > 0) {
        const match = fixtureToMatch(data.response[0]);
        matchByIdCache.set(matchId, {
          match,
          expiresAt: Date.now() + MATCH_BY_ID_TTL_MS,
        });
        return match;
      }
    } catch (error) {
      console.error("Failed to fetch match by id:", error);
    } finally {
      matchByIdInflight.delete(matchId);
    }

    return cached?.match;
  })();

  matchByIdInflight.set(matchId, promise);
  return promise;
}
