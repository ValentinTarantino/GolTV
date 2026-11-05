import { createHash } from "node:crypto";
import { load } from "cheerio/slim";
import { cleanAgendaText } from "./agenda-text";
import type { Channel, MatchStatusShort } from "./types";
import { confirmSecondaryMlsDates } from "./secondary-schedule";
import { getCache, setCache } from "./cache";
import { isMenFootballMatch } from "./constants";
import { matchTeamsPair } from "./team-matching";

const CACHE_TTL = 5 * 60 * 1000;
const pending = new Map<string, Promise<unknown>>();
const NON_FOOTBALL = /\b(nhl|nba|nfl|mlb|basketball|baseball|hockey|tennis|tenis|rugby|cricket|volleyball|handball|ufc|formula|moto\s?gp)\b/i;

// The source currently publishes these two Argentine fixtures with their
// playback pages crossed. Keep the correction limited to this exact fixture
// pair and only apply it while both entries are present in the agenda.
const CROSSED_FIXTURE_SIGNALS = [
  [
    { home: "Atletico Tucuman", away: "Argentinos Juniors" },
    { home: "Independiente Rivadavia", away: "Banfield" },
  ],
] as const;

export interface SecondaryEmbed {
  id: string; // Absolute channel page URL, resolved server-side before playback.
  name: string;
}

export interface SecondaryMatch {
  slug: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  dateISO: string;
  dateInferred?: boolean;
  fixtureStatus?: MatchStatusShort;
  sources: SecondaryEmbed[];
}

function httpsUrl(value: string, base?: string): URL | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function agendaUrl(): string {
  return httpsUrl(process.env.SECONDARY_AGENDA_URL?.trim() ?? "")?.href ?? "";
}

function cacheKey(type: string, url: string): string {
  return "secondary:roja:v2:" + type + ":" + createHash("sha256").update(url).digest("hex");
}

async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = await getCache<T>(key);
  if (hit !== null) return hit;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight as Promise<T>;
  const work = (async () => {
    const value = await fetcher();
    await setCache(key, value, CACHE_TTL);
    return value;
  })();
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
  }
}

/** The table repeats each fixture for every signal and promotional link. */
export function parseSecondaryAgenda(html: string, baseUrl = agendaUrl()): SecondaryMatch[] {
  const base = httpsUrl(baseUrl);
  if (!base) return [];
  const $ = load(html);
  const fixtures = new Map<string, SecondaryMatch>();

  $("table tr").each((_, row) => {
    const league = cleanAgendaText($(row).find("b").first().text()).replace(/^LaLiga EA Sports$/i, "LaLiga");
    if (!league || NON_FOOTBALL.test(league)) return;
    $(row).find("a[href]").each((_, anchor) => {
      const teams = cleanAgendaText($(anchor).text()).match(/^(.+?)\s+vs\.?\s+(.+)$/i);
      if (!teams) return;
      const homeTeam = teams[1].trim();
      const awayTeam = teams[2].trim();
      if (!isMenFootballMatch(league, homeTeam, awayTeam)) return;
      const url = httpsUrl($(anchor).attr("href") ?? "", base.href);
      // Off-site promotional homepages are not playback candidates.
      if (!url || url.origin !== base.origin
        || !/^\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+(?:\.php)?\/?$/i.test(url.pathname)
        || url.pathname === base.pathname || /^\/index(?:\.php)?\/?$/i.test(url.pathname)) return;
      url.hash = "";
      const key = JSON.stringify([league.toLowerCase(), homeTeam.toLowerCase(), awayTeam.toLowerCase()]);
      const fixture: SecondaryMatch = fixtures.get(key) ?? {
        slug: (homeTeam + "-vs-" + awayTeam).toLowerCase().replace(/\s+/g, "-"),
        homeTeam, awayTeam, league,
        // No calendar date or source timezone is published. These records
        // enrich Player 3 only; never invent a kickoff or a live fixture card.
        dateISO: "", dateInferred: true, sources: [],
      };
      const name = url.pathname.replace(/\/$/, "").split("/").pop()!.replace(/\.php$/i, "").replace(/-/g, " ");
      if (!fixture.sources.some((source) => source.id === url.href)) {
        fixture.sources.push({ id: url.href, name });
      }
      fixtures.set(key, fixture);
    });
  });
  return [...fixtures.values()];
}

async function fetchHtml(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html,application/xhtml+xml" },
    cache: "no-store",
    // Do not follow arbitrary redirects beyond configured wrapper hosts.
    redirect: "error",
    signal,
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.text();
}

export async function fetchSecondaryAgenda(): Promise<SecondaryMatch[]> {
  const url = agendaUrl();
  if (!url) return [];
  try {
    const matches = await cached(cacheKey("agenda", url), async () => {
      const matches = parseSecondaryAgenda(await fetchHtml(url, AbortSignal.timeout(15000)), url);
      // A transient challenge/empty page must not poison the cache.
      if (!matches.length) throw new Error("No football fixtures found");
      return matches;
    });
    return await confirmSecondaryMlsDates(matches);
  } catch {
    console.warn("[secondary] Agenda unavailable");
    return [];
  }
}

/** Extract content players, excluding advertising/navbar/tracking frames. */
export function extractSecondaryPlayer(html: string, pageUrl: string): string | null {
  const $ = load(html);
  const frames = $("iframe[src], iframe[data-src]").toArray().filter((frame) => {
    const element = $(frame);
    if (element.is("[hidden], [aria-hidden='true']")) return false;
    if (element.parents("[hidden], [aria-hidden='true']").length) return false;
    if (/(?:navbar|advert|banner|tracking)/i.test((element.attr("id") ?? "") + " " + (element.attr("class") ?? ""))) return false;
    if ([element.attr("width"), element.attr("height")].some((size) => size !== undefined && Number(size) <= 1)) return false;
    return ![frame, ...element.parents().toArray()].some((node) =>
      /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test($(node).attr("style") ?? ""));
  });
  const rank = (frame: typeof frames[number]) => {
    const element = $(frame);
    return Number(element.is("[allowfullscreen], [allow*='fullscreen']")) * 2
      + Number(element.parents(".embed-responsive, .post-body, #player").length > 0);
  };
  frames.sort((a, b) => rank(b) - rank(a));
  for (const frame of frames) {
    const element = $(frame);
    const url = httpsUrl(element.attr("src") || element.attr("data-src") || "", pageUrl);
    if (url) return url.href;
  }
  return null;
}

function wrapperHosts(baseUrl: string): Set<string> {
  return new Set([
    new URL(baseUrl).host,
    ...(process.env.SECONDARY_PLAYER_WRAPPER_HOSTS ?? "")
      .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean),
  ]);
}

async function resolvePlayer(pageUrl: string, hosts: Set<string>): Promise<string> {
  const key = cacheKey("player", [...hosts].sort().join(",") + "|" + pageUrl);
  return cached(key, async () => {
    let current = pageUrl;
    const visited = new Set<string>();
    const signal = AbortSignal.timeout(20000);
    for (let depth = 0; depth < 4; depth++) {
      if (visited.has(current)) throw new Error("Player wrapper cycle");
      visited.add(current);
      const url = httpsUrl(current);
      if (!url || !hosts.has(url.host)) throw new Error("Invalid wrapper");
      const next = extractSecondaryPlayer(await fetchHtml(current, signal), current);
      if (!next) throw new Error("Player iframe missing");
      if (!hosts.has(new URL(next).host)) return next;
      current = next;
    }
    throw new Error("Player wrapper depth exceeded");
  });
}

export async function findSecondaryStreams(homeTeam: string, awayTeam: string): Promise<Channel[]> {
  const base = agendaUrl();
  if (!base) return [];
  const agenda = await fetchSecondaryAgenda();
  const requestedMatch = agenda.find((match) => matchTeamsPair(match.homeTeam, match.awayTeam, homeTeam, awayTeam));
  if (!requestedMatch) return [];

  const crossedPair = CROSSED_FIXTURE_SIGNALS.find((pair) =>
    pair.some((fixture) => matchTeamsPair(fixture.home, fixture.away, homeTeam, awayTeam))
  );
  const crossedFixture = crossedPair?.find((fixture) =>
    !matchTeamsPair(fixture.home, fixture.away, homeTeam, awayTeam)
  );
  const correctedMatch = crossedFixture && agenda.find((match) =>
    matchTeamsPair(match.homeTeam, match.awayTeam, crossedFixture.home, crossedFixture.away)
  );
  const sources = (correctedMatch ?? requestedMatch).sources;
  const unique = [...new Map(sources.map((source) => [source.id, source])).values()];
  const hosts = wrapperHosts(base);
  const channels: Channel[] = [];
  const resolveSource = async (source: SecondaryEmbed): Promise<Channel> => {
    let url = source.id;
    try {
      url = await resolvePlayer(source.id, hosts);
    } catch {
      // Keep published options even when unavailable to the server. The
      // channel page can recover or load successfully in the visitor's browser.
    }
    return {
      id: "secondary-" + createHash("sha256").update(source.id).digest("hex").slice(0, 12),
      name: source.name,
      url,
      kind: "iframe",
      provider: "secondary-feed",
    };
  };
  // Limit concurrent lookups, not the total number of published options.
  // Distinct channel pages remain selectable even if their current player
  // URLs coincide; the provider can update either page independently.
  for (let start = 0; start < unique.length; start += 4) {
    const resolved = await Promise.all(unique.slice(start, start + 4).map(resolveSource));
    channels.push(...resolved);
  }
  return channels;
}
