import type { Channel } from "./types";

const PL_BASE = "https://pelotalibre.biz";
const PL_AGENDA_URL = `${PL_BASE}/agenda`;
const PL_PLAYBACK_URL = `${PL_BASE}/api/direct-playback.php`;

interface PelotaLibreSource {
  id: string;
  name: string;
}

export interface PelotaLibreMatch {
  slug: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  dateISO: string;
  sources: PelotaLibreSource[];
}

let lastPLFailureTime = 0;
const PL_COOLDOWN_MS = 5 * 60 * 1000;

let plDailyCount = 0;
let plDailyDate = "";
const PL_DAILY_LIMIT = 300;

const plStreamCache = new Map<string, { channel: Channel; ts: number }>();
const PL_STREAM_CACHE_TTL = 30 * 60 * 1000;

export function getPLUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const count = plDailyDate === today ? plDailyCount : 0;
  return { used: count, limit: PL_DAILY_LIMIT, date: today };
}

function canCallPL(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (plDailyDate !== today) {
    plDailyDate = today;
    plDailyCount = 0;
  }
  return plDailyCount < PL_DAILY_LIMIT;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'");
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function teamsMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const wordsA = a.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const wordsB = b.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (normalize(wa) === normalize(wb)) return true;
      if (normalize(wa).includes(normalize(wb)) || normalize(wb).includes(normalize(wa))) {
        return true;
      }
    }
  }

  return false;
}

function parseAgendaHTML(html: string): PelotaLibreMatch[] {
  const matches: PelotaLibreMatch[] = [];

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

    const sources: PelotaLibreSource[] = [];
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

export async function fetchPelotaLibreAgenda(): Promise<PelotaLibreMatch[]> {
  if (Date.now() - lastPLFailureTime < PL_COOLDOWN_MS) return [];

  try {
    const res = await fetch(PL_AGENDA_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      console.warn(`Pelota Libre agenda error: ${res.status}`);
      if (res.status === 429 || res.status === 403) {
        lastPLFailureTime = Date.now();
      }
      return [];
    }

    const html = await res.text();
    return parseAgendaHTML(html);
  } catch (error) {
    console.warn("Failed to fetch Pelota Libre agenda:", error);
    return [];
  }
}

export async function getPelotaLibreStream(
  slug: string,
  sourceId: string
): Promise<Channel | null> {
  const cacheKey = `${slug}:${sourceId}`;
  const cached = plStreamCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PL_STREAM_CACHE_TTL) {
    return { ...cached.channel };
  }

  if (!canCallPL()) {
    console.warn(`Pelota Libre daily limit (${PL_DAILY_LIMIT}) reached`);
    return null;
  }

  if (Date.now() - lastPLFailureTime < PL_COOLDOWN_MS) return null;

  try {
    const url = `${PL_PLAYBACK_URL}?type=event&slug=${encodeURIComponent(slug)}&source=${encodeURIComponent(sourceId)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": `${PL_BASE}/match/${slug}`,
      },
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      if (res.status === 429 || res.status === 403) {
        lastPLFailureTime = Date.now();
        console.warn(`Pelota Libre rate limited/blocked: ${res.status}`);
      }
      return null;
    }

    plDailyCount++;
    const data = await res.json();

    if (data.success && data.url) {
      const kind = data.kind === "hls" ? "hls" : "iframe";
      const channel: Channel = {
        id: `pl-${sourceId}`,
        name: data.source_name || `Fuente ${sourceId}`,
        url: data.url,
        kind,
      };
      plStreamCache.set(cacheKey, { channel, ts: Date.now() });
      return { ...channel };
    }

    return null;
  } catch (error) {
    console.warn("Failed to fetch Pelota Libre stream:", error);
    return null;
  }
}

export async function findPelotaLibreStreams(
  homeTeam: string,
  awayTeam: string
): Promise<Channel[]> {
  const agenda = await fetchPelotaLibreAgenda();
  if (agenda.length === 0) return [];

  const match = agenda.find(
    (m) =>
      (teamsMatch(m.homeTeam, homeTeam) && teamsMatch(m.awayTeam, awayTeam)) ||
      (teamsMatch(m.homeTeam, awayTeam) && teamsMatch(m.awayTeam, homeTeam))
  );

  if (!match || match.sources.length === 0) return [];

  const channels: Channel[] = [];
  for (const source of match.sources) {
    const channel = await getPelotaLibreStream(match.slug, source.id);
    if (channel) {
      channel.name = `${source.name}`;
      channels.push(channel);
    }
  }

  return channels;
}
