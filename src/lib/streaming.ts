import type { Channel, Match, MatchStatusShort } from "./types";
import { getTeamLogo } from "./team-logos";
import { getCache, setCache, acquireLock, releaseLock } from "./cache";

const STREAM_API_BASE = "https://football-live-stream-api.p.rapidapi.com";
const RAPID_API_KEY = process.env.RAPIDAPI_KEY || "";

const COOLDOWN_MS = 5 * 60 * 1000;
const STREAM_URL_TTL_MS = 10 * 60 * 1000;
const ALL_MATCH_TTL_MS = 5 * 60 * 1000;

const STREAM_COOLDOWN_KEY = "stream:cooldown:until";

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

function toClientStreamUrl(streamUrl: string): string {
  return streamUrl;
}

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

export function getStreamUsage() {
  const today = new Date().toISOString().slice(0, 10);
  return { used: 0, limit: 9999, date: today };
}

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

  if (lower.includes("premier") && !/\benglish premier/.test(lower) && lower !== "premier league") {
    return false;
  }

  return STREAM_LEAGUE_PATTERNS.some((re) => re.test(lower));
}

import { matchTeamsPair } from "./team-matching";

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
    if (key === "premier league" || key === "liga 1") continue;
    if (normalized.includes(key)) return id;
  }
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
  return trimmed.startsWith("#EXTM3U") || /\n#EXT/m.test(trimmed) || trimmed.includes("\n#EXT");
}

function playableCandidates(raw: string): string[] {
  const unwrapped = unwrapNestedStreamUrl(raw);
  const candidates: string[] = [];

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

async function isInCooldown(): Promise<boolean> {
  const cooldownUntil = await getCache<number>(STREAM_COOLDOWN_KEY);
  return cooldownUntil !== null && Date.now() < cooldownUntil;
}

async function canCallStreamAPI(): Promise<boolean> {
  // Only check cooldown, not daily limit (daily limit removed to prevent blocking streams)
  if (await isInCooldown()) return false;
  return true;
}

async function markRateLimited(): Promise<void> {
  await setCache(STREAM_COOLDOWN_KEY, Date.now() + COOLDOWN_MS, COOLDOWN_MS);
  console.warn("[stream] Rate limited — cooling down for 5 min");
}

async function fetchAllMatches(): Promise<StreamMatch[]> {
  const cacheKey = "stream:all-matches";

  const cached = await getCache<StreamMatch[]>(cacheKey);
  if (cached) return cached;

  const lockKey = `${cacheKey}:lock`;
  const lockAcquired = await acquireLock(lockKey, 10000);
  if (!lockAcquired) {
    const stale = await getCache<StreamMatch[]>(cacheKey);
    return stale ?? [];
  }

  if (!await canCallStreamAPI()) {
    await releaseLock(lockKey);
    const stale = await getCache<StreamMatch[]>(cacheKey);
    return stale ?? [];
  }

  try {
    const res = await fetch(`${STREAM_API_BASE}/all-match`, {
      headers: {
        "X-RapidAPI-Key": RAPID_API_KEY,
        "X-RapidAPI-Host": "football-live-stream-api.p.rapidapi.com",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      if (res.status === 429) await markRateLimited();
      await releaseLock(lockKey);
      const stale = await getCache<StreamMatch[]>(cacheKey);
      return stale ?? [];
    }

    const data = await res.json();
    const matches: StreamMatch[] = data.result || [];

    await setCache(cacheKey, matches, ALL_MATCH_TTL_MS);
    await releaseLock(lockKey);
    return matches;
  } catch (error) {
    console.warn("[stream] Failed to fetch all matches:", error);
    await releaseLock(lockKey);
    const stale = await getCache<StreamMatch[]>(cacheKey);
    return stale ?? [];
  }
}

async function fetchStreamUrl(matchId: string): Promise<string | null> {
  const cacheKey = `stream:url:${matchId}`;

  const cached = await getCache<string>(cacheKey);
  if (cached) return cached;

  const lockKey = `${cacheKey}:lock`;
  const lockAcquired = await acquireLock(lockKey, 10000);
  if (!lockAcquired) {
    const stale = await getCache<string>(cacheKey);
    return stale ?? null;
  }

  if (!await canCallStreamAPI()) {
    await releaseLock(lockKey);
    const stale = await getCache<string>(cacheKey);
    return stale ?? null;
  }

  try {
    const res = await fetch(`${STREAM_API_BASE}/link/${matchId}`, {
      headers: {
        "X-RapidAPI-Key": RAPID_API_KEY,
        "X-RapidAPI-Host": "football-live-stream-api.p.rapidapi.com",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      if (res.status === 429) await markRateLimited();
      await releaseLock(lockKey);
      const stale = await getCache<string>(cacheKey);
      return stale ?? null;
    }

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
      await releaseLock(lockKey);
      return null;
    }

    const validated = await pickPlayableStreamUrl(raw);
    const url = validated || preferPlayUrl(raw);
    if (!validated) {
      console.warn(
        `[stream] HLS precheck failed for matchId=${matchId}; serving URL for client retry`
      );
    }

    await setCache(cacheKey, url, STREAM_URL_TTL_MS);
    await releaseLock(lockKey);
    return url;
  } catch (error) {
    console.warn(`[stream] Failed to fetch stream URL for ${matchId}:`, error);
    await releaseLock(lockKey);
    const stale = await getCache<string>(cacheKey);
    return stale ?? null;
  }
}

export async function fetchLiveStreamMatches(): Promise<Match[]> {
  if (!RAPID_API_KEY) {
    console.warn("[stream] RAPIDAPI_KEY not configured");
    return [];
  }
  if (await isInCooldown()) {
    console.warn("[stream] In cooldown — returning cached/empty live list");
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
  if (await isInCooldown() && !matchId) {
    console.warn("[stream] In cooldown — skipping name-based stream lookup");
    return [];
  }

  try {
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

export function clearStreamUrlCache(): void {
  // No-op with Redis, but kept for API compatibility
}