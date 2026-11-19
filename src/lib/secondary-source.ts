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

const SECONDARY_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface FetchOptions {
  /** Page that embeds this one; some providers gate their player on it. */
  referer?: string;
  /**
   * Channel pages must look like a framed navigation. The blogspot step of the
   * chain answers with an empty `post-body` unless the request advertises
   * `Sec-Fetch-Dest: iframe`, which would hide the published player from us.
   */
  embedded?: boolean;
}

async function fetchHtml(url: string, signal: AbortSignal, options: FetchOptions = {}): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": SECONDARY_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
  };
  if (options.embedded) {
    headers["Sec-Fetch-Dest"] = "iframe";
    headers["Sec-Fetch-Mode"] = "navigate";
    headers["Sec-Fetch-Site"] = "cross-site";
  }
  if (options.referer) headers.Referer = options.referer;

  const response = await fetch(url, {
    headers,
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

/**
 * Hosts that may serve Player 1 channel pages: the agenda host plus the
 * configured wrapper domains. Used to keep the bare-frame route from becoming
 * an open proxy.
 */
export function secondaryHosts(): Set<string> {
  const base = agendaUrl();
  if (base) return wrapperHosts(base);
  return new Set(
    (process.env.SECONDARY_PLAYER_WRAPPER_HOSTS ?? "")
      .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean)
  );
}

/** Resolve a published channel page down to its bare player URL, or null. */
export async function resolveSecondaryPlayer(
  pageUrl: string,
  hosts: Set<string> = secondaryHosts()
): Promise<string | null> {
  try {
    return await resolvePlayer(pageUrl, hosts);
  } catch {
    return null;
  }
}

async function resolvePlayer(pageUrl: string, hosts: Set<string>): Promise<string> {
  const key = cacheKey("player", [...hosts].sort().join(",") + "|" + pageUrl);
  return cached(key, async () => {
    let current = pageUrl;
    // The wrapper chain is what a browser sees inside our iframe: each page is
    // navigated as a framed document and carries the previous page as referer.
    // The blogspot step publishes its player only under those conditions.
    let referer: string | undefined;
    const visited = new Set<string>();
    const signal = AbortSignal.timeout(20000);
    for (let depth = 0; depth < 4; depth++) {
      if (visited.has(current)) throw new Error("Player wrapper cycle");
      visited.add(current);
      const url = httpsUrl(current);
      if (!url || !hosts.has(url.host)) throw new Error("Invalid wrapper");
      const html = await fetchHtml(current, signal, { embedded: true, referer });
      referer = current;
      const next = extractSecondaryPlayer(html, current);
      if (!next) throw new Error("Player iframe missing");
      if (!hosts.has(new URL(next).host)) return next;
      current = next;
    }
    throw new Error("Player wrapper depth exceeded");
  });
}

/**
 * Value of a simple JS assignment: literal string, atob("b64"), atob(ident)
 * or ident pointing to another literal/atob (bounded recursion).
 */
function jsAssignedValue(html: string, ident: string, depth = 0): string | null {
  if (depth > 3) return null;
  const assign = html.match(new RegExp(`(?:const|let|var)\\s+${ident}\\s*=\\s*([^;]+);`));
  if (!assign) return null;
  const expr = assign[1].trim();
  const literal = expr.match(/^["'`]([^"'`]+)["'`]$/);
  if (literal) return literal[1];
  const atobCall = expr.match(/^atob\(\s*(?:["']([A-Za-z0-9+/=]+)["']|([A-Za-z_$][\w$]*))\s*\)$/);
  if (!atobCall) return null;
  if (atobCall[1]) {
    try {
      return Buffer.from(atobCall[1], "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  const inner = jsAssignedValue(html, atobCall[2], depth + 1);
  if (!inner) return null;
  try {
    return Buffer.from(inner, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Next embed URL inside a wrapper document. Covers static iframe tags and the
 * JS-created frames these players use (`iframe.src = "..."`, `= atob("...")`,
 * `= someVar` where the var decodes an atob chain).
 */
export function nextEmbedUrl(html: string, pageUrl: string): string | null {
  const candidates: string[] = [];
  for (const tag of html.matchAll(/<iframe\b[^>]*>/gi)) {
    const src = tag[0].match(/\b(?:src|data-src)\s*=\s*["']([^"']+)["']/i);
    if (src) candidates.push(src[1]);
  }
  for (const m of html.matchAll(
    /iframe\.src\s*=\s*(?:atob\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)|["']([^"']+)["']|([A-Za-z_$][\w$]*))/gi
  )) {
    if (m[1]) {
      try {
        candidates.push(Buffer.from(m[1], "base64").toString("utf8"));
      } catch {
        /* ignore */
      }
    } else if (m[2]) {
      candidates.push(m[2]);
    } else if (m[3]) {
      const resolved = jsAssignedValue(html, m[3]);
      if (resolved) candidates.push(resolved);
    }
  }
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate, pageUrl);
      if (url.protocol === "https:" && !url.username && !url.password && url.href !== pageUrl) {
        return url.href;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Public https host only: dotted name, never an IP literal. */
function isPublicEmbedHost(url: URL): boolean {
  const host = url.hostname;
  if (!host.includes(".") || host.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return true;
}

export interface DeepPlayer {
  url: string;
  /** Page that embedded the final document — used as its Referer. */
  referer: string;
}

const DEEP_MAX_DEPTH = 8;

/**
 * Follows the whole iframe-wrapper chain (any public https host) until the
 * document that is not a pure frame — the real player page. Returns null when
 * the chain breaks or loops.
 */
export async function resolveDeepPlayer(startUrl: string): Promise<DeepPlayer | null> {
  const key = cacheKey("deep", startUrl);
  try {
    return await cached(key, async (): Promise<DeepPlayer> => {
      let current = startUrl;
      let referer: string | undefined;
      const visited = new Set<string>();
      const signal = AbortSignal.timeout(25000);
      for (let depth = 0; depth < DEEP_MAX_DEPTH; depth++) {
        if (visited.has(current)) throw new Error("Embed cycle");
        visited.add(current);
        const url = httpsUrl(current);
        if (!url || !isPublicEmbedHost(url)) throw new Error("Invalid embed host");
        const html = await fetchHtml(current, signal, { embedded: true, referer });
        const next = nextEmbedUrl(html, current);
        if (!next) return { url: current, referer: referer ?? current };
        referer = current;
        current = next;
      }
      throw new Error("Embed depth exceeded");
    });
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget warm-up: resolving a match's channels already walks the
 * wrapper chain, so kick off the deep chain in the background. By the time the
 * visitor picks the player, /api/secondary only has the final document fetch
 * left (~2 s instead of ~20-30 s cold).
 */
export function warmSecondaryPlayers(channels: Channel[], limit = 3): void {
  for (const channel of channels.slice(0, limit)) {
    if (channel.provider === "secondary-feed" && channel.url) {
      void resolveDeepPlayer(channel.url);
    }
  }
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
