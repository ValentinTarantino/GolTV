import { getCache, setCache } from "./cache";
import { toEmbedRelayUrl } from "./hls-proxy";
import type { Channel } from "./types";

/**
 * Resolution of frame-restricted player embeds.
 *
 * The feed's "generated" rows point at a static wrapper page that only builds
 * the real player URL in the browser (`?id=<ch>` becomes
 * `<edge>.<domain>/framelatin.php?ch=<ch>`) and then frames a page whose CSP
 * `frame-ancestors` refuses every origin but the provider's own family. The
 * player page itself answers `?_json=1` with the signed HLS path — but only for
 * requests that advertise `Sec-Fetch-Dest: iframe`; anything else is redirected
 * away. Resolving both steps server-side turns the blocked signal into a plain
 * HLS playlist that the native player can render.
 */

export const EMBED_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Player families the provider rotates between; extend via env when it drifts. */
const DEFAULT_PLAYER_DOMAINS = ["kora-plus.mov", "kora-plus.li", "kora-plus.app"];

const WRAPPER_PATH_RE = /\/streamlat\.html$/i;
const PLAYER_PAGE_PATH_RE = /\/framelatin\.php$/i;
const CHANNEL_PARAM_RE = /^[A-Za-z0-9._~-]{2,120}$/;
const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]{3,62}$/i;
const EDGE_RE = /^[a-z0-9-]{2,24}$/i;

const WRAPPER_CACHE_TTL = 5 * 60 * 1000;
const PLAYLIST_CACHE_TTL = 10_000;
const REQUEST_TIMEOUT_MS = 6000;

export interface WrapperConfig {
  domain: string;
  edges: string[];
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

function playerDomains(): string[] {
  const extra = (process.env.EMBED_PLAYER_DOMAINS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => DOMAIN_RE.test(entry));
  return [...new Set([...DEFAULT_PLAYER_DOMAINS, ...extra])];
}

/** True for the provider's own player hosts (any edge subdomain). */
export function isPlayerHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return playerDomains().some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`)
  );
}

/** True for a resolved player page we can query for its signed playlist. */
export function isEmbedPlayerPage(url: URL): boolean {
  return isPlayerHost(url.hostname) && PLAYER_PAGE_PATH_RE.test(url.pathname);
}

/** True for the feed's static wrapper page (builds the player URL client-side). */
export function isPlayerWrapperPage(url: URL): boolean {
  if (!WRAPPER_PATH_RE.test(url.pathname)) return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  // Never follow a wrapper pointed at an IP literal: the config we parse there
  // would turn this resolver into a request forwarder.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith("[") || host.includes(":")) return false;
  return true;
}

/** Extract the player domain and edge list from the wrapper's inline script. */
export function parseWrapperConfig(html: string): WrapperConfig | null {
  const domain = html.match(/edgeDomain\s*=\s*[^;]*?\|\|\s*['"]([^'"]+)['"]/i)?.[1]?.trim().toLowerCase();
  const rawEdges = html.match(/const\s+edges\s*=\s*\[([^\]]+)\]/i)?.[1] ?? "";
  const edges = rawEdges
    .split(",")
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ""))
    .filter((entry) => EDGE_RE.test(entry));
  if (!domain || !DOMAIN_RE.test(domain) || edges.length === 0) return null;
  return { domain, edges };
}

/** Deterministic edge pick so repeated builds keep the same upstream host. */
function stableIndex(value: string, size: number): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % size;
}

/**
 * Turn a wrapper URL (`streamlat.html?id=<ch>`) into the provider player page
 * the wrapper would have framed. The wrapper's own `domain`/`edge` overrides are
 * honoured but must stay inside the allowlisted player families.
 */
export function embedPageFromWrapper(wrapper: URL, config: WrapperConfig): URL | null {
  const requestedDomain = (wrapper.searchParams.get("domain") ?? "").trim().toLowerCase();
  const domain = DOMAIN_RE.test(requestedDomain) ? requestedDomain : config.domain;
  const channel =
    wrapper.searchParams.get("id") ||
    wrapper.searchParams.get("key") ||
    (wrapper.searchParams.get("mid")
      ? `${wrapper.searchParams.get("mid")}-${wrapper.searchParams.get("n") ?? "1"}`
      : "");
  if (!CHANNEL_PARAM_RE.test(channel)) return null;
  const edge = config.edges[stableIndex(channel, config.edges.length)];
  const page = httpsUrl(`https://${edge}.${domain}/framelatin.php?ch=${encodeURIComponent(channel)}`);
  return page && isPlayerHost(page.hostname) ? page : null;
}

async function wrapperConfig(wrapper: URL): Promise<WrapperConfig | null> {
  const key = `embed:wrapper:${wrapper.origin}${wrapper.pathname}`;
  const cached = await getCache<WrapperConfig>(key);
  if (cached) return cached;
  try {
    const response = await fetch(`${wrapper.origin}${wrapper.pathname}`, {
      headers: {
        "User-Agent": EMBED_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const config = parseWrapperConfig(await response.text());
    if (config) await setCache(key, config, WRAPPER_CACHE_TTL);
    return config;
  } catch {
    return null;
  }
}

/**
 * Resolve any frame-restricted embed URL to the player page that owns its
 * signed playlist. Wrapper pages are translated; player pages pass through;
 * everything else returns null so the caller keeps its iframe fallback.
 */
export async function embedPageFor(value: string | URL): Promise<URL | null> {
  const url = typeof value === "string" ? httpsUrl(value) : value;
  if (!url || url.protocol !== "https:") return null;
  if (isEmbedPlayerPage(url)) return url;
  if (!isPlayerWrapperPage(url)) return null;
  const config = await wrapperConfig(url);
  return config ? embedPageFromWrapper(url, config) : null;
}

interface CachedPlaylist {
  url: string;
  expiresAt: number;
}

/**
 * Ask a player page for its signed playlist (`?_json=1`). Tokens are short
 * lived, so results are cached only briefly; a not-yet-started signal reports
 * `ready:false` and is treated as unresolved instead of handing the player a
 * playlist that would 404.
 */
export async function resolveEmbedPlaylist(page: URL): Promise<URL | null> {
  if (!isEmbedPlayerPage(page)) return null;
  const key = `embed:playlist:${page.href}`;
  const cached = await getCache<CachedPlaylist>(key);
  if (cached) return httpsUrl(cached.url);

  const endpoint = new URL(page.href);
  endpoint.searchParams.set("_json", "1");

  try {
    const response = await fetch(endpoint, {
      headers: {
        "User-Agent": EMBED_USER_AGENT,
        Accept: "application/json,text/plain,*/*",
        Referer: `${page.origin}/`,
        // The player gate only answers requests that look like an embedded
        // frame; without this it redirects to an unrelated site.
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { url?: unknown; exp?: unknown; ready?: unknown };
    if (payload.ready !== true || typeof payload.url !== "string") return null;
    const playlist = httpsUrl(new URL(payload.url, page.origin).href);
    if (!playlist || !isPlayerHost(playlist.hostname)) return null;

    const expiresAt = typeof payload.exp === "number" ? payload.exp * 1000 : 0;
    const ttl = expiresAt
      ? Math.max(0, Math.min(PLAYLIST_CACHE_TTL, expiresAt - Date.now() - 20_000))
      : PLAYLIST_CACHE_TTL;
    if (ttl > 0) await setCache(key, { url: playlist.href, expiresAt }, ttl);
    return playlist;
  } catch {
    return null;
  }
}

/**
 * Drop the duplicated row of a signal once it plays natively. The feed lists
 * every signal twice (a frame-restricted "generated" wrapper and the page it
 * wraps); once one of them resolves to HLS the sibling adds nothing but a
 * blocked frame. Signals whose labels differ are never collapsed.
 */
export function collapseDuplicateLabels(channels: Channel[]): Channel[] {
  const playing = new Set(
    channels.filter((channel) => channel.kind === "hls").map((channel) => channel.name)
  );
  return channels.filter(
    (channel) => channel.kind === "hls" || !playing.has(channel.name)
  );
}

/**
 * Upgrade frame-restricted iframe channels to native HLS. Channels that are not
 * wrappers, or whose signal has not started, are returned untouched so the
 * caller keeps its existing fallback.
 */
export async function resolveEmbedChannels(channels: Channel[]): Promise<Channel[]> {
  const resolved = await Promise.all(
    channels.map(async (channel): Promise<Channel> => {
      if (channel.kind !== "iframe") return channel;
      const page = await embedPageFor(channel.url);
      if (!page) return channel;
      const playlist = await resolveEmbedPlaylist(page);
      if (!playlist) return channel;
      return {
        id: channel.id,
        name: channel.name,
        url: toEmbedRelayUrl(page.href),
        kind: "hls",
        ...(channel.headers ? { headers: channel.headers } : {}),
      };
    })
  );
  return collapseDuplicateLabels(resolved);
}
