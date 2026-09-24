import type { Channel, Match, MatchStatusShort } from "./types";
import { getTeamLogo } from "./team-logos";

const STREAM_API_BASE = "https://football-live-stream-api.p.rapidapi.com";
const RAPID_API_KEY = process.env.RAPIDAPI_KEY || "";

/** Returns the stream URL directly (no proxy) */
function toClientStreamUrl(streamUrl: string): string {
  return streamUrl;
}

/** Unwrap nested ?url= wrappers (e.g. football-live-stream.online/?url=CDN.m3u8). */
export function unwrapNestedStreamUrl(raw: string): string {
  let current = raw;
  for (let i = 0; i < 4; i++) {
    try {
      const parsed = new URL(current);
      const nested = parsed.searchParams.get("url");
      if (!nested || !/^https?:\/\//i.test(nested)) break;
      current = nested;
    } catch {
      break;
    }
  }
  return current;
}

function preferPlayUrl(raw: string): string {
  if (/football-live-stream\.online/i.test(raw)) return raw;
  const unwrapped = unwrapNestedStreamUrl(raw);
  if (unwrapped.includes(".m3u8") || /^https?:\/\//i.test(unwrapped)) {
    return `https://football-live-stream.online/?url=${encodeURIComponent(unwrapped)}`;
  }
  return raw;
}

interface StreamMatch {
  id: string;
  league: string;
  home_name: string;
  away_name: string;
  home_flag?: string;
  away_flag?: string;
  status: string;
  score: string;
  date?: string;
}

let lastFailureTime = 0;
const COOLDOWN_MS = 5 * 60 * 1000;

let streamDailyCount = 0;
let streamDailyDate = "";
/** Conservative daily cap to avoid RapidAPI suspensions */
const STREAM_DAILY_LIMIT = 35;

export function getStreamUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const count = streamDailyDate === today ? streamDailyCount : 0;
  return { used: count, limit: STREAM_DAILY_LIMIT, date: today };
}

// Stream URLs stay valid ~30 min; cache longer to cut /link calls
const STREAM_URL_TTL_MS = 10 * 60 * 1000;
const streamUrlCache = new Map<string, { url: string; expiresAt: number }>();

export function clearStreamUrlCache(streamId?: string): void {
  if (streamId) {
    streamUrlCache.delete(streamId);
    return;
  }
  streamUrlCache.clear();
}

// all-match list: longer TTL = fewer billable RapidAPI calls
const ALL_MATCH_TTL_MS = 5 * 60 * 1000;
let allMatchCache: { matches: StreamMatch[]; expiresAt: number } | null = null;

/** In-flight dedupe so concurrent requests share one upstream call */
let allMatchInflight: Promise<StreamMatch[]> | null = null;
const streamUrlInflight = new Map<string, Promise<string | null>>();

const LEAGUE_ID_MAP: Record<string, number> = {
  "conmebol copa libertadores": 13,
  "copa libertadores": 13,
  "conmebol copa sudamericana": 11,
  "copa sudamericana": 11,
  "uefa champions league": 2,
  "champions league": 2,
  "uefa europa league": 3,
  "europa league": 3,
  "uefa nations league": 5,
  "nations league": 5,
  "concacaf nations league": 6,
  "concacaf champions league": 7,
  "concacaf champions cup": 7,
  "english premier league": 39,
  "premier league": 39,
  "spanish la liga": 140,
  "la liga": 140,
  "argentine division 1": 128,
  "liga profesional": 128,
  "copa de la liga": 1032,
  "copa argentina": 130,
  "chilean primera division": 265,
  "liga de primera": 265,
  "copa chile": 267,
  "liga betplay": 239,
  "colombian primera": 239,
  "primera division colombiana": 239,
  "brazilian serie a": 71,
  "brasileirao": 71,
  "copa do brasil": 73,
  "peruvian primera division": 281,
  "liga 1 peru": 281,
  "copa peru": 503,
  "copa perú": 503,
  "paraguayan division profesional": 250,
  "division profesional": 250,
  "copa paraguay": 501,
  "uruguayan primera division": 268,
  "liga auf": 268,
  "copa uruguay": 930,
};

/**
 * RapidAPI live extras must match one of these competitions exactly-ish.
 * Substring "premier league" / "liga 1" is too broad (Belarus, Poland, Jordan…).
 */
const STREAM_LEAGUE_PATTERNS: RegExp[] = [
  /\blibertadores\b/,
  /\bsudamericana\b/,
  /\b(uefa\s+)?champions league\b/,
  /\b(uefa\s+)?europa league\b/,
  /\b(uefa\s+)?nations league\b/,
  /\bnations league\b/,
  /\bconcacaf\s+nations league\b/,
  /\bconcacaf\s+champions( league| cup)?\b/,
  /\bspanish la liga\b/,
  /\bla liga\b/,
  /\benglish premier( league)?\b/,
  /^premier league$/,
  /\bliga profesional\b/,
  /\bcopa argentina\b/,
  /\bcopa de la liga\b/,
  /\bargentine\b/,
  /\bargentina\b/,
  /\bchilean\b/,
  /\bchile\b/,
  /\bliga de primera\b/,
  /\bcopa chile\b/,
  /\bliga betplay\b/,
  /\bbetplay\b/,
  /\bcolombian\b/,
  /\bcolombia\b/,
  /\bprimera division\b.*\bcolombia\b|\bcolombia\b.*\bprimera division\b/,
  /\bbrazil(ian)?\b/,
  /\bbrasil(eir\w*)?\b/,
  /\bcopa do brasil\b/,
  /\bperuvian\b/,
  /\bperu\b/,
  /\bliga 1\b.*\bperu\b|\bperu\b.*\bliga 1\b/,
  /\bcopa peru\b/,
  /\bparaguayan\b/,
  /\bparaguay\b/,
  /\bdivision profesional\b/,
  /\bcopa paraguay\b/,
  /\buruguayan\b/,
  /\buruguay\b/,
  /\bliga auf\b/,
  /\bcopa uruguay\b/,
];

export function isAllowedStreamLeague(leagueName: string): boolean {
  const lower = leagueName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (
    /\b(belarus|azerbaijan|armenia|jordan|kazakhstan|poland|polish|mexico|liga mx|italian|italy|germany|german|france|french|concacaf|asian|russia|scottish|irish|maltese|israel)\b/.test(
      lower
    )
  ) {
    return false;
  }

  // "Premier League" alone = Inglaterra. Cualquier "X Premier League" queda fuera.
  if (lower.includes("premier") && !/\benglish premier/.test(lower) && lower !== "premier league") {
    return false;
  }

  return STREAM_LEAGUE_PATTERNS.some((re) => re.test(lower));
}

const TEAM_STOPWORDS = new Set([
  "fc", "cf", "sc", "ac", "afc", "cfc", "club", "de", "la", "el", "los", "las",
  "the", "united", "city", "real", "sporting", "deportivo", "cd", "ud", "ca",
  "sa", "as", "ss", "fk", "sk", "bk", "if", "vs",
]);

/**
 * Stable numeric id in 800_000_000–899_999_999 so it won't collide with
 * typical API-Football fixture ids, and never uses Math.random().
 */
export function stableStreamMatchId(streamId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < streamId.length; i++) {
    hash ^= streamId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 800_000_000 + ((hash >>> 0) % 100_000_000);
}

function resolveLeagueId(leagueName: string): number {
  const normalized = leagueName.toLowerCase().trim();
  if (LEAGUE_ID_MAP[normalized]) return LEAGUE_ID_MAP[normalized];
  for (const [key, id] of Object.entries(LEAGUE_ID_MAP)) {
    if (normalized === key) return id;
    // Don't map "Belarusian Premier League" → English Premier via includes()
    if (key === "premier league" || key === "liga 1") continue;
    if (normalized.includes(key)) return id;
  }
  // Stable negative-ish bucket by name hash so different unknown leagues don't merge as id 0
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  return -1_000_000 - (Math.abs(hash) % 900_000);
}

export const PLACEHOLDER_TEAM_LOGO =
  "https://media.api-sports.io/football/teams/40.png";

export function getLeagueLogo(leagueName: string): string {
  const leagueId = resolveLeagueId(leagueName);
  // Only known mapped leagues get an API-Sports logo (avoids wrong Libertadores icon)
  if (leagueId > 0) {
    return `https://media.api-sports.io/football/leagues/${leagueId}.png`;
  }
  return "";
}

export function isValidHlsManifest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/<!DOCTYPE|<html|<head|<body/i.test(trimmed)) return false;
  if (/%3C!DOCTYPE|%3Chtml|403%20Forbidden/i.test(trimmed)) return false;
  // Require real HLS tags — bare URL lists from broken proxies are not valid
  return trimmed.startsWith("#EXTM3U") || /\n#EXT/m.test(trimmed) || trimmed.includes("\n#EXT");
}

function playableCandidates(raw: string): string[] {
  const unwrapped = unwrapNestedStreamUrl(raw);
  const candidates: string[] = [];

  // Prefer their CORS/referer proxy when present — CDNs often require it
  if (/football-live-stream\.online/i.test(raw)) {
    candidates.push(raw);
  }
  if (unwrapped !== raw) {
    if (unwrapped.includes(".m3u8")) {
      candidates.push(
        `https://football-live-stream.online/?url=${encodeURIComponent(unwrapped)}`
      );
    }
    candidates.push(unwrapped);
  }
  if (!candidates.includes(raw)) candidates.push(raw);

  return [...new Set(candidates)];
}

async function pickPlayableStreamUrl(raw: string): Promise<string | null> {
  for (const candidate of playableCandidates(raw)) {
    try {
      const res = await fetch(candidate, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
          Referer: "https://football-live-stream.online/",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (isValidHlsManifest(text)) return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function isInCooldown(): boolean {
  return Date.now() - lastFailureTime < COOLDOWN_MS;
}

function canCallStreamAPI(): boolean {
  if (isInCooldown()) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (streamDailyDate !== today) {
    streamDailyDate = today;
    streamDailyCount = 0;
  }
  return streamDailyCount < STREAM_DAILY_LIMIT;
}

function markRateLimited(): void {
  lastFailureTime = Date.now();
  console.warn("[stream] Rate limited — cooling down for 5 min");
}

async function fetchAllMatches(): Promise<StreamMatch[]> {
  const now = Date.now();

  if (allMatchCache && now < allMatchCache.expiresAt) {
    return allMatchCache.matches;
  }

  if (allMatchInflight) return allMatchInflight;

  if (!canCallStreamAPI()) {
    // Serve stale cache if we have it rather than hammering the API
    if (allMatchCache) return allMatchCache.matches;
    return [];
  }

  allMatchInflight = (async () => {
    try {
      const res = await fetch(`${STREAM_API_BASE}/all-match`, {
        headers: {
          "X-RapidAPI-Key": RAPID_API_KEY,
          "X-RapidAPI-Host": "football-live-stream-api.p.rapidapi.com",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        if (res.status === 429) markRateLimited();
        return allMatchCache?.matches ?? [];
      }

      streamDailyCount++;
      const data = await res.json();
      const matches: StreamMatch[] = data.result || [];
      allMatchCache = { matches, expiresAt: Date.now() + ALL_MATCH_TTL_MS };
      return matches;
    } finally {
      allMatchInflight = null;
    }
  })();

  return allMatchInflight;
}

async function fetchStreamUrl(matchId: string): Promise<string | null> {
  const now = Date.now();

  const cached = streamUrlCache.get(matchId);
  if (cached && now < cached.expiresAt) {
    return cached.url || null;
  }

  const inflight = streamUrlInflight.get(matchId);
  if (inflight) return inflight;

  if (!canCallStreamAPI()) {
    return cached?.url ?? null;
  }

  const promise = (async () => {
    try {
      const res = await fetch(`${STREAM_API_BASE}/link/${matchId}`, {
        headers: {
          "X-RapidAPI-Key": RAPID_API_KEY,
          "X-RapidAPI-Host": "football-live-stream-api.p.rapidapi.com",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        if (res.status === 429) markRateLimited();
        return cached?.url ?? null;
      }

      streamDailyCount++;
      const data = await res.json();

      let raw: string | null = null;
      if (typeof data?.url === "string" && data.url.length > 0) {
        raw = data.url;
      } else if (Array.isArray(data?.url) && data.url.length > 0) {
        raw = data.url[0];
      } else if (typeof data?.result?.url === "string" && data.result.url.length > 0) {
        raw = data.result.url;
      } else if (Array.isArray(data?.result?.url) && data.result.url.length > 0) {
        raw = data.result.url[0];
      }

      if (!raw) {
        console.warn(`[stream] No URL in RapidAPI response for matchId=${matchId}`);
        return null;
      }

      // Prefer a validated candidate when the CDN is healthy; otherwise still
      // return the wrapper URL so the player can retry (avoid empty "no streams").
      const validated = await pickPlayableStreamUrl(raw);
      const url = validated || preferPlayUrl(raw);
      if (!validated) {
        console.warn(
          `[stream] HLS precheck failed for matchId=${matchId}; serving URL for client retry`
        );
      }
      streamUrlCache.set(matchId, { url, expiresAt: Date.now() + STREAM_URL_TTL_MS });
      return url;
    } finally {
      streamUrlInflight.delete(matchId);
    }
  })();

  streamUrlInflight.set(matchId, promise);
  return promise;
}

export function normalizeTeamName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function significantTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length > 2 && !TEAM_STOPWORDS.has(t));
}

/** Require a strong match: exact/contains, or ≥2 significant token hits (1 if only one token). */
export function teamsMatch(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length >= 5 && longer.includes(shorter)) return true;

  const tokensA = significantTokens(a);
  const tokensB = significantTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  let hits = 0;
  for (const ta of tokensA) {
    for (const tb of tokensB) {
      if (ta === tb) {
        hits++;
        break;
      }
      if (ta.length >= 5 && tb.length >= 5 && (ta.includes(tb) || tb.includes(ta))) {
        hits++;
        break;
      }
    }
  }

  const needed = Math.min(tokensA.length, tokensB.length) >= 2 ? 2 : 1;
  return hits >= needed;
}

export function matchTeamsPair(
  homeA: string,
  awayA: string,
  homeB: string,
  awayB: string
): boolean {
  return (
    (teamsMatch(homeA, homeB) && teamsMatch(awayA, awayB)) ||
    (teamsMatch(homeA, awayB) && teamsMatch(awayA, homeB))
  );
}

export async function fetchLiveStreamMatches(): Promise<Match[]> {
  if (!RAPID_API_KEY) {
    console.warn("[stream] RAPIDAPI_KEY not configured");
    return [];
  }
  if (isInCooldown()) {
    console.warn("[stream] In cooldown — returning cached/empty live list");
    // Still serve from all-match cache if available (no new API call)
  }

  try {
    const matches = await fetchAllMatches();
    const liveMatches = matches.filter((m) => m.status === "Live");
    const filteredMatches = liveMatches.filter((m) => isAllowedStreamLeague(m.league));

    const matchesWithLogos = await Promise.all(
      filteredMatches.map(async (m) => {
        const scoreParts = m.score.split(" - ").map(Number);
        const leagueId = resolveLeagueId(m.league);
        const [homeLogo, awayLogo] = await Promise.all([
          getTeamLogo(m.home_name),
          getTeamLogo(m.away_name),
        ]);

        return {
          id: stableStreamMatchId(m.id),
          league: {
            id: leagueId,
            name: m.league,
            country: "Internacional",
            logo: getLeagueLogo(m.league),
            flag: "",
            slug: m.league.toLowerCase().replace(/\s+/g, "-"),
          },
          homeTeam: {
            id: 0,
            name: m.home_name,
            logo: m.home_flag || homeLogo || PLACEHOLDER_TEAM_LOGO,
          },
          awayTeam: {
            id: 0,
            name: m.away_name,
            logo: m.away_flag || awayLogo || PLACEHOLDER_TEAM_LOGO,
          },
          date: m.date || new Date().toISOString(),
          timestamp: Math.floor(Date.now() / 1000),
          status: { short: "LIVE" as MatchStatusShort, long: "En Juego", elapsed: null },
          score: { home: scoreParts[0] || 0, away: scoreParts[1] || 0 },
          channels: [],
          _streamId: m.id,
        };
      })
    );

    return matchesWithLogos;
  } catch (error) {
    console.warn("Failed to fetch live stream matches:", error);
    return [];
  }
}

export async function getStreamMatchMeta(streamId: string): Promise<StreamMatch | null> {
  const matches = await fetchAllMatches();
  return matches.find((m) => m.id === streamId) ?? null;
}

export async function getStreamsForMatch(
  homeTeam: string,
  awayTeam: string,
  matchId?: string
): Promise<Channel[]> {
  if (!RAPID_API_KEY) {
    console.warn("[stream] RAPIDAPI_KEY not configured");
    return [];
  }
  if (isInCooldown() && !matchId) {
    // Without a direct id we'd need /all-match; skip to protect quota
    console.warn("[stream] In cooldown — skipping name-based stream lookup");
    return [];
  }

  try {
    // Prefer direct ID: one /link call (cached), never /all-match
    if (matchId) {
      const url = await fetchStreamUrl(matchId);
      if (url) {
        return [{ id: "stream-0", name: `${homeTeam} vs ${awayTeam}`, url: toClientStreamUrl(url) }];
      }
      return [];
    }

    const matches = await fetchAllMatches();
    const match = matches.find((m) =>
      matchTeamsPair(m.home_name || "", m.away_name || "", homeTeam, awayTeam)
    );

    if (match) {
      const url = await fetchStreamUrl(match.id);
      if (url) {
        return [{ id: "stream-0", name: `${homeTeam} vs ${awayTeam}`, url: toClientStreamUrl(url) }];
      }
    }
  } catch (error) {
    console.warn("Failed to fetch streams:", error);
  }

  return [];
}
