import type { Channel } from "./types";
import { getCache, setCache, acquireLock, releaseLock } from "./cache";
import { matchTeamsPair } from "./team-matching";

const PL_BASE = process.env.EVENT_SOURCE_BASE!;
const PL_AGENDA_URL = process.env.EVENT_AGENDA_URL!;
const PL_PLAYBACK_URL = process.env.EVENT_PLAYBACK_URL!;

const PL_COOLDOWN_MS = 5 * 60 * 1000;
const PL_STREAM_CACHE_TTL = 30 * 60 * 1000;
const PL_AGENDA_CACHE_TTL = 5 * 60 * 1000;

const PL_COOLDOWN_KEY = "pl:cooldown:until";
const PL_AGENDA_CACHE_KEY = "pl:agenda";

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

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'");
}

function parseAgendaHTML(html: string): EventMatch[] {
  const matches: EventMatch[] = [];

  const eventRegex = /<div[^>]*class="[^"]*source-agenda-event[^"]*"[^>]*data-source-instant="([^"]*)"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*source-agenda-event[^"]*"|<div class="[^"]*channels-title)/g;

  let eventMatch;
  while ((eventMatch = eventRegex.exec(html)) !== null) {
    const dateISO = eventMatch[1];
    const block = eventMatch[2];

    const competitionMatch = block.match(/<span[^>]*class="[^"]*source-agenda-competition[^"]*"[^>]*>([^<]*)<\/span>/);
    const league = decodeHtmlEntities(competitionMatch ? competitionMatch[1].trim().replace(/:$/, "") : "Desconocido");

    const textMatch = block.match(/<span[^>]*class="[^"]*source-agenda-eventtext[^"]*"[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>/);
    if (!textMatch) continue;

    const strongHTML = textMatch[1];
    const teamsText = decodeHtmlEntities(
      strongHTML
        .replace(/<span[^>]*class="[^"]*source-agenda-competition[^"]*"[^>]*>[\s\S]*?<\/span>/, "")
        .replace(/<[^>]*>/g, "")
        .trim()
    );
    const vsSplit = teamsText.split(/\s+vs\s+/i);
    if (vsSplit.length < 2) continue;

    const homeTeam = vsSplit[0].trim().replace(/^\d{1,2}:\d{2}\s+/, "");
    const awayTeam = vsSplit.slice(1).join(" vs ").trim();

    const slugMatch = block.match(/<a[^>]*class="[^"]*agenda-open-match[^"]*"[^>]*href="([^"]*)"/);
    const slug = slugMatch ? slugMatch[1].replace(/^\//, "").replace(/^match\//, "") : `${homeTeam.toLowerCase().replace(/\s+/g, "-")}-vs-${awayTeam.toLowerCase().replace(/\s+/g, "-")}`;

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
    const res = await fetch(PL_AGENDA_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`Pelota Libre agenda error: ${res.status}`);
      if (res.status === 429 || res.status === 403) {
        await markRateLimited();
      }
      await releaseLock(lockKey);
      const stale = await getCache<EventMatch[]>(PL_AGENDA_CACHE_KEY);
      return stale ?? [];
    }

    const html = await res.text();
    const matches = parseAgendaHTML(html);

    await setCache(PL_AGENDA_CACHE_KEY, matches, PL_AGENDA_CACHE_TTL);
    await releaseLock(lockKey);
    return matches;
  } catch (error) {
    console.warn("Failed to fetch Pelota Libre agenda:", error);
    await releaseLock(lockKey);
    const stale = await getCache<EventMatch[]>(PL_AGENDA_CACHE_KEY);
    return stale ?? [];
  }
}

export async function getEventStream(
  slug: string,
  sourceId: string
): Promise<Channel | null> {
  const cacheKey = `pl:stream:${slug}:${sourceId}`;

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
      const kind = data.kind === "hls" ? "hls" : "iframe";
      const channel: Channel = {
        id: `pl-${sourceId}`,
        name: data.source_name || `Fuente ${sourceId}`,
        url: data.url,
        kind,
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

export function getEventUsage() {
  const today = new Date().toISOString().slice(0, 10);
  return { used: 0, limit: 9999, date: today };
}