import type { Channel } from "./types";
import { getCache, setCache, acquireLock, releaseLock } from "./cache";
import { matchTeamsPair } from "./team-matching";

function agendaUrl(): string {
  return process.env.SECONDARY_AGENDA_URL ?? "";
}

function eventBase(): string {
  return process.env.SECONDARY_EVENT_BASE ?? "";
}

const AGENDA_CACHE_TTL = 5 * 60 * 1000;
const AGENDA_CACHE_KEY = "secondary:agenda";

export interface SecondaryEmbed {
  id: string; // raw base64 "r" param (decodes to the stream URL)
  name: string;
}

export interface SecondaryMatch {
  slug: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  dateISO: string;
  sources: SecondaryEmbed[];
}

const MONTHS_ES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/i, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripTags(str: string): string {
  return decodeHtmlEntities(str.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseDescription(desc: string): { league: string; homeTeam: string; awayTeam: string } {
  const cleaned = stripTags(desc);
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

/**
 * The agenda shows the Argentine wall-clock date as the day header and the
 * kick-off as a UTC+1 clock reading. Converting back: ARS time = (shown - 4h) mod 24
 * on the header's date (verified against known kick-offs, e.g. a 01:15 entry
 * under "Jueves 1 de Octubre" = Oct 1 21:15 ARS).
 */
function toArgentinaISO(year: number, month: number, day: number, time: string): string | null {
  const [hRaw, mRaw] = time.split(":");
  const h = parseInt(hRaw, 10);
  const m = parseInt(mRaw, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  const arsH = (h - 4 + 24) % 24;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(arsH)}:${pad(m)}:00-03:00`;
}

export function parseSecondaryAgenda(html: string): SecondaryMatch[] {
  type Token =
    | { kind: "day"; index: number; year: number; month: number; day: number }
    | { kind: "item"; index: number; text: string; time: string; block: string };

  const tokens: Token[] = [];

  const dayRegex = /<b>Agenda\s*-\s*[A-Za-z\u00C0-\u024F]+\s+(\d{1,2})\s+de\s+([A-Za-z\u00C0-\u024F]+)\s+(\d{4})<\/b>/gi;
  let dayMatch: RegExpExecArray | null;
  while ((dayMatch = dayRegex.exec(html)) !== null) {
    const month = MONTHS_ES[dayMatch[2].toLowerCase()];
    if (!month) continue;
    tokens.push({
      kind: "day",
      index: dayMatch.index,
      day: parseInt(dayMatch[1], 10),
      month,
      year: parseInt(dayMatch[3], 10),
    });
  }

  const itemRegex = /<li class="[^"]*">\s*<a href="#">([\s\S]*?)<span class="t">(\d{1,2}:\d{2})<\/span><\/a>\s*<ul>([\s\S]*?)<\/ul>\s*<\/li>/g;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(html)) !== null) {
    tokens.push({
      kind: "item",
      index: itemMatch.index,
      text: itemMatch[1],
      time: itemMatch[2],
      block: itemMatch[3],
    });
  }

  tokens.sort((a, b) => a.index - b.index);

  const matches: SecondaryMatch[] = [];
  let currentDay: { year: number; month: number; day: number } | null = null;

  for (const token of tokens) {
    if (token.kind === "day") {
      currentDay = { year: token.year, month: token.month, day: token.day };
      continue;
    }
    if (!currentDay) continue;

    const { league, homeTeam, awayTeam } = parseDescription(token.text);
    if (!homeTeam || !awayTeam) continue;

    const dateISO = toArgentinaISO(currentDay.year, currentDay.month, currentDay.day, token.time);
    if (!dateISO) continue;

    const sources: SecondaryEmbed[] = [];
    const sourceRegex = /href="\/eventos\.html\?r=([A-Za-z0-9+/=]+)"[^>]*>([^<]*)/g;
    let sourceMatch: RegExpExecArray | null;
    while ((sourceMatch = sourceRegex.exec(token.block)) !== null) {
      const name = stripTags(sourceMatch[2]);
      if (!name) continue;
      sources.push({ id: sourceMatch[1], name });
    }

    const slug = `${homeTeam.toLowerCase().replace(/\s+/g, "-")}-vs-${awayTeam.toLowerCase().replace(/\s+/g, "-")}`;

    matches.push({ slug, homeTeam, awayTeam, league, dateISO, sources });
  }

  return matches;
}

export async function fetchSecondaryAgenda(): Promise<SecondaryMatch[]> {
  const url = agendaUrl();
  if (!url) return [];

  const cached = await getCache<SecondaryMatch[]>(AGENDA_CACHE_KEY);
  if (cached) return cached;

  const lockKey = `${AGENDA_CACHE_KEY}:lock`;
  const lockAcquired = await acquireLock(lockKey, 10000);
  if (!lockAcquired) {
    const stale = await getCache<SecondaryMatch[]>(AGENDA_CACHE_KEY);
    return stale ?? [];
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[secondary] HTTP error: ${res.status}`);
      await releaseLock(lockKey);
      const stale = await getCache<SecondaryMatch[]>(AGENDA_CACHE_KEY);
      return stale ?? [];
    }

    const html = await res.text();
    const matches = parseSecondaryAgenda(html);

    await setCache(AGENDA_CACHE_KEY, matches, AGENDA_CACHE_TTL);
    await releaseLock(lockKey);
    return matches;
  } catch (error) {
    console.warn("[secondary] Failed to fetch agenda:", error);
    await releaseLock(lockKey);
    const stale = await getCache<SecondaryMatch[]>(AGENDA_CACHE_KEY);
    return stale ?? [];
  }
}

function decodeStreamUrl(encoded: string): string {
  try {
    const decoded = atob(encoded);
    if (decoded.startsWith("https://") || decoded.startsWith("http://")) {
      return decoded;
    }
  } catch {
    // not valid base64 — caller falls back to the wrapper URL
  }
  return "";
}

/**
 * Channels for a match from the secondary agenda. The wrapper page only
 * decodes a base64 `r` param and iframes the result, so we decode it here and
 * embed the bare player directly — no scraped-site chrome (header/footer/borders)
 * in the player. Falls back to the wrapper URL when decoding fails.
 */
export async function findSecondaryStreams(
  homeTeam: string,
  awayTeam: string
): Promise<Channel[]> {
  const base = eventBase();
  if (!base) return [];

  const agenda = await fetchSecondaryAgenda();
  if (agenda.length === 0) return [];

  const match = agenda.find((m) => matchTeamsPair(m.homeTeam, m.awayTeam, homeTeam, awayTeam));
  if (!match || match.sources.length === 0) return [];

  return match.sources.map((source, index) => {
    const direct = decodeStreamUrl(source.id);
    return {
      id: `secondary-${index + 1}`,
      name: source.name,
      url: direct || `${base}?r=${source.id}`,
      kind: "iframe" as const,
    };
  });
}
