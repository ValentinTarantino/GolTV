import { createHash } from "node:crypto";
import { getCache, setCache } from "./cache";
import { getHomeRelayUrl } from "./lpf-home-relay";
import { hasParaguayanClub } from "./constants";
import { matchTeamsPair } from "./team-matching";

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
/** A match the provider closed keeps the "live" badge while its broadcast can still run. */
const FINISHED_GRACE_MS = 3 * 60 * 60 * 1000;
/** Matches that vanish from the providers stay listed and playable this long. */
const RECENT_TTL = 90 * 60 * 1000;
/** A vanished "live" match keeps the badge for this long, then shows finished. */
const LIVE_GRACE_MS = 45 * 60 * 1000;

const SPORTPLUS_API = process.env.SPORTPLUS_API?.trim() || "https://apisplus.live/v3.1";
const SPORTPLUS_SITE = process.env.SPORTPLUS_SITE?.trim() || "https://es.sportplus.watch";
const ANGULISMO_AGGREGATOR =
  process.env.ANGULISMO_AGENDA_URL?.trim() || "https://la14hd.alangulismotv.workers.dev/events";
const ANGULISMO_FALLBACK =
  process.env.ANGULISMO_FALLBACK_URL?.trim() ||
  "https://raw.githubusercontent.com/tadeoallende/repos-web/refs/heads/main/datos.json";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json,text/html,*/*",
  "Accept-Language": "es-AR,es;q=0.9",
};

/** Competitions of sportplus that the section shows. */
const SPORTPLUS_COMPETITIONS: Array<{ id: string; name: string }> = [
  { id: "220557", name: "Campeonato Femenino" },
  { id: "argentina-reserve-league", name: "Liga de Reserva" },
  { id: "2922491", name: "Primera B Nacional" },
  { id: "955407", name: "Primera B Metropolitana" },
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
  /**
   * Provider coordinates of a sportplus match. Public data (they appear in
   * the provider's own URLs); the browser uses them to ask the provider's
   * API for the playlist because the API only shares it with residential
   * networks — serverless datacenter IPs get a stripped answer.
   */
  viewTid?: string;
  viewMid?: string;
}

/** The player of a match: a playlist or an embedded page. */
export interface LpfMatchStream {
  src: string;
  kind: "hls" | "iframe";
  /** Every player of the match, the primary one first. */
  sources?: Array<{ src: string; kind: "hls" | "iframe"; quality?: string }>;
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

/**
 * The provider closes the match at the scheduled end, but the broadcast —
 * and extra time — keeps running: a recently started match that reports
 * finished is still shown as live.
 */
function sportplusStatus(item: SportplusItem): LpfMatch["status"] {
  const status = statusOf(item.status, item.start ?? "");
  if (status !== "finished") return status;
  const start = item.start ? new Date(item.start).getTime() : NaN;
  if (!Number.isNaN(start) && Date.now() < start + FINISHED_GRACE_MS) return "live";
  return "finished";
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
  /** Period breakdown: `p: 0` is the running total, `p >= 1` per-period goals. */
  score?: Array<Record<string, number | string | undefined> & { p?: number }>;
  /** Elapsed seconds of the broadcast clock. */
  time_sec?: number;
  /** Provider period code: 1 = first half, 2 = second half, 3/6 = extras. */
  match_status?: number;
}

/**
 * The provider's board API only answers residential IPs (datacenter ranges
 * get a refusal or a stripped `items`), so a failed or empty direct answer
 * retries once through the home relay's `/index` endpoint.
 */
async function fetchSportplusIndex(url: string): Promise<string | null> {
  const direct = await fetchText(url, `${SPORTPLUS_SITE}/football/`);
  if (direct) {
    try {
      const items = (JSON.parse(direct) as { items?: unknown[] }).items;
      if (Array.isArray(items) && items.length > 0) return direct;
    } catch {
      return direct;
    }
  }
  const relay = await getHomeRelayUrl();
  const secret = process.env.LPF_HOME_SECRET?.trim() ?? "";
  if (!relay || !secret) return direct;
  return (
    (await fetchText(
      `${relay}/index?u=${encodeURIComponent(url)}&key=${encodeURIComponent(secret)}`,
      `${SPORTPLUS_SITE}/football/`
    )) ?? direct
  );
}

async function sportplusMatches(competitionId: string): Promise<SportplusItem[]> {
  const url = `${SPORTPLUS_API}/matches/index?fw=3.1&lang=es&lcfg=es&offset=0&sport_id=football&tournament_id=${encodeURIComponent(
    competitionId
  )}`;
  const text = await fetchSportplusIndex(url);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as { items?: SportplusItem[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

/** The endpoint that serves the match detail, including the `ls` playlists. */
function sportplusViewUrl(competitionId: string, matchIdValue: string): string {
  return `${SPORTPLUS_API}/matches/view?id=${encodeURIComponent(matchIdValue)}&sport_id=football&tournament_id=${encodeURIComponent(
    competitionId
  )}&lang=es&lcfg=es&fw=3.1`;
}

/**
 * The real playback options of a match, in the order the provider lists
 * them. Identical links (or the same file with another signature) are the
 * same option and are kept once.
 */
function playlistsFromLs(ls: unknown): string[] {
  if (!Array.isArray(ls)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const candidate of ls) {
    if (typeof candidate !== "string") continue;
    if (!/^https:\/\/[^"'\s]+\.m3u8(\?|$)/i.test(candidate)) continue;
    const url = new URL(candidate);
    const key = `${url.origin}${url.pathname}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

/** Resolution the playlist announces, so the option can be labelled honestly. */
async function playlistQuality(playlistUrl: string): Promise<string | undefined> {
  try {
    const res = await fetch(playlistUrl, {
      headers: { Accept: "*/*", "User-Agent": BROWSER_HEADERS["User-Agent"] },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const text = await res.text();
    const heights = [...text.matchAll(/RESOLUTION=\d+x(\d+)/gi)]
      .map((match) => Number(match[1]))
      .filter((height) => Number.isFinite(height) && height > 0);
    if (!heights.length) return undefined;
    if (heights.length > 1) return "Auto";
    return `${heights[0]}p`;
  } catch {
    return undefined;
  }
}

/**
 * The playlist of a sportplus match.
 *
 * The `matches/view` endpoint answers with the `ls` array as clean JSON and
 * is reachable from every network; the match page is only a fallback because
 * the site in front of it refuses datacenter traffic with a 404.
 */
async function sportplusPlaylist(
  competitionId: string,
  matchIdValue: string
): Promise<{ primary: string | null; sources: Array<{ src: string; quality?: string }> }> {
  /** Adds the resolution each option announces; a link that fails is kept. */
  const withQuality = async (urls: string[]) =>
    Promise.all(urls.map(async (src) => ({ src, quality: await playlistQuality(src) })));

  const playlistsOf = (text: string | null): { primary: string | null; sources: string[] } => {
    if (!text) return { primary: null, sources: [] };
    try {
      const all = playlistsFromLs((JSON.parse(text) as { item?: { ls?: unknown } }).item?.ls);
      return { primary: all[0] ?? null, sources: all };
    } catch {
      return { primary: null, sources: [] };
    }
  };

  const view = await fetchText(sportplusViewUrl(competitionId, matchIdValue), `${SPORTPLUS_SITE}/football/`);
  const direct = playlistsOf(view);
  if (direct.primary) return { primary: direct.primary, sources: await withQuality(direct.sources) };

  // Serverless IPs get the match data with `ls` stripped; the home relay
  // egresses through a residential connection where the provider answers
  // in full.
  const relay = await getHomeRelayUrl();
  const secret = process.env.LPF_HOME_SECRET?.trim() ?? "";
  if (relay && secret) {
    const relayView = await fetchText(
      `${relay}/view?id=${encodeURIComponent(matchIdValue)}&tid=${encodeURIComponent(competitionId)}&key=${encodeURIComponent(secret)}`,
      `${SPORTPLUS_SITE}/football/`
    );
    const viaRelay = playlistsOf(relayView);
    if (viaRelay.primary) return { primary: viaRelay.primary, sources: await withQuality(viaRelay.sources) };
  }

  const url = `${SPORTPLUS_SITE}/football/${competitionId}/${matchIdValue}/`;
  let page: string | null = null;
  try {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, Referer: `${SPORTPLUS_SITE}/football/` },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    page = await res.text();
  } catch {
    page = null;
  }
  if (!page || !page.includes('"ls"')) {
    console.warn(`[lpf] no stream source for ${competitionId}/${matchIdValue}`);
    return { primary: null, sources: [] };
  }
  for (const block of page.matchAll(/"ls":\[([^\]]*)\]/g)) {
    for (const url of block[1].matchAll(/https?:\\u002F\\u002F[^"]+/g)) {
      const clean = url[0].replace(/\\u002F/g, "/");
      if (clean.startsWith("https://") && /\.m3u8(\?|$)/i.test(clean)) {
        const primary = clean;
        const sources = playlistsFromLs((JSON.parse(`{"ls":[${block[1]}]}`) as { item?: { ls?: unknown } }).item?.ls);
        return { primary, sources: await withQuality(sources) };
      }
    }
  }
  console.warn(`[lpf] no m3u8 in page ${competitionId}/${matchIdValue} (len ${page.length}, hasLs=${page.includes('"ls"')})`);
  return { primary: null, sources: [] };
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

/**
 * The same fixture listed twice by the provider (it publishes the same game
 * under two ids when it moves the kickoff). Two teams can not play each other
 * twice in 48 hours, so that window is enough to tell a duplicate apart from
 * a real rematch.
 */
const FIXTURE_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Identity of a fixture: the canonical pair of teams. */
export function fixtureKey(home: string, away: string): string {
  const canon = (name: string) =>
    cleanTeamName(name)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  return `${canon(home)}|${canon(away)}`;
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
    // Parallel: four sequential fetches can each burn the 20s timeout on a
    // slow upstream and the route would look dead long before they finish.
    return Promise.all(
      SPORTPLUS_COMPETITIONS.map(async (competition) => ({
        competition,
        items: await sportplusMatches(competition.id),
      }))
    );
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
  /** Kickoffs per fixture, to drop the duplicates the provider repeats. */
  const kickoffs = new Map<string, number[]>();

  /**
   * True when the provider published the same fixture again under another id
   * (it does that when it reschedules the game). The first one is kept.
   */
  const isDuplicateFixture = (home: string, away: string, start: string): boolean => {
    const at = start ? Date.parse(start) : Number.NaN;
    if (!Number.isFinite(at)) return false;
    const key = fixtureKey(home, away);
    const known = kickoffs.get(key) ?? [];
    if (known.some((other) => Math.abs(other - at) < FIXTURE_WINDOW_MS)) return true;
    known.push(at);
    kickoffs.set(key, known);
    return false;
  };

  for (const { competition, items } of sportplus) {
    for (const item of items) {
      const matchIdValue = item.id ? String(item.id) : "";
      const home = item.home?.name?.trim() ?? "";
      const away = item.away?.name?.trim() ?? "";
      if (!matchIdValue || !home || !away) continue;
      const start = item.start ? toArgentina(item.start) : "";
      if (isDuplicateFixture(home, away, start)) continue;
      // Sportplus competitions are all Argentine — a Paraguayan fixture filed
      // under them is provider noise, not a local match.
      if (hasParaguayanClub(home, away)) continue;
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
        status: sportplusStatus(item),
        viewTid: competition.id,
        viewMid: matchIdValue,
      });
    }
  }

  for (const event of angulismo) {
    const title = eventTitle(event);
    if (!title) continue;
    const [home, away] = splitTeams(title);
    const start = eventDate(event);
    if (isDuplicateFixture(home, away, start)) continue;
    // The aggregator sometimes files Paraguayan fixtures under Primera
    // Nacional — they are not Argentine second-division matches.
    if (hasParaguayanClub(home, away)) continue;
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
      competition: "Primera B Nacional",
      home,
      away,
      start,
      status: statusOf(undefined, instant),
    });
  }

  // Matches the providers drop stay listed for a while: their stream usually
  // outlives the agenda entry. The store lives in the shared cache so the
  // resolver keeps finding the reference.
  const now = Date.now();
  const storeKey = "lpf:recent:v1";
  const stored = (await getCache<Record<string, { match: LpfMatch; ref: MatchRef; seenAt: number }>>(storeKey)) ?? {};
  const freshIds = new Set(matches.map((match) => match.id));
  /** Competitions the section publishes; anything else left the agenda. */
  const sectionCompetitions = new Set([
    ...SPORTPLUS_COMPETITIONS.map((competition) => competition.name),
    "Primera B Nacional",
  ]);

  for (const [id, entry] of Object.entries(stored)) {
    if (freshIds.has(id)) continue;
    if (!sectionCompetitions.has(entry.match.competition)) continue;
    if (hasParaguayanClub(entry.match.home, entry.match.away)) continue;
    const age = now - entry.seenAt;
    if (age > RECENT_TTL) continue;
    const status =
      entry.match.status === "live"
        ? age <= LIVE_GRACE_MS
          ? "live"
          : "finished"
        : entry.match.status;
    matches.push({
      ...entry.match,
      status,
      viewTid: entry.ref.source === "sportplus" ? entry.ref.competitionId : entry.match.viewTid,
      viewMid: entry.ref.source === "sportplus" ? entry.ref.matchId : entry.match.viewMid,
    });
    refs.set(id, entry.ref);
  }

  const next: Record<string, { match: LpfMatch; ref: MatchRef; seenAt: number }> = {};
  for (const match of matches) {
    const ref = refs.get(match.id);
    if (!ref) continue;
    next[match.id] = {
      match,
      ref,
      seenAt: freshIds.has(match.id) ? now : (stored[match.id]?.seenAt ?? now),
    };
  }
  await setCache(storeKey, next, RECENT_TTL + 60 * 1000);

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

/** The player of one provider reference. */
async function resolveRefStream(ref: MatchRef, id: string): Promise<LpfMatchStream | null> {
  if (ref.source === "sportplus") {
    const result = await cached(`lpf:match:v2:${id}`, STREAM_TTL, () =>
      sportplusPlaylist(ref.competitionId, ref.matchId)
    );
    if (!result.primary) return null;
    return {
      src: result.primary,
      kind: "hls",
      sources: result.sources.map((source) => ({
        src: source.src,
        kind: "hls" as const,
        quality: source.quality,
      })),
    };
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
  const players = extractAngulismoPlayers(event);
  if (!players.length) return null;
  return {
    src: players[0].iframe,
    kind: "iframe",
    sources: players.map((player) => ({ src: player.iframe, kind: "iframe" as const })),
  };
}

/* ------------------------------------------------------------------ *
 * Sportplus live scoreboard
 * ------------------------------------------------------------------ */

/** A live/finished match with its score, for fixture enrichment. */
export interface SportplusScoreEvent {
  home: string;
  away: string;
  /** ISO start of the provider (`+0300` offset normalized to `+03:00`). */
  date: string;
  homeScore: number | null;
  awayScore: number | null;
  statusShort: "1H" | "HT" | "2H" | "ET" | "P" | "FT";
  /** Total elapsed minutes of the broadcast clock. */
  elapsed: number | null;
}

/** Provider `start` uses "+0300"; Date needs the colon form. */
function parseProviderDate(iso: string): Date {
  return new Date(iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}

function sportplusScoreStatus(item: SportplusItem): SportplusScoreEvent["statusShort"] | null {
  const status = (item.status ?? "").toLowerCase();
  if (status === "finished" || status === "ended") return "FT";
  if (status !== "live") return null;
  const ms = item.match_status;
  if (ms === 1) return "1H";
  if (ms === 2) return "2H";
  if (ms === 3) return "ET";
  if (ms === 6) return "P";
  const minutes = Math.floor((item.time_sec ?? 0) / 60);
  return minutes < 45 ? "1H" : "2H";
}

function sportplusTotals(item: SportplusItem): { home: number | null; away: number | null } {
  const homePk = item.home?.pk_id;
  const awayPk = item.away?.pk_id;
  if (homePk === undefined || awayPk === undefined) return { home: null, away: null };
  const entries = Array.isArray(item.score) ? item.score : [];
  const total = entries.find((entry) => entry.p === 0) ??
    entries.filter((entry) => (entry.p ?? 0) > 0).reduce<Record<string, number> & { p?: number }>(
      (acc, entry) => {
        for (const [key, value] of Object.entries(entry)) {
          if (key === "p" || key === "break") continue;
          acc[key] = (acc[key] ?? 0) + (Number(value) || 0);
        }
        return acc;
      },
      { p: 0 }
    );
  const toScore = (pk: number) => {
    const v = Number(total[String(pk)]);
    return Number.isFinite(v) ? v : null;
  };
  return { home: toScore(homePk), away: toScore(awayPk) };
}

/**
 * Every live/finished football match on the provider's global board, with
 * score and clock — the global `matches/index` (no `tournament_id`) answers
 * with the live board of the whole site. Cached briefly for fixture
 * enrichment; the watch page keeps using `listSportplusMatches`.
 */
export async function listSportplusScores(): Promise<SportplusScoreEvent[]> {
  return cached("lpf:sp-scores:v1", 20_000, async () => {
    const url = `${SPORTPLUS_API}/matches/index?fw=3.1&lang=es&lcfg=es&offset=0&sport_id=football`;
    const text = await fetchSportplusIndex(url);
    if (!text) return [];
    try {
      const parsed = JSON.parse(text) as { items?: SportplusItem[] };
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      const out: SportplusScoreEvent[] = [];
      for (const item of items) {
        const statusShort = sportplusScoreStatus(item);
        const home = item.home?.name?.trim() ?? "";
        const away = item.away?.name?.trim() ?? "";
        if (!statusShort || !home || !away || !item.start) continue;
        const totals = sportplusTotals(item);
        const elapsed = statusShort === "FT" ? null : Math.floor((item.time_sec ?? 0) / 60);
        out.push({
          home,
          away,
          date: item.start,
          homeScore: totals.home,
          awayScore: totals.away,
          statusShort,
          elapsed,
        });
      }
      return out;
    } catch {
      return [];
    }
  });
}

function argentinaDay(dateISO: string): string {
  const d = parseProviderDate(dateISO);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

/**
 * Finds the provider event for a fixture: same Argentine calendar day + both
 * team pairs matching (order-insensitive, via the shared fuzzy matcher).
 */
export function findSportplusScoreEvent(
  events: SportplusScoreEvent[],
  homeTeam: string,
  awayTeam: string,
  dateISO: string
): SportplusScoreEvent | null {
  const day = argentinaDay(dateISO);
  if (!day) return null;
  for (const event of events) {
    if (argentinaDay(event.date) !== day) continue;
    if (matchTeamsPair(homeTeam, awayTeam, event.home, event.away)) return event;
  }
  return null;
}

/** The player of a match. */
export async function resolveLpfMatchStream(id: string): Promise<LpfMatchStream | null> {
  if (!/^lpm_[a-f0-9]{16}$/.test(id)) return null;

  const { matches, refs } = await buildMatches();
  const ref = refs.get(id);
  if (!ref) {
    console.warn(`[lpf] match not found: ${id} | known: ${matches.slice(0, 3).map((m) => m.id).join(", ")}`);
    return null;
  }

  return resolveRefStream(ref, id);
}

/* ------------------------------------------------------------------ *
 * Sportplus as a watch-page player (main fixture, any competition)
 * ------------------------------------------------------------------ */

export interface SportplusLiveMatch {
  /** Provider match id (the `id` query param of `matches/view`). */
  id: string;
  /** Provider competition id (the `tournament_id` query param). */
  tournamentId: string;
  home: string;
  away: string;
  start: string;
  status: string;
}

/**
 * Every football match the provider is listing right now, across ALL
 * competitions — the global `matches/index` (no `tournament_id`) answers
 * with the live board of the whole site. Cached briefly: the watch page
 * calls this on every player switch.
 */
export async function listSportplusMatches(): Promise<SportplusLiveMatch[]> {
  return cached("lpf:sp-index:v1", LIST_TTL, async () => {
    const url = `${SPORTPLUS_API}/matches/index?sport_id=football&lang=es&lcfg=es&fw=3.1&offset=0`;
    const text = await fetchSportplusIndex(url);
    if (!text) return [];
    try {
      const parsed = JSON.parse(text) as { items?: SportplusItem[] };
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      const out: SportplusLiveMatch[] = [];
      for (const item of items) {
        const id = item.id ? String(item.id) : "";
        const tournamentId = item.tournament_id !== undefined ? String(item.tournament_id) : "";
        const home = item.home?.name?.trim() ?? "";
        const away = item.away?.name?.trim() ?? "";
        if (!id || !tournamentId || !home || !away) continue;
        out.push({ id, tournamentId, home, away, start: item.start ?? "", status: item.status ?? "" });
      }
      return out;
    } catch {
      return [];
    }
  });
}

/**
 * The playback sources of one sportplus match addressed directly by its
 * provider coordinates — used by the watch page, where the fixture comes
 * from the main agenda and not from an `lpm_` id.
 */
export async function resolveSportplusMatchStream(
  competitionId: string,
  matchIdValue: string
): Promise<{ primary: string | null; sources: Array<{ src: string; quality?: string }> } | null> {
  if (!competitionId || !matchIdValue) return null;
  return cached(`lpf:spview:${competitionId}:${matchIdValue}`, STREAM_TTL, () =>
    sportplusPlaylist(competitionId, matchIdValue)
  );
}
