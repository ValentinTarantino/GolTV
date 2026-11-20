import { getCache, setCache } from "./cache";
import type { CombatMatch, CombatStream } from "./combat-source";
import { combatFrameUrl } from "./combat-frame";
import { EMBED_USER_AGENT, isPlayerHost, resolveEmbedPlaylist } from "./embed-resolver";
import { toEmbedRelayUrl } from "./hls-proxy";
import { combatRelayUrl } from "./combat-relay";

/**
 * Turns the boxing/MMA embeds into playlists the native player can render.
 *
 * The agenda publishes three URLs per fight and none of them can be framed:
 * `embed_url` is a wrapper that frames a kora player whose CSP refuses every
 * origin but the provider's, `real_url` is a page whose CSP does the same, and
 * `web_url` answers `x-frame-options: SAMEORIGIN`. Framing any of them paints a
 * black rectangle (or the provider's decoy page) and nothing else.
 *
 * Both chains are resolvable on the server:
 *   wrapper  → player page → `?_json=1` → signed playlist (kora family)
 *   real_url → `const SOURCE` in the page → master playlist (gooz family)
 *
 * The kora playlist is CORS-open, so it is handed to the existing
 * `/api/hls?e=` relay. The gooz CDN only answers when the request carries the
 * embed page as `Referer`, which a browser cannot send, so those assets are
 * sealed for `/api/combat/stream` instead.
 *
 * Nothing is invented: a source is only published once its playlist — and, for
 * the gooz chain, its first segment — actually answers. When the provider has
 * not provisioned the fight yet, the section says so instead of showing a
 * frame that was never going to load.
 */

export interface CombatSource {
  src: string;
  kind: "hls" | "iframe";
  quality?: string;
}

/** Upstream playlists rotate hosts, so the resolved answer is cached briefly. */
const SOURCE_CACHE_TTL = 45_000;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_STREAMS = 3;

/** Pages that publish a `const SOURCE` playlist. Extended via env when it drifts. */
const DEFAULT_SOURCE_PAGE_HOSTS = ["aapmains.net"];
/** Hosts that hand out the signed master playlist. */
const DEFAULT_PLAYLIST_HOSTS = ["hereisman.net"];
const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]{2,62}$/i;
const EDGE_RE = /^[a-z0-9-]{2,24}$/i;

function envHosts(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/^\./, ""))
    .filter((entry) => DOMAIN_RE.test(entry));
}

function hostMatches(host: string, allowlist: string[]): boolean {
  const normalized = host.toLowerCase();
  return allowlist.some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`)
  );
}

function httpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** Deterministic edge pick so repeated resolutions hit the same host. */
function stableIndex(value: string, size: number): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % size;
}

/**
 * The wrapper only builds the player URL in the browser:
 * `https://${edge}.<domain>/framestream.php?id=<id>`. Reading both halves of
 * that expression server-side yields the page that owns the signed playlist.
 */
export function parseKoraPlayerPage(html: string, streamId: string): URL | null {
  if (!/^\d{1,12}$/.test(streamId)) return null;
  const rawEdges = html.match(/const\s+edges\s*=\s*\[([^\]]+)\]/i)?.[1] ?? "";
  const edges = rawEdges
    .split(",")
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ""))
    .filter((entry) => EDGE_RE.test(entry));
  const domain = html
    .match(/https:\/\/\$\{edge\}\.([a-z0-9][a-z0-9.-]{2,62})\/framestream\.php/i)?.[1]
    ?.toLowerCase();
  if (!edges.length || !domain || !DOMAIN_RE.test(domain)) return null;

  const edge = edges[stableIndex(streamId, edges.length)];
  const page = httpsUrl(`https://${edge}.${domain}/framestream.php?id=${encodeURIComponent(streamId)}`);
  return page && isPlayerHost(page.hostname) ? page : null;
}

/** Reads the master playlist a gooz page publishes as `const SOURCE = "…"`. */
export function parseSourcePlaylist(html: string): URL | null {
  const raw = html.match(/const\s+SOURCE\s*=\s*["']([^"']+)["']/)?.[1];
  if (!raw) return null;
  const url = httpsUrl(raw.replace(/\\\//g, "/"));
  if (!url) return null;
  const hosts = [...DEFAULT_PLAYLIST_HOSTS, ...envHosts("COMBAT_PLAYLIST_HOSTS")];
  return hostMatches(url.hostname, hosts) ? url : null;
}

/** `id` of an embed URL such as `…/new-stream-embed/60521` or `…?id=60521`. */
export function streamIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/(\d{1,12})\/?$/);
    if (match) return match[1];
    const param = url.searchParams.get("id") ?? url.searchParams.get("key") ?? "";
    return /^\d{1,12}$/.test(param) ? param : null;
  } catch {
    return null;
  }
}

function browserHeaders(referer: string): Record<string, string> {
  return {
    "User-Agent": EMBED_USER_AGENT,
    Accept: "*/*",
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
    Referer: referer,
  };
}

async function fetchText(url: URL, referer: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: browserHeaders(referer),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.text();
    return body.startsWith("#EXTM3U") ? body : null;
  } catch {
    return null;
  }
}

/** Non-comment lines of a playlist, resolved against it. */
function playlistUris(body: string, base: URL): URL[] {
  const uris: URL[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const url = httpsUrl(new URL(trimmed, base).toString());
    if (url) uris.push(url);
  }
  return uris;
}

/**
 * The master playlist is cached at the CDN for a couple of seconds and can
 * name a mirror that no longer has the fight, so the chain is walked all the
 * way to a real segment before the source is advertised.
 *
 * Live playlists rotate fast: the earliest segments are usually already gone,
 * so the freshest entries (the tail of the list) are probed first.
 */
export async function isPlayablePlaylist(master: URL, referer: string): Promise<boolean> {
  const masterBody = await fetchText(master, referer);
  if (!masterBody) return false;
  const variant = playlistUris(masterBody, master)[0];
  if (!variant) return false;

  const variantBody = await fetchText(variant, referer);
  if (!variantBody) return false;
  const segments = playlistUris(variantBody, variant);
  if (!segments.length) return false;

  const candidates = [...segments.slice(-4).reverse(), ...segments.slice(0, -4).reverse()];
  for (const segment of candidates.slice(0, 6)) {
    try {
      const res = await fetch(segment, {
        headers: { ...browserHeaders(referer), Range: "bytes=0-2047" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (contentType.includes("html") || contentType.includes("json")) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > 0) return true;
    } catch {
      // try the next segment
    }
  }
  return false;
}

/** Fetch the stream wrapper and translate it into the kora player page. */
async function koraPlayerPage(stream: CombatStream): Promise<URL | null> {
  if (!stream.embed_url) return null;
  const wrapper = httpsUrl(stream.embed_url);
  if (!wrapper) return null;

  const id = streamIdFromUrl(stream.embed_url);
  if (!id) return null;

  let html: string;
  try {
    const res = await fetch(wrapper, {
      headers: {
        ...browserHeaders(`${wrapper.origin}/`),
        Accept: "text/html,application/xhtml+xml",
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  return parseKoraPlayerPage(html, id);
}

/** kora family: the player page reports `ready` and signs its own playlist. */
async function resolveKoraSource(stream: CombatStream): Promise<CombatSource | null> {
  const page = await koraPlayerPage(stream);
  if (!page) return null;

  const playlist = await resolveEmbedPlaylist(page);
  if (!playlist) return null;

  return { src: toEmbedRelayUrl(page.href), kind: "hls", quality: "HD" };
}

/** gooz family: the page names a master playlist that is referer-locked. */
async function resolveGoozSource(stream: CombatStream): Promise<CombatSource | null> {
  if (!stream.real_url) return null;
  const page = httpsUrl(stream.real_url);
  if (!page) return null;

  const pageHosts = [...DEFAULT_SOURCE_PAGE_HOSTS, ...envHosts("COMBAT_SOURCE_PAGE_HOSTS")];
  if (!hostMatches(page.hostname, pageHosts)) return null;

  const referer = `${page.origin}/`;
  let html: string;
  try {
    const res = await fetch(page, {
      headers: {
        ...browserHeaders(referer),
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const master = parseSourcePlaylist(html);
  if (!master) return null;
  if (!(await isPlayablePlaylist(master, referer))) return null;

  return { src: combatRelayUrl(master.toString(), referer), kind: "hls", quality: "HD" };
}

/**
 * Every playable source of a fight, in preference order. An empty array means
 * the provider has not published its signal yet: the caller must show that
 * state instead of a frame that cannot render.
 */
export async function resolveCombatSources(match: CombatMatch): Promise<CombatSource[]> {
  const cacheKey = `combat:sources:v2:${match.id}`;
  const cached = await getCache<CombatSource[]>(cacheKey);
  if (cached) return cached;

  const sources: CombatSource[] = [];
  const seen = new Set<string>();
  const add = (source: CombatSource | null) => {
    if (!source || seen.has(source.src) || sources.length >= MAX_STREAMS) return;
    seen.add(source.src);
    sources.push(source);
  };

  for (const stream of match.streams.slice(0, MAX_STREAMS)) {
    // Both chains are independent: walk them together so a dead one does not
    // add its timeout to the other path.
    const [kora, gooz] = await Promise.allSettled([
      resolveKoraSource(stream),
      resolveGoozSource(stream),
    ]);
    if (kora.status === "fulfilled") add(kora.value);
    if (gooz.status === "fulfilled") add(gooz.value);
    if (sources.length >= MAX_STREAMS) break;
  }

  // Negative answers are cached too: a fight without signal must not turn the
  // page's retry timer into a scrape loop.
  await setCache(cacheKey, sources, SOURCE_CACHE_TTL);
  return sources;
}

/**
 * Framed fallback: the kora player page served through `/api/combat/frame`
 * (same-origin proxy that strips `frame-ancestors` and rewrites the player's
 * root-relative endpoints). Unlike the raw wrapper embeds — whose inner frame
 * is refused by CSP — this one actually renders, and it keeps polling `?_json`
 * until the provider provisions the signal.
 */
export async function resolveCombatFrames(match: CombatMatch): Promise<CombatSource[]> {
  const cacheKey = `combat:frames:v1:${match.id}`;
  const cached = await getCache<CombatSource[]>(cacheKey);
  if (cached) return cached;

  const frames: CombatSource[] = [];
  const seen = new Set<string>();
  for (const stream of match.streams.slice(0, MAX_STREAMS)) {
    const page = await koraPlayerPage(stream);
    if (!page) continue;
    const src = combatFrameUrl(page);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    frames.push({ src, kind: "iframe", quality: "HD" });
  }

  await setCache(cacheKey, frames, SOURCE_CACHE_TTL);
  return frames;
}
