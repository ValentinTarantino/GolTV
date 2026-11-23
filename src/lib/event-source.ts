import { cleanAgendaText, stripMatchStageSuffix } from "./agenda-text";
import type { Channel } from "./types";
import { getCache, setCache, deleteCache, acquireLock, releaseLock } from "./cache";
import { isMenFootballMatch } from "./constants";
import { matchTeamsPair } from "./team-matching";
import { canonicalTeamForDedup } from "./fixture-identity";
import { fetchTextWithDnsServer } from "./dns-fetch";
import { toHlsProxyUrl, isAllowedStreamUrl } from "./hls-proxy";

const NON_FOOTBALL_TEXT = /(nhl|nba|nfl|mlb|basketball|baseball|ice hockey|tennis|rugby|cricket|volleyball|handball|csgo|valorant|lol|league of legends|ufc|sports)/i;

const PL_BASE = process.env.EVENT_SOURCE_BASE!;
const PL_AGENDA_URL = process.env.EVENT_AGENDA_URL!;
const PL_PLAYBACK_URL = process.env.EVENT_PLAYBACK_URL!;
const PL_DNS_SERVER = process.env.EVENT_SOURCE_DNS_SERVER?.trim();

/**
 * Resolvers tried when the system DNS cannot resolve the agenda host.
 *
 * Some networks poison or drop this domain: the direct fetch throws
 * ENOTFOUND and every fixture of the agenda disappeared silently (the
 * Paraguayan Recoleta–Guaraní match was missing while the same club's Chilean
 * fixture still showed up from another source). `EVENT_SOURCE_DNS_SERVER`
 * overrides the list; public resolvers cover the poisoned-DNS case.
 */
const PL_DNS_FALLBACKS = PL_DNS_SERVER ? [PL_DNS_SERVER] : ["1.1.1.1", "8.8.8.8"];

const PL_COOLDOWN_MS = 5 * 60 * 1000;
const PL_STREAM_CACHE_TTL = 30 * 60 * 1000;
const PL_AGENDA_CACHE_TTL = 5 * 60 * 1000;

const PL_COOLDOWN_KEY = "pl:cooldown:until";
const PL_AGENDA_CACHE_KEY = "pl:agenda:v2";
// A dead agenda host must not be retried on every fixture poll: each failed
// attempt can burn the fetch timeout plus the DNS fallbacks. Mark the source
// down briefly and serve the stale list (or nothing) until it recovers.
const PL_AGENDA_DOWN_KEY = "pl:agenda:down:v1";
const PL_AGENDA_DOWN_TTL = 2 * 60 * 1000;

/**
 * streamxhd-style wrappers hide the media URL in an obfuscated `bc` array:
 * `bc=[[order,"base64"],…]` sorted by order, each chunk decoded as
 * `parseInt(digitsOnly(atob(chunk))) - k` where `k` is the sum of two
 * `function f(){return N}` constants referenced next to `bc.sort`.
 */
function decodeObfuscatedMediaUrl(html: string): string | null {
  const sortIdx = html.indexOf("bc.sort");
  if (sortIdx < 0) return null;
  const bcMatch = html.slice(0, sortIdx).match(/bc=(\[\[[\s\S]*?\]\])/);
  if (!bcMatch) return null;
  let pairs: [number, string][];
  try {
    pairs = JSON.parse(bcMatch[1]) as [number, string][];
  } catch {
    return null;
  }
  if (!Array.isArray(pairs) || pairs.length === 0) return null;

  const kExpr = html.match(/var k=(\w+)\(\)\s*\+\s*(\w+)\(\)/);
  if (!kExpr) return null;
  let k = 0;
  for (const name of [kExpr[1], kExpr[2]]) {
    const fn = html.match(new RegExp(`function ${name}\\(\\)\\s*\\{return (\\d+);?\\}`));
    if (!fn) return null;
    k += Number(fn[1]);
  }

  pairs.sort((a, b) => a[0] - b[0]);
  let out = "";
  for (const [, chunk] of pairs) {
    const decoded = Buffer.from(chunk, "base64").toString("latin1");
    const digits = decoded.replace(/\D/g, "");
    if (!digits) return null;
    out += String.fromCharCode(Number.parseInt(digits, 10) - k);
  }
  return /^https?:\/\//i.test(out) ? out : null;
}

/** Resolve provider wrapper pages to the actual media URL when exposed. */
async function resolvePlaybackUrl(url: string): Promise<{ url: string; kind: "hls" | "iframe" }> {
  if (/\.(m3u8|mp4)(?:\?|$)/i.test(url)) {
    return { url, kind: /\.m3u8(?:\?|$)/i.test(url) ? "hls" : "iframe" };
  }

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { url, kind: "iframe" };
    const html = await response.text();
    const media = html.match(/https?:[^"'\\s<>]+\.m3u8(?:\?[^"'\\s<>]*)?/i)?.[0];
    if (media) return { url: media.replace(/\\u0026/g, "&"), kind: "hls" };
    const obfuscated = decodeObfuscatedMediaUrl(html);
    if (obfuscated && /\.m3u8(?:\?|$)/i.test(obfuscated)) {
      // The stream token embeds the server IP — segments must be fetched
      // server-side through the HLS relay or the CDN rejects them.
      return { url: toHlsProxyUrl(obfuscated), kind: "hls" };
    }
    const nested = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
    if (nested) {
      const nestedUrl = new URL(nested, url).toString();
      if (nestedUrl !== url) return resolvePlaybackUrl(nestedUrl);
    }
  } catch {
    // Keep the provider page as a safe fallback when it blocks server inspection.
  }
  return { url, kind: "iframe" };
}

interface EventEmbed {
  id: string;
  name: string;
}

export interface EventMatch {
  slug: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  dateISO: string;
  sources: EventEmbed[];
}

const decodeHtmlEntities = cleanAgendaText;

export function parseAgendaHTML(html: string): EventMatch[] {
  const matches: EventMatch[] = [];
  const seenKeys = new Set<string>();

  const eventRegex = /<div[^>]*class="[^"]*source-agenda-event[^"]*"[^>]*data-source-instant="([^"]*)"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*source-agenda-event[^"]*"|<div class="[^"]*channels-title)/g;

  let eventMatch;
  while ((eventMatch = eventRegex.exec(html)) !== null) {
    const dateISO = eventMatch[1];
    const block = eventMatch[2];

    const competitionMatch = block.match(/<span[^>]*class="[^"]*source-agenda-competition[^"]*"[^>]*>([^<]*)<\/span>/);
    const league = decodeHtmlEntities(competitionMatch ? competitionMatch[1].trim().replace(/:$/, "") : "Desconocido");
    const textMatch = block.match(/<span[^>]*class="[^"]*source-agenda-eventtext[^"]*"[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>/);
    if (!textMatch) continue;
    const titleText = decodeHtmlEntities((textMatch[1] || "").replace(/<[^>]*>/g, " "));
    const titleSignal = `${league} ${titleText}`;
    if (!isMenFootballMatch(league, titleText) || NON_FOOTBALL_TEXT.test(titleSignal)) continue;

    const strongHTML = textMatch[1];
    const teamsText = decodeHtmlEntities(
      strongHTML
        .replace(/<span[^>]*class="[^"]*source-agenda-competition[^"]*"[^>]*>[\s\S]*?<\/span>/, "")
        .replace(/<[^>]*>/g, "")
        .trim()
    );
    const vsSplit = teamsText.split(/\s+vs\s+/i);
    if (vsSplit.length < 2) continue;

    const homeTeam = stripMatchStageSuffix(vsSplit[0].trim().replace(/^\d{1,2}:\d{2}\s+/, ""));
    const awayTeam = stripMatchStageSuffix(vsSplit.slice(1).join(" vs ").trim());

    // Filter out "Kazajstán" (without I) in favor of "Kazajistán" (with I)
    if ((homeTeam === "Kazajstán" || awayTeam === "Kazajstán") && 
        !(homeTeam === "Kazajistán" || awayTeam === "Kazajistán")) {
      continue;
    }

    const slugMatch = block.match(/<a[^>]*class="[^"]*agenda-open-match[^"]*"[^>]*href="([^"]*)"/);
    const slug = slugMatch ? slugMatch[1].replace(/^\//, "").replace(/^match\//, "") : `${homeTeam.toLowerCase().replace(/\s+/g, "-")}-vs-${awayTeam.toLowerCase().replace(/\s+/g, "-")}`;

    // Skip duplicates by team names + date (ignore league variations)
    // Use canonicalTeamForDedup to normalize team names, then aggressive normalization
    const normalizeAggressive = (s: string) => s.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
    const canonicalHome = normalizeAggressive(canonicalTeamForDedup(homeTeam, 0));
    const canonicalAway = normalizeAggressive(canonicalTeamForDedup(awayTeam, 0));
    const key = `${canonicalHome}|${canonicalAway}|${dateISO}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const sources: EventEmbed[] = [];
    const sourceRegex = /<a[^>]*class="[^"]*agenda-source-button[^"]*"[^>]*href="[^"]*#source=(\d+)"[^>]*>[\s\S]*?<small>([^<]*)<\/small>/g;
    let sourceMatch;
    while ((sourceMatch = sourceRegex.exec(block)) !== null) {
      sources.push({
        id: sourceMatch[1],
        name: decodeHtmlEntities(sourceMatch[2].trim()),
      });
    }

    matches.push({
      slug,
      homeTeam,
      awayTeam,
      league,
      dateISO,
      sources,
    });
  }

  return matches;
}

async function isInCooldown(): Promise<boolean> {
  const cooldownUntil = await getCache<number>(PL_COOLDOWN_KEY);
  return cooldownUntil !== null && Date.now() < cooldownUntil;
}

async function canCallPL(): Promise<boolean> {
  // Only check cooldown, not daily limit (daily limit removed to prevent blocking streams)
  if (await isInCooldown()) return false;
  return true;
}

async function markRateLimited(): Promise<void> {
  await setCache(PL_COOLDOWN_KEY, Date.now() + PL_COOLDOWN_MS, PL_COOLDOWN_MS);
  console.warn("[event-source] Rate limited — cooling down for 5 min");
}

export async function fetchEventAgenda(): Promise<EventMatch[]> {
  if (await isInCooldown()) return [];

  const cached = await getCache<EventMatch[]>(PL_AGENDA_CACHE_KEY);
  if (cached) return cached;

  if (await getCache<boolean>(PL_AGENDA_DOWN_KEY)) return [];

  const lockKey = `${PL_AGENDA_CACHE_KEY}:lock`;
  const lockAcquired = await acquireLock(lockKey, 10000);
  if (!lockAcquired) {
    const stale = await getCache<EventMatch[]>(PL_AGENDA_CACHE_KEY);
    return stale ?? [];
  }

  if (!await canCallPL()) {
    await releaseLock(lockKey);
    const stale = await getCache<EventMatch[]>(PL_AGENDA_CACHE_KEY);
    return stale ?? [];
  }

  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
    };
    let status = 0;
    let html = "";
    try {
      const res = await fetch(PL_AGENDA_URL, { headers, signal: AbortSignal.timeout(15000) });
      status = res.status;
      html = await res.text();
    } catch (error) {
      // The system resolver failed (ENOTFOUND / EAI_AGAIN). Retry through the
      // configured resolver, or through the public ones when the environment
      // does not name one. Resolvers race in parallel — sequential attempts
      // could stack three 15s timeouts and stall the whole fixture request.
      const attempts = await Promise.allSettled(
        PL_DNS_FALLBACKS.map((server) => fetchTextWithDnsServer(PL_AGENDA_URL, server, headers))
      );
      attempts.forEach((attempt, index) => {
        if (attempt.status === "rejected") {
          console.warn(`Pelota Libre agenda: DNS fallback ${PL_DNS_FALLBACKS[index]} failed`, attempt.reason);
        }
      });
      const fallback = attempts.find(
        (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchTextWithDnsServer>>> =>
          attempt.status === "fulfilled"
      )?.value ?? null;
      if (!fallback) throw error;
      status = fallback.status;
      html = fallback.text;
    }

    if (status < 200 || status >= 300) {
      console.warn(`Pelota Libre agenda error: ${status}`);
      if (status === 429 || status === 403) {
        await markRateLimited();
      }
      await releaseLock(lockKey);
      await setCache(PL_AGENDA_DOWN_KEY, true, PL_AGENDA_DOWN_TTL);
      const stale = await getCache<EventMatch[]>(PL_AGENDA_CACHE_KEY);
      return stale ?? [];
    }

    const matches = parseAgendaHTML(html);

    await setCache(PL_AGENDA_CACHE_KEY, matches, PL_AGENDA_CACHE_TTL);
    await deleteCache(PL_AGENDA_DOWN_KEY);
    await releaseLock(lockKey);
    return matches;
  } catch (error) {
    console.warn("Failed to fetch Pelota Libre agenda:", error);
    await releaseLock(lockKey);
    await setCache(PL_AGENDA_DOWN_KEY, true, PL_AGENDA_DOWN_TTL);
    const stale = await getCache<EventMatch[]>(PL_AGENDA_CACHE_KEY);
    return stale ?? [];
  }
}

export async function getEventStream(
  slug: string,
  sourceId: string
): Promise<Channel | null> {
  // Versioned after correcting provider responses that mislabeled HTML as HLS.
  // This prevents stale broken channels from surviving the fix for 30 minutes.
  const cacheKey = `pl:stream:v2:${slug}:${sourceId}`;

  const cached = await getCache<Channel>(cacheKey);
  if (cached) return cached;

  if (!await canCallPL()) {
    console.warn("Pelota Libre daily limit reached");
    return null;
  }

  if (await isInCooldown()) return null;

  try {
    const url = `${PL_PLAYBACK_URL}?type=event&slug=${encodeURIComponent(slug)}&source=${encodeURIComponent(sourceId)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": `${PL_BASE}/match/${slug}`,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      if (res.status === 429 || res.status === 403) {
        await markRateLimited();
      }
      return null;
    }

    const data = await res.json();

    if (data.success && data.url) {
      // Some provider responses incorrectly label an HTML wrapper as HLS.
      // Only send genuinely m3u8 URLs to HlsPlayer; otherwise resolve the
      // wrapper and retain it as an iframe fallback when direct media is not
      // exposed.
      const resolved = data.kind === "hls" && /\.m3u8(?:\?|$)/i.test(data.url)
        ? (() => {
            try {
              const u = new URL(data.url as string);
              // IP-bound stream tokens only work when the app server fetches
              // the media — relay allowed hosts instead of exposing the URL.
              return isAllowedStreamUrl(u)
                ? { url: toHlsProxyUrl(u.toString()), kind: "hls" as const }
                : { url: data.url as string, kind: "hls" as const };
            } catch {
              return { url: data.url as string, kind: "hls" as const };
            }
          })()
        : await resolvePlaybackUrl(data.url as string);
      const channel: Channel = {
        id: `pl-${sourceId}`,
        name: data.source_name || `Fuente ${sourceId}`,
        url: resolved.url,
        kind: resolved.kind,
      };
      await setCache(cacheKey, channel, PL_STREAM_CACHE_TTL);
      return channel;
    }

    return null;
  } catch (error) {
    console.warn("Failed to fetch Pelota Libre stream:", error);
    return null;
  }
}

export async function findEventStreams(
  homeTeam: string,
  awayTeam: string
): Promise<Channel[]> {
  const agenda = await fetchEventAgenda();
  if (agenda.length === 0) return [];

  const match = agenda.find(
    (m) => matchTeamsPair(m.homeTeam, m.awayTeam, homeTeam, awayTeam)
  );

  if (!match || match.sources.length === 0) return [];

  const channels: Channel[] = [];
  for (const source of match.sources) {
    const channel = await getEventStream(match.slug, source.id);
    if (channel) {
      channel.name = `${source.name}`;
      channels.push(channel);
    }
  }

  return channels;
}


