import { createDecipheriv, createHash } from "node:crypto";
import { matchTeamsPair } from "./team-matching";
import { isMenFootballMatch } from "./constants";
import { getCache, setCache } from "./cache";
import { embedPageFor, resolveEmbedChannels } from "./embed-resolver";
import { toEmbedRelayUrl } from "./hls-proxy";
import type { Channel } from "./types";

type FeedMatch = {
  id?: number; api_id?: string; title?: string;
  sport?: string; sport_name?: string; league?: string; starts_at?: string;
  timestamp?: number; live?: boolean; finished?: boolean; pinned?: boolean;
  home?: { name?: string }; away?: { name?: string };
  streams?: { name?: string; origin?: string; embed_url?: string; real_url?: string | null }[];
};

/** Decode the public feed format; configuration stays on the server. */
export function decodePrimaryFeed(raw: string, key: string, alphabet: string, plain: string): unknown {
  const text = raw.trim();
  if (!text.startsWith("k1")) return JSON.parse(text);
  if (alphabet.length !== 64 || new Set(alphabet).size !== 64 || plain.length !== 64) throw new Error("Invalid feed configuration");
  const mapped = Array.from(text.slice(2)).reverse().map(char => {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid feed payload");
    return plain[index];
  }).join("");
  const bytes = Buffer.from(mapped, "base64url");
  const secret = Buffer.from(key, "base64");
  if (secret.length !== 32 || bytes.length < 28) throw new Error("Invalid feed payload");
  const decipher = createDecipheriv("aes-256-gcm", secret, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(-16));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString("utf8"));
}

export function parsePrimaryChannels(data: unknown, home: string, away: string): Channel[] {
  const matches = (data as { matches?: FeedMatch[] } | null)?.matches;
  if (!Array.isArray(matches)) return [];
  const channels: Channel[] = [];
  for (const match of matches) {
    if (!match || match.sport !== "futbol" || typeof match.home?.name !== "string" || typeof match.away?.name !== "string") continue;
    if (!isMenFootballMatch(match.league ?? "", match.home.name, match.away.name)) continue;
    if (!matchTeamsPair(match.home.name, match.away.name, home, away)) continue;
    if (!Array.isArray(match.streams)) continue;
    for (const stream of match.streams) {
      // Prefer a published media playlist when one is available. An HLS URL
      // avoids the provider's frame policy and can be played by HlsPlayer.
      // Otherwise retain the published embed page as the only safe fallback.
      // Keep every feed entry, including repeated URLs and names.
      const direct = typeof stream?.real_url === "string" && /\.m3u8(?:[?#]|$)/i.test(stream.real_url)
        ? stream.real_url
        : undefined;
      const candidate = direct || stream?.embed_url || (stream?.origin === "generated" ? stream.real_url : undefined);
      if (typeof candidate !== "string") continue;
      try {
        const url = new URL(candidate);
        if (url.protocol !== "https:" || url.username || url.password) continue;
        const name = typeof stream.name === "string" ? stream.name.trim() : "";
        const kind = /\.m3u8$/i.test(url.pathname) ? "hls" : "iframe";
        channels.push({
          id: `primary-${createHash("sha256").update(url.href).digest("hex").slice(0, 16)}-${channels.length + 1}`,
          name: name || `Señal ${channels.length + 1}`,
          url: url.href, kind,
          ...(kind === "iframe" ? { provider: "primary-feed" as const } : {}),
        });
      } catch { /* Ignore malformed entries without losing other signals. */ }
    }
  }
  return channels;
}

const feedCache = new Map<string, { data: unknown; expires: number }>();
const feedPending = new Map<string, Promise<unknown>>();

const CHANNEL_CACHE_TTL = 60_000;

/**
 * Second feed on the same API host: `/api/v1/gsc/matches` carries the
 * non-football cards (MMA, boxing, WWE, NBA, NHL...) that futbolvivo.tv
 * lists under its sport filters. Same encryption keys as the latin feed.
 */
const GSC_FEED_URL =
  process.env.GSC_PLAYER_AGENDA_URL?.trim() ||
  "https://cdn.strm-api.org/api/v1/gsc/matches";

export type PrimaryFeedKind = "latin" | "gsc";

function feedUrl(kind: PrimaryFeedKind): string | null {
  if (kind === "gsc") return GSC_FEED_URL;
  return process.env.PRIMARY_PLAYER_AGENDA_URL?.trim() || null;
}

function feedConfig(url: string): string {
  const key = process.env.PRIMARY_PLAYER_DATA_KEY ?? "";
  const alphabet = process.env.PRIMARY_PLAYER_DATA_ALPHABET ?? "";
  const plain = process.env.PRIMARY_PLAYER_PLAIN_ALPHABET ?? "";
  return createHash("sha256").update(JSON.stringify([url, key, alphabet, plain])).digest("hex");
}

/**
 * Decoded primary feed (the same one Reproductor 1 uses), memoised for 60s
 * per feed kind. Football and combat agendas share the upstream fetches.
 */
async function getPrimaryFeedData(kind: PrimaryFeedKind = "latin"): Promise<unknown> {
  const url = feedUrl(kind);
  if (!url) throw new Error("Primary feed not configured");
  const config = feedConfig(url);
  const hit = feedCache.get(config);
  if (hit && hit.expires > Date.now()) return hit.data;
  let promise = feedPending.get(config);
  if (!promise) {
    promise = (async () => {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("Feed unavailable");
      const key = process.env.PRIMARY_PLAYER_DATA_KEY ?? "";
      const alphabet = process.env.PRIMARY_PLAYER_DATA_ALPHABET ?? "";
      const plain = process.env.PRIMARY_PLAYER_PLAIN_ALPHABET ?? "";
      const data = decodePrimaryFeed(await response.text(), key, alphabet, plain);
      feedCache.set(config, { data, expires: Date.now() + 60_000 });
      return data;
    })();
    feedPending.set(config, promise);
    promise.finally(() => feedPending.delete(config));
  }
  return promise;
}

/** One stream entry → playable channel, shared by football and combat. */
function feedStreamToChannel(
  stream: NonNullable<FeedMatch["streams"]>[number],
  salt: string,
  index: number
): Channel | null {
  const direct = typeof stream?.real_url === "string" && /\.m3u8(?:[?#]|$)/i.test(stream.real_url)
    ? stream.real_url
    : undefined;
  const candidate = direct || stream?.embed_url || (stream?.origin === "generated" ? stream.real_url : undefined);
  if (typeof candidate !== "string") return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const name = typeof stream.name === "string" ? stream.name.trim() : "";
    const kind = /\.m3u8$/i.test(url.pathname) ? "hls" : "iframe";
    return {
      id: `primary-${createHash("sha256").update(`${salt}|${url.href}`).digest("hex").slice(0, 16)}-${index + 1}`,
      name: name || `Señal ${index + 1}`,
      url: url.href, kind,
      ...(kind === "iframe" ? { provider: "primary-feed" as const } : {}),
    };
  } catch {
    return null;
  }
}

function feedMatchChannels(match: FeedMatch, salt: string): Channel[] {
  if (!Array.isArray(match.streams)) return [];
  const channels: Channel[] = [];
  for (const stream of match.streams) {
    const channel = feedStreamToChannel(stream, salt, channels.length);
    if (channel) channels.push(channel);
  }
  return channels;
}

/** All matches in a feed, decoded once per cache window. */
export async function listPrimaryMatches(kind: PrimaryFeedKind = "latin"): Promise<FeedMatch[]> {
  const data = await getPrimaryFeedData(kind);
  const matches = (data as { matches?: FeedMatch[] } | null)?.matches;
  return Array.isArray(matches) ? matches : [];
}

/**
 * Channels for one feed match id (combat events resolve by id, not teams).
 * `kind` selects which feed the id belongs to — ids are numeric in both
 * feeds and can collide, so the caller must pass the right one.
 */
export async function findPrimaryEventStreams(
  matchId: number,
  kind: PrimaryFeedKind = "latin"
): Promise<Channel[]> {
  const key = `primary-player:event-channels:${kind}:${matchId}`;
  const memo = await getCache<Channel[]>(key);
  if (memo) return memo;
  try {
    const matches = await listPrimaryMatches(kind);
    const match = matches.find((m) => m.id === matchId);
    if (!match) return [];
    const raw = feedMatchChannels(match, `event-${kind}-${matchId}`);
    // Point iframe channels at the resolved player page (framestream.php on
    // the kora-plus family) instead of the golygoals wrapper: the wrapper's
    // inner frame is refused by frame-ancestors, while the player page is
    // HTML-proxied like every other Reproductor-1 embed. When the signal is
    // live, resolveEmbedChannels upgrades it to HLS anyway.
    const channels = await Promise.all(
      raw.map(async (channel) => {
        if (channel.kind !== "iframe") return channel;
        const page = await embedPageFor(channel.url).catch(() => null);
        return page ? { ...channel, url: page.href } : channel;
      })
    );
    const resolved = await resolveEmbedChannels(channels);
    // Never hand the viewer a raw iframe for these events: the provider's
    // frame gate redirects unknown ancestors, so a not-yet-live signal would
    // show a broken frame instead of our player's retry state. Any embed we
    // could translate to a player page becomes an /api/hls relay channel —
    // the relay re-resolves the signed playlist on every request and starts
    // playing on its own the moment the signal goes live.
    const final = await Promise.all(
      resolved.map(async (channel) => {
        if (channel.kind !== "iframe") return channel;
        const page = await embedPageFor(channel.url).catch(() => null);
        if (!page) return channel;
        return { ...channel, url: toEmbedRelayUrl(page.href), kind: "hls" as const };
      })
    );
    await setCache(key, final, CHANNEL_CACHE_TTL);
    return final;
  } catch {
    console.warn("[primary-player] Event streams unavailable");
    return [];
  }
}

/**
 * Build (and briefly memoise) the playable channels for one fixture. Resolving
 * the feed's frame-restricted wrappers to HLS costs one upstream round trip per
 * signal, so the result is reused across the watch page's retries.
 */
async function buildChannels(
  data: unknown,
  home: string,
  away: string,
  config: string
): Promise<Channel[]> {
  const key = `primary-player:channels:${config}:${home.toLowerCase()}|${away.toLowerCase()}`;
  const memo = await getCache<Channel[]>(key);
  if (memo) return memo;
  const channels = await resolveEmbedChannels(parsePrimaryChannels(data, home, away));
  await setCache(key, channels, CHANNEL_CACHE_TTL);
  return channels;
}

export async function findPrimaryStreams(home: string, away: string): Promise<Channel[]> {
  const url = process.env.PRIMARY_PLAYER_AGENDA_URL?.trim();
  if (!url || !home || !away) return [];
  const config = feedConfig(url);
  try {
    const data = await getPrimaryFeedData("latin");
    return await buildChannels(data, home, away, config);
  } catch {
    console.warn("[primary-player] Source unavailable");
    return [];
  }
}
