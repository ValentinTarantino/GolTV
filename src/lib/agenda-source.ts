import type { Channel } from "./types";
import { getCache, setCache, acquireLock, releaseLock } from "./cache";
import { matchTeamsPair } from "./team-matching";

const FL_AGENDA_URL = process.env.AGENDA_SOURCE_URL!;
const FL_EMBED_BASE = process.env.EMBED_SOURCE_BASE!;

const FL_STREAM_CACHE_TTL = 30 * 60 * 1000;
const FL_AGENDA_CACHE_TTL = 5 * 60 * 1000;

const FL_AGENDA_CACHE_KEY = "fl:agenda";

interface AgendaEmbed {
  id: string;
  name: string;
  embedIframe: string;
}

export interface AgendaMatch {
  slug: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  dateISO: string;
  embeds: AgendaEmbed[];
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

function parseStrapiEmbeds(raw: StrapiDiary["embeds"]): AgendaEmbed[] {
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
    .filter((e): e is AgendaEmbed => e !== null);
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

function parseStrapiAgenda(data: StrapiDiary[]): AgendaMatch[] {
  const matches: AgendaMatch[] = [];

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

async function canCallFL(): Promise<boolean> {
  // No daily limit check (removed to prevent blocking streams)
  return true;
}

export async function fetchAgenda(): Promise<AgendaMatch[]> {
  const cached = await getCache<AgendaMatch[]>(FL_AGENDA_CACHE_KEY);
  if (cached) return cached;

  const lockKey = `${FL_AGENDA_CACHE_KEY}:lock`;
  const lockAcquired = await acquireLock(lockKey, 10000);
  if (!lockAcquired) {
    const stale = await getCache<AgendaMatch[]>(FL_AGENDA_CACHE_KEY);
    return stale ?? [];
  }

  if (!await canCallFL()) {
    await releaseLock(lockKey);
    const stale = await getCache<AgendaMatch[]>(FL_AGENDA_CACHE_KEY);
    return stale ?? [];
  }

  try {
    const res = await fetch(FL_AGENDA_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[agenda] HTTP error: ${res.status}`);
      await releaseLock(lockKey);
      const stale = await getCache<AgendaMatch[]>(FL_AGENDA_CACHE_KEY);
      return stale ?? [];
    }

    const json = await res.json();
    const items: StrapiDiary[] = Array.isArray(json) ? json : json.data || [];
    const matches = parseStrapiAgenda(items);

    await setCache(FL_AGENDA_CACHE_KEY, matches, FL_AGENDA_CACHE_TTL);
    await releaseLock(lockKey);
    return matches;
  } catch (error) {
    console.warn("[agenda] Failed to fetch agenda:", error);
    await releaseLock(lockKey);
    const stale = await getCache<AgendaMatch[]>(FL_AGENDA_CACHE_KEY);
    return stale ?? [];
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

export async function getAgendaStream(
  embedIframe: string,
  embedName: string
): Promise<Channel | null> {
  const cacheKey = `fl:stream:${embedIframe}`;

  const cached = await getCache<Channel>(cacheKey);
  if (cached) return cached;

  if (!await canCallFL()) {
    console.warn("[agenda] Daily limit reached");
    return null;
  }

  const url = buildEmbedUrl(embedIframe);
  const channel: Channel = {
    id: `fl-${embedName.toLowerCase().replace(/\s+/g, "-")}`,
    name: embedName,
    url,
    kind: "iframe",
  };

  await setCache(cacheKey, channel, FL_STREAM_CACHE_TTL);
  return channel;
}

export async function findAgendaStreams(
  homeTeam: string,
  awayTeam: string
): Promise<Channel[]> {
  const agenda = await fetchAgenda();
  if (agenda.length === 0) return [];

  const match = agenda.find(
    (m) => matchTeamsPair(m.homeTeam, m.awayTeam, homeTeam, awayTeam)
  );

  if (!match || match.embeds.length === 0) return [];

  const channels: Channel[] = [];
  for (const embed of match.embeds) {
    const channel = await getAgendaStream(embed.embedIframe, embed.name);
    if (channel) {
      channels.push(channel);
    }
  }

  return channels;
}

export function getAgendaUsage() {
  const today = new Date().toISOString().slice(0, 10);
  return { used: 0, limit: 9999, date: today };
}