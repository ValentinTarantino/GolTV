import type { Channel } from "./types";
import { getCache, setCache, acquireLock, releaseLock } from "./cache";
import { isAllowedStreamUrl, toHlsProxyUrl } from "./hls-proxy";
import { sealLpfUrl } from "./sealed-url";
import { matchTeamsPair } from "./team-matching";

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

function toClientStreamUrl(streamUrl: string): { url: string; kind: "hls" | "iframe" } {
  // Providers wrap the real playlist in a page URL (e.g. ?url=<m3u8>).
  // Unwrap it: an m3u8 on an allowlisted host plays through our own HLS
  // player — full controls and fullscreen — instead of a cropped iframe.
  const unwrapped = unwrapNestedStreamUrl(streamUrl);
  const candidate = unwrapped.includes(".m3u8") ? unwrapped : streamUrl;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "https:" && isAllowedStreamUrl(parsed)) {
      return { url: toHlsProxyUrl(candidate), kind: "hls" };
    }
  } catch {
    // not an absolute URL — treat as iframe
  }
  // Non-HLS or unallowed host: HTML proxy (ad removal, URL rewriting).
  try {
    return { url: `/api/proxy?t=${sealLpfUrl(streamUrl)}`, kind: "iframe" };
  } catch {
    // Fallback without LPF_PROXY_SECRET.
    return { url: `/api/proxy?url=${encodeURIComponent(streamUrl)}`, kind: "iframe" };
  }
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
        const stream = toClientStreamUrl(url);
        return [{ id: "stream-0", name: `${homeTeam} vs ${awayTeam}`, url: stream.url, kind: stream.kind }];
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
        const stream = toClientStreamUrl(url);
        return [{ id: "stream-0", name: `${homeTeam} vs ${awayTeam}`, url: stream.url, kind: stream.kind }];
      }
    }
  } catch (error) {
    console.warn("Failed to fetch streams:", error);
  }

  return [];
}
