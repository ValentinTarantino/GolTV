import { createHash } from "node:crypto";
import { getCache, setCache } from "./cache";

/**
 * Matches of the "LPF Play" section.
 *
 * Two providers feed the section:
 *
 * - Sportplus publishes the Argentine competitions with their own player; the
 *   playlist lives in the `ls` array of the match page, so it has to be read
 *   at request time (the URLs expire).
 * - AngulismoTV publishes an agenda where every event carries its own
 *   players; only the Primera Nacional events are taken.
 *
 * The client never sees a provider URL: matches arrive with opaque ids and
 * the player is handed over as a sealed relay token.
 */

const LIST_TTL = 60 * 1000;
const STREAM_TTL = 30 * 1000;
const FETCH_TIMEOUT_MS = 20 * 1000;

const SPORTPLUS_API = process.env.SPORTPLUS_API?.trim() || "https://apisplus.live/v3.1";
const SPORTPLUS_SITE = process.env.SPORTPLUS_SITE?.trim() || "https://es.sportplus.watch";
const ANGULISMO_AGGREGATOR =
  process.env.ANGULISMO_AGENDA_URL?.trim() || "https://la14hd.alangulismotv.workers.dev/events";
const ANGULISMO_FALLBACK =
  process.env.ANGULISMO_FALLBACK_URL?.trim() ||
  "https://raw.githubusercontent.com/tadeoallende/repos-web/refs/heads/main/datos.json";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
  "Sec-Ch-Ua": '"Chromium";v="132", "Not(A:Brand";v="8", "Google Chrome";v="132"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

/** Competitions of sportplus that the section shows. */
const SPORTPLUS_COMPETITIONS: Array<{ id: string; name: string }> = [
  { id: "220557", name: "Argentina. Championship (F)" },
  { id: "argentina-reserve-league", name: "Argentina. Reserve League" },
  { id: "2922491", name: "Argentina. Primera B Nacional" },
];

/** Where a match comes from. */
export type LpfMatchSource = "sportplus" | "angulismo";

/** A match of the section. */
export interface LpfMatch {
  id: string;
  source: LpfMatchSource;
  competition: string;
  home: string;
  away: string;
  /** Crests of the teams, resolved on the server. */
  homeLogo?: string;
  awayLogo?: string;
  /** Team ids of the provider, used to ask for their crest. */
  homePk?: number;
  awayPk?: number;
  /** ISO date in Argentina time (-03:00). */
  start: string;
  status: "live" | "upcoming" | "finished";
}

/** The player of a match: a playlist or an embedded page. */
export interface LpfMatchStream {
  src: string;
  kind: "hls" | "iframe";
}

interface MatchRef {
  source: LpfMatchSource;
  competitionId: string;
  matchId: string;
}

const pending = new Map<string, Promise<unknown>>();

/** Opaque, stable reference of a match. */
function matchId(ref: MatchRef): string {
  const raw = `${ref.source}|${ref.competitionId}|${ref.matchId}`;
  return "lpm_" + createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

async function fetchText(url: string, referer?: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: referer ? { ...BROWSER_HEADERS, Referer: referer } : BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Diagnostics of the page that carries the playlist of a match. */
export async function inspectSportplusPage(
  competitionId: string,
  matchIdValue: string
): Promise<{ url: string; status: number | null; length: number; hasLs: boolean; preview: string }> {
  const url = `${SPORTPLUS_SITE}/football/${competitionId}/${matchIdValue}/`;
  try {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, Referer: `${SPORTPLUS_SITE}/football/` },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    const text = await res.ok ? await res.text() : "";
    return {
      url,
      status: res.status,
      length: text.length,
      hasLs: text.includes('"ls"'),
      preview: text.slice(0, 160).replace(/\s+/g, " "),
    };
  } catch (error) {
    return { url, status: 0, length: 0, hasLs: false, preview: String(error).slice(0, 120) };
  }
}

async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = await getCache<T>(key);
  if (hit !== null) return hit;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight as Promise<T>;
  const work = (async () => {
    const value = await fetcher();
    if (value !== null) await setCache(key, value, ttlMs);
    return value;
  })();
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
  }
}

/** Argentina time (-03:00) from the ISO stamp of the provider. */
function toArgentina(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString();
}

function statusOf(status: string | undefined, start: string): LpfMatch["status"] {
  if (status === "live") return "live";
  if (status === "finished" || status === "ended") return "finished";
  const time = new Date(start).getTime();
  if (!Number.isNaN(time) && time < Date.now()) return "finished";
  return "upcoming";
}

/* ------------------------------------------------------------------ *
 * Sportplus
 * ------------------------------------------------------------------ */

interface SportplusItem {
  id?: number;
  name?: string;
  start?: string;
  status?: string;
  tournament_id?: number;
  home?: { name?: string; pk_id?: number };
  away?: { name?: string; pk_id?: number };
}

async function sportplusMatches(competitionId: string): Promise<SportplusItem[]> {
  const url = `${SPORTPLUS_API}/matches/index?fw=3.1&lang=es&lcfg=es&offset=0&sport_id=football&tournament_id=${encodeURIComponent(
    competitionId
  )}`;
  const text = await fetchText(url, `${SPORTPLUS_SITE}/football/`);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as { items?: SportplusItem[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

/** The playlist of a sportplus match, read from the `ls` array of its page. */
async function sportplusPlaylist(competitionId: string, matchIdValue: string): Promise<string | null> {
  const url = `${SPORTPLUS_SITE}/football/${competitionId}/${matchIdValue}/`;
  const page = await fetchText(url, `${SPORTPLUS_SITE}/football/`);
  if (!page) {
    console.warn(`[lpf] no page for ${competitionId}/${matchIdValue}`);
    return null;
  }
  for (const block of page.matchAll(/"ls":\[([^\]]*)\]/g)) {
    for (const url of block[1].matchAll(/https?:\\u002F\\u002F[^"]+/g)) {
      const clean = url[0].replace(/\\u002F/g, "/");
      if (clean.startsWith("https://") && /\.m3u8(\?|$)/i.test(clean)) return clean;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * AngulismoTV
 * ------------------------------------------------------------------ */

interface AngulismoEvent {
  evento?: string;
  title?: string;
  competition?: string;
  competencia?: string;
  category?: string;
  fecha?: string;
  date?: string;
  time?: string;
  start?: string;
  channels?: unknown;
  canales?: unknown;
}

/** The title of an event, in both shapes the site publishes. */
function eventTitle(event: AngulismoEvent): string {
  return (event.evento ?? event.title ?? "").trim();
}

/** The competition of an event, in both shapes the site publishes. */
function eventCompetition(event: AngulismoEvent): string {
  return (event.competition ?? event.competencia ?? event.category ?? "").trim();
}

/** True when an event of the agenda belongs to the Primera Nacional. */
export function isPrimeraNacionalEvent(event: AngulismoEvent): boolean {
  const competition = eventCompetition(event);
  const name = eventTitle(event);
  if (/^(?:Primera\s+(?:B\s+)?Nacional|B\s+Nacional|Nacional\s+B)\b/i.test(competition)) return true;
  return /^(?:Primera\s+(?:B\s+)?Nacional|B\s+Nacional|Nacional\s+B)\s*[:\-]/i.test(name);
}

/** The Primera Nacional events of the agenda of the site. */
async function angulismoPrimeraNacional(): Promise<AngulismoEvent[]> {
  const raw = (await fetchText(ANGULISMO_AGGREGATOR)) ?? (await fetchText(ANGULISMO_FALLBACK));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { events?: AngulismoEvent[] };
    const events = Array.isArray(parsed.events) ? parsed.events : [];
    return events.filter(isPrimeraNacionalEvent);
  } catch {
    return [];
  }
}

/**
 * The name a crest is searched with: the providers tag the teams with the
 * sport ("(F)", "(Femenino)") and mark the reserve sides with a roman
 * numeral.
 */
export function cleanTeamName(name: string): string {
  return name
    .replace(/\((?:F|M|Femenino|Masculino)\)/gi, "")
    .replace(/\s+II\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Aliases of the crest catalog: the providers name the Argentine clubs with
 * their legal name, the catalog knows the short one.
 */
const BADGE_ALIASES: Record<string, string> = {
  "gimnasiayesgrimalaplata": "gimnasialaplata",
  "unionsantafe": "uniondesantafe",
  "talleresdecordoba": "talleresdecordoba",
  "clubatleticotucuman": "atleticotucuman",
  "estudiantesderiocuarto": "estudiantesrc",
  "institutoatleticocentralcordoba": "instituto",
  "clubatleticotigre": "tigre",
  "clubatleticoatlanta": "atlanta",
  "deportivomoron": "moron",
  "clubatleticocolon": "colon",
  "ciudaddebolivar": "ciudaddebolivar",
  "sanmartin": "sanmartin",
  "sanlorenzo": "sanlorenzo",
  "quilmes": "quilmes",
  "almirantebrown": "almirantebrown",
  "santelmo": "santelmo",
  "socialatleticotelevision": "socialatleticotelevision",
  "defensoresdebelgrano": "defensoresdebelgrano",
  "deportivoespenza": "deportivoespenza",
  "ferrocarriodeleste": "ferrocarriodeleste",
  "studerantes": "studerantes",
  "tristanesuarez": "tristanesuarez",
  "gimnasiaytiro": "gimnasiaytiro",
  "patronato": "patronato",
};

/** The name a crest is searched with for a team of the section. */
export function badgeNameFor(name: string): string {
  const clean = cleanTeamName(name);
  const key = clean
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return BADGE_ALIASES[key] ?? clean;
}

/** Splits the "A vs B" title of an event. */
function splitTeams(event: string): [string, string] {
  const clean = event.replace(/^.*?:\s*/, "").trim();
  const parts = clean.split(/\s+vs\.?\s+/i);
  if (parts.length >= 2) return [parts[0].trim(), parts.slice(1).join(" ").trim()];
  return [clean, clean];
}

/** Parses the date fields of an angulismo event into a real instant. */
function parseEventDate(event: AngulismoEvent): { raw: string; date: Date | null } {
  const raw = (
    event.start ??
    event.date ??
    (event.date && event.time ? `${event.date} ${event.time}` : undefined) ??
    event.fecha ??
    ""
  ).trim();
  if (!raw) return { raw, date: null };
  const iso = raw.replace(" ", "T");
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}-03:00`;
  const date = new Date(zoned);
  return { raw, date: Number.isNaN(date.getTime()) ? null : date };
}

/** The date of an angulismo event, already in Argentina time. */
function eventDate(event: AngulismoEvent): string {
  const { raw, date } = parseEventDate(event);
  if (!raw) return "";
  if (!date) return raw;
  return toArgentina(date.toISOString());
}

/** The players of an angulismo event. */
export function extractAngulismoPlayers(event: AngulismoEvent): Array<{ name: string; iframe: string }> {
  const channels = (event.channels ?? event.canales ?? []) as Array<{
    name?: string;
    iframe?: string;
    link?: string;
    options?: Array<{ name?: string; iframe?: string }>;
  }>;
  if (!Array.isArray(channels)) return [];

  const players: Array<{ name: string; iframe: string }> = [];
  for (const channel of channels) {
    const options = Array.isArray(channel.options)
      ? channel.options
      : channel.iframe
        ? [{ name: "Opción 1", iframe: channel.iframe }]
        : channel.link && /^https?:\/\//i.test(channel.link)
          ? [{ name: "Opción 1", iframe: channel.link }]
          : [];
    for (const option of options) {
      if (option.iframe) {
        players.push({ name: `${channel.name ?? "Canal"} · ${option.name ?? "Opción 1"}`, iframe: option.iframe });
      }
    }
  }
  return players;
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/** Raw sportplus answers, cached so the list can be rebuilt on every call. */
async function sportplusData(): Promise<Array<{ competition: { id: string; name: string }; items: SportplusItem[] }>> {
  return cached("lpf:sportplus:v2", LIST_TTL, async () => {
    const out: Array<{ competition: { id: string; name: string }; items: SportplusItem[] }> = [];
    for (const competition of SPORTPLUS_COMPETITIONS) {
      out.push({ competition, items: await sportplusMatches(competition.id) });
    }
    return out;
  });
}

/** Raw agenda of the angulismo site, cached the same way. */
async function angulismoData(): Promise<AngulismoEvent[]> {
  return cached("lpf:angulismo:v2", LIST_TTL, () => angulismoPrimeraNacional());
}

/**
 * Every match of the section: sportplus competitions plus Primera Nacional.
 *
 * The references are returned together with the list: each route bundle has
 * its own memory, so the resolver can not rely on a shared map.
 */
async function buildMatches(): Promise<{ matches: LpfMatch[]; refs: Map<string, MatchRef> }> {
  const [sportplus, angulismo] = await Promise.all([sportplusData(), angulismoData()]);
  const matches: LpfMatch[] = [];
  const refs = new Map<string, MatchRef>();

  for (const { competition, items } of sportplus) {
    for (const item of items) {
      const matchIdValue = item.id ? String(item.id) : "";
      const home = item.home?.name?.trim() ?? "";
      const away = item.away?.name?.trim() ?? "";
      if (!matchIdValue || !home || !away) continue;
      const start = item.start ? toArgentina(item.start) : "";
      const ref: MatchRef = { source: "sportplus", competitionId: competition.id, matchId: matchIdValue };
      const id = matchId(ref);
      refs.set(id, ref);
      matches.push({
        id,
        source: "sportplus",
        competition: competition.name,
        home,
        away,
        homePk: item.home?.pk_id,
        awayPk: item.away?.pk_id,
        start,
        status: statusOf(item.status, item.start ?? ""),
      });
    }
  }

  for (const event of angulismo) {
    const title = eventTitle(event);
    if (!title) continue;
    const [home, away] = splitTeams(title);
    const start = eventDate(event);
    // `start` is wall-clock Argentina time for display; the status needs the
    // real instant, three hours ahead.
    const instant = parseEventDate(event).date?.toISOString() ?? "";
    const ref: MatchRef = {
      source: "angulismo",
      competitionId: "primera-nacional",
      matchId: `${title}|${start}`,
    };
    const id = matchId(ref);
    refs.set(id, ref);
    matches.push({
      id,
      source: "angulismo",
      competition: "Primera Nacional",
      home,
      away,
      start,
      status: statusOf(undefined, instant),
    });
  }

  matches.sort((a, b) => {
    if (a.status !== b.status) return a.status === "live" ? -1 : b.status === "live" ? 1 : 0;
    return a.start.localeCompare(b.start);
  });

  return { matches, refs };
}

/** The list of matches of the section. */
export async function listLpfMatches(): Promise<LpfMatch[]> {
  return (await buildMatches()).matches;
}

/** The player of a match. */
export async function resolveLpfMatchStream(id: string): Promise<LpfMatchStream | null> {
  if (!/^lpm_[a-f0-9]{16}$/.test(id)) return null;

  const { refs } = await buildMatches();
  const ref = refs.get(id);
  if (!ref) return null;

  if (ref.source === "sportplus") {
    const playlist = await cached(`lpf:match:v2:${id}`, STREAM_TTL, () =>
      sportplusPlaylist(ref.competitionId, ref.matchId)
    );
    return playlist ? { src: playlist, kind: "hls" } : null;
  }

  const events = await angulismoData();
  const event = events.find((candidate) =>
    matchId({
      source: "angulismo",
      competitionId: "primera-nacional",
      matchId: `${eventTitle(candidate)}|${eventDate(candidate)}`,
    }) === id
  );
  if (!event) return null;
  const player = extractAngulismoPlayers(event)[0];
  return player ? { src: player.iframe, kind: "iframe" } : null;
}
