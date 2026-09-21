import type { Channel } from "./types";

const FL_AGENDA_URL = "https://futbollibreplus.org/diaries.json";
const FL_EMBED_BASE = "https://futbollibrefullhd.org";

interface FutbolLibreEmbed {
  id: string;
  name: string;
  embedIframe: string;
}

export interface FutbolLibreMatch {
  slug: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  dateISO: string;
  embeds: FutbolLibreEmbed[];
}

const flAgendaCache = new Map<string, { data: FutbolLibreMatch[]; ts: number }>();
const FL_AGENDA_CACHE_TTL = 5 * 60 * 1000;

let flDailyCount = 0;
let flDailyDate = "";
const FL_DAILY_LIMIT = 200;

const flStreamCache = new Map<string, { channel: Channel; ts: number }>();
const FL_STREAM_CACHE_TTL = 30 * 60 * 1000;

export function getFLUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const count = flDailyDate === today ? flDailyCount : 0;
  return { used: count, limit: FL_DAILY_LIMIT, date: today };
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

function limaToArgentinaISO(dateDiary: string, diaryHour: string): string {
  const hour = parseInt(diaryHour.slice(0, 2), 10);
  const minute = parseInt(diaryHour.slice(3, 5), 10);
  const second = parseInt(diaryHour.slice(6, 8), 10) || 0;

  const limaHour = hour + 2;
  let finalHour = limaHour;
  let finalDate = dateDiary;

  if (limaHour >= 24) {
    finalHour = limaHour - 24;
    const d = new Date(dateDiary + "T00:00:00");
    d.setDate(d.getDate() + 1);
    finalDate = d.toISOString().slice(0, 10);
  }

  return `${finalDate}T${String(finalHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}-03:00`;
}

interface StrapiEmbed {
  id: number;
  attributes?: {
    embed_name?: string;
    embed_iframe?: string;
  };
}

interface StrapiDiary {
  id: number;
  documentId?: string;
  diary_description?: string;
  diary_hour?: string;
  date_diary?: string;
  marcador?: string | null;
  embeds?: { data?: StrapiEmbed[] } | StrapiEmbed[];
  country?: { data?: { attributes?: { name?: string } } };
  attributes?: StrapiDiary;
}

function parseStrapiEmbeds(raw: StrapiDiary["embeds"]): FutbolLibreEmbed[] {
  if (!raw) return [];

  const items = Array.isArray(raw) ? raw : raw.data;
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const attrs = item.attributes;
      const iframe = attrs?.embed_iframe;
      const name = attrs?.embed_name;
      if (!iframe || !name) return null;
      return { id: String(item.id), name, embedIframe: iframe };
    })
    .filter((e): e is FutbolLibreEmbed => e !== null);
}

function parseDescription(desc: string): { league: string; homeTeam: string; awayTeam: string } {
  const cleaned = desc.replace(/\n/g, " ").trim();
  const colonIdx = cleaned.indexOf(":");
  if (colonIdx === -1) {
    const vsMatch = cleaned.match(/^(.+?)\s+vs\s+(.+)$/i);
    if (vsMatch) {
      return { league: "Internacional", homeTeam: vsMatch[1].trim(), awayTeam: vsMatch[2].trim() };
    }
    return { league: "Internacional", homeTeam: cleaned, awayTeam: "" };
  }

  const league = cleaned.slice(0, colonIdx).trim();
  const teams = cleaned.slice(colonIdx + 1).trim();
  const vsMatch = teams.match(/^(.+?)\s+vs\s+(.+)$/i);
  if (!vsMatch) {
    return { league, homeTeam: teams, awayTeam: "" };
  }

  return { league, homeTeam: vsMatch[1].trim(), awayTeam: vsMatch[2].trim() };
}

function parseStrapiAgenda(data: StrapiDiary[]): FutbolLibreMatch[] {
  const matches: FutbolLibreMatch[] = [];

  for (const raw of data) {
    const item = raw.attributes || raw;
    const desc = item.diary_description || "";
    const hour = item.diary_hour || "";
    const date = item.date_diary || "";

    if (!desc || !hour || !date) continue;

    const { league, homeTeam, awayTeam } = parseDescription(desc);
    if (!homeTeam || !awayTeam) continue;

    const dateISO = limaToArgentinaISO(date, hour);
    const embeds = parseStrapiEmbeds(item.embeds);
    const slug = `${homeTeam.toLowerCase().replace(/\s+/g, "-")}-vs-${awayTeam.toLowerCase().replace(/\s+/g, "-")}`;

    matches.push({ slug, homeTeam, awayTeam, league, dateISO, embeds });
  }

  return matches;
}

export async function fetchFutbolLibreAgenda(): Promise<FutbolLibreMatch[]> {
  const now = Date.now();
  const freshEntry = [...flAgendaCache.values()].find((c) => now - c.ts < FL_AGENDA_CACHE_TTL);
  if (freshEntry) return freshEntry.data;

  const today = new Date().toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 10);
  const staleEntry = flAgendaCache.get(today);

  try {
    const res = await fetch(FL_AGENDA_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`FutbolLibre agenda error: ${res.status}`);
      return staleEntry?.data || [];
    }

    const json = await res.json();
    const items: StrapiDiary[] = Array.isArray(json) ? json : json.data || [];
    const matches = parseStrapiAgenda(items);

    flAgendaCache.set(today, { data: matches, ts: Date.now() });
    return matches;
  } catch (error) {
    console.warn("[futbollibre] Failed to fetch agenda:", error);
    return staleEntry?.data || [];
  }
}

function buildEmbedUrl(embedIframe: string): string {
  const rMatch = embedIframe.match(/[?&]r=([A-Za-z0-9+/=]+)/);
  if (rMatch) {
    try {
      return atob(rMatch[1]);
    } catch {
      // fallback to wrapping
    }
  }
  return `${FL_EMBED_BASE}${embedIframe}`;
}

export async function getFutbolLibreStream(
  embedIframe: string,
  embedName: string
): Promise<Channel | null> {
  const cacheKey = embedIframe;
  const cached = flStreamCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < FL_STREAM_CACHE_TTL) {
    return { ...cached.channel };
  }

  if (!canCallFL()) {
    console.warn(`FutbolLibre daily limit (${FL_DAILY_LIMIT}) reached`);
    return null;
  }

  const url = buildEmbedUrl(embedIframe);
  const channel: Channel = {
    id: `fl-${embedName.toLowerCase().replace(/\s+/g, "-")}`,
    name: embedName,
    url,
    kind: "iframe",
  };

  flDailyCount++;
  flStreamCache.set(cacheKey, { channel, ts: Date.now() });
  return { ...channel };
}

export async function findFutbolLibreStreams(
  homeTeam: string,
  awayTeam: string
): Promise<Channel[]> {
  const agenda = await fetchFutbolLibreAgenda();
  if (agenda.length === 0) return [];

  const match = agenda.find(
    (m) =>
      (teamsMatch(m.homeTeam, homeTeam) && teamsMatch(m.awayTeam, awayTeam)) ||
      (teamsMatch(m.homeTeam, awayTeam) && teamsMatch(m.awayTeam, homeTeam))
  );

  if (!match || match.embeds.length === 0) return [];

  const channels: Channel[] = [];
  for (const embed of match.embeds) {
    const channel = await getFutbolLibreStream(embed.embedIframe, embed.name);
    if (channel) {
      channels.push(channel);
    }
  }

  return channels;
}

function canCallFL(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (flDailyDate !== today) {
    flDailyDate = today;
    flDailyCount = 0;
  }
  return flDailyCount < FL_DAILY_LIMIT;
}
