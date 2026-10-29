import { createDecipheriv } from "node:crypto";
import type { Channel } from "./types";
import { getCache, setCache, deleteCache, acquireLock, releaseLock } from "./cache";
import { toHlsProxyUrl } from "./hls-proxy";
import { matchTeamsPair } from "./team-matching";

// FutbolVideos (cdn.strm-api.org) returns its match list AES-256-GCM encrypted.
// The body is `k1` + customBase64( reverse( iv(12) || ciphertext || tag(16) ) ).
// The custom base64 uses a shuffled alphabet: to decode you reverse the string
// and map each character by its index into the standard base64 alphabet.
const STD_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const CUSTOM_B64 = "MiljRIn9PX1o63wGBYTtFsKmEkSur-pC_U02cvzAdy5e8ZqLDgJ4OhVN7QbHxfWa";

function apiUrl(): string {
  return process.env.FUTBOLVIDEOS_API_URL ?? "";
}

function aesKeyHex(): string {
  return process.env.FUTBOLVIDEOS_KEY ?? "";
}

/**
 * Decrypts a FutbolVideos API body into its plaintext JSON.
 * Exported for tests; the key and endpoint come from env (never hardcoded).
 */
export function decryptFutbolVideosBody(raw: string, keyHex: string): string {
  if (!raw.startsWith("k1")) throw new Error("unexpected payload prefix");

  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("invalid key length");

  const reversed = raw.slice(2).split("").reverse().join("");
  let mapped = "";
  for (const ch of reversed) {
    if (ch === "=") {
      mapped += "=";
      continue;
    }
    const idx = CUSTOM_B64.indexOf(ch);
    if (idx === -1) throw new Error("invalid payload character");
    mapped += STD_B64[idx];
  }

  const padded = mapped + "=".repeat((4 - (mapped.length % 4)) % 4);
  const buf = Buffer.from(padded, "base64");
  if (buf.length < 28) throw new Error("payload too short");

  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

export interface FutbolVideosStream {
  id: string | number;
  name?: string;
  language?: string;
  hd?: boolean;
  embed_url?: string;
  origin?: string;
  real_url?: string | null;
}

export interface FutbolVideosMatch {
  id: number;
  title?: string;
  league?: string;
  sport?: string;
  home?: { name?: string };
  away?: { name?: string };
  streams?: FutbolVideosStream[];
}

/**
 * Parses the decrypted payload, keeping only men's football matches that have
 * both team names. The latin endpoint is already football-only, but we filter
 * defensively in case the payload grows to other sports.
 */
export function parseFutbolVideosMatches(json: string): FutbolVideosMatch[] {
  try {
    const data = JSON.parse(json) as { matches?: FutbolVideosMatch[] };
    return (data.matches ?? []).filter(
      (m) => m.sport === "futbol" && !!m.home?.name && !!m.away?.name
    );
  } catch {
    return [];
  }
}

const MATCHES_CACHE_TTL = 5 * 60 * 1000;
const MATCHES_CACHE_KEY = "futbolvideos:latin:v1";

const RESOLVED_TTL = 5 * 60 * 1000;
const resolvedCache = new Map<string, { channels: Channel[]; expiresAt: number }>();

/** Clears module-level caches. Test-only — not used by the app at runtime. */
export async function __resetFutbolVideosCachesForTests(): Promise<void> {
  resolvedCache.clear();
  await deleteCache(MATCHES_CACHE_KEY);
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFERER = "https://futbolvideos.net/";
const M3U8_RE = /https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/;
const IFRAME_RE = /<iframe[^>]*\bsrc=["']([^"']+)["']/i;

/**
 * The native tvf90 player pages are two levels deep: the public embed
 * (`canal.php` / `1.php`) frames an inner page (`5.php`) that carries the HLS
 * `.m3u8` URL in its markup. We follow that chain server-side and extract the
 * m3u8 so the client can play it with the native HLS player (the CDN sends
 * `access-control-allow-origin: *`). Returns "" when no stream is found.
 */
async function resolveHlsUrl(pageUrl: string): Promise<string> {
  const headers = { "User-Agent": BROWSER_UA, Referer: REFERER };
  const get = async (url: string) => {
    const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return "";
    const html = await res.text();
    return html;
  };

  try {
    const html = await get(pageUrl);
    if (!html) return "";
    const direct = html.match(M3U8_RE)?.[0];
    if (direct) return direct;

    const iframe = html.match(IFRAME_RE)?.[1];
    if (!iframe) return "";
    const inner = new URL(iframe, pageUrl).toString();
    const innerHtml = await get(inner);
    if (!innerHtml) return "";
    return innerHtml.match(M3U8_RE)?.[0] ?? "";
  } catch {
    return "";
  }
}

async function fetchFutbolVideosMatches(): Promise<FutbolVideosMatch[]> {
  const url = apiUrl();
  const key = aesKeyHex();
  if (!url || !key) return [];

  const cached = await getCache<FutbolVideosMatch[]>(MATCHES_CACHE_KEY);
  if (cached) return cached;

  const lockKey = `${MATCHES_CACHE_KEY}:lock`;
  const lockAcquired = await acquireLock(lockKey, 10000);
  if (!lockAcquired) {
    const stale = await getCache<FutbolVideosMatch[]>(MATCHES_CACHE_KEY);
    return stale ?? [];
  }

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "text/plain, application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[futbolvideos] HTTP error: ${res.status}`);
      await releaseLock(lockKey);
      const stale = await getCache<FutbolVideosMatch[]>(MATCHES_CACHE_KEY);
      return stale ?? [];
    }

    const raw = await res.text();
    const matches = parseFutbolVideosMatches(decryptFutbolVideosBody(raw, key));

    await setCache(MATCHES_CACHE_KEY, matches, MATCHES_CACHE_TTL);
    await releaseLock(lockKey);
    return matches;
  } catch (error) {
    console.warn("[futbolvideos] Failed to fetch matches:", error);
    await releaseLock(lockKey);
    const stale = await getCache<FutbolVideosMatch[]>(MATCHES_CACHE_KEY);
    return stale ?? [];
  }
}

/**
 * Channels for a match from the FutbolVideos latin feed.
 *
 * The feed lists two kinds of entries per stream: a "generated" wrapper on
 * kora-plus.li (which sends X-Frame-Options and refuses to be embedded) and the
 * native tvf90.com player page it wraps (frameable, and two levels deep it
 * carries a direct HLS `.m3u8`). We resolve each underlying stream to its m3u8
 * server-side and dedupe by source page so the generated+native pair for one
 * signal collapses to a single channel.
 *
 * Every distinct tvf90 page (1.php, 2.php, 3.php, hd.php, …) is its own
 * signal — the site lists them as separate buttons even when they resolve to
 * the same playlist path — so each yields an HLS channel (native player,
 * preferred) plus the frameable tvf90 page as an extra "Web" iframe channel.
 * Signals with no resolvable m3u8 only yield the iframe channel.
 */
export async function findFutbolVideosStreams(
  homeTeam: string,
  awayTeam: string
): Promise<Channel[]> {
  const matches = await fetchFutbolVideosMatches();
  if (matches.length === 0) return [];

  const match = matches.find(
    (m) =>
      m.home?.name &&
      m.away?.name &&
      matchTeamsPair(m.home.name, m.away.name, homeTeam, awayTeam)
  );
  if (!match || !match.streams || match.streams.length === 0) return [];

  const cacheKey = `futbolvideos:resolved:${match.id}`;
  const cached = resolvedCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.channels;

  // Source URL per underlying stream: the frameable tvf90 page. For generated
  // entries that is real_url; for native entries it is embed_url. Dedup so the
  // same stream isn't resolved twice.
  const bySource = new Map<string, FutbolVideosStream>();
  for (const stream of match.streams) {
    const source = stream.origin === "native" ? stream.embed_url : stream.real_url || stream.embed_url;
    if (!source || bySource.has(source)) continue;
    bySource.set(source, stream);
  }

  const resolved = await Promise.all(
    Array.from(bySource.entries()).map(async ([source, stream]) => {
      const label = [
        stream.name || "Fútbol",
        stream.language,
        stream.hd && !/\bhd\b/i.test(stream.name ?? "") ? "HD" : null,
      ]
        .filter(Boolean)
        .join(" · ");

      const hls = await resolveHlsUrl(source);
      return { source, label, hls };
    })
  );

  // One channel group per distinct tvf90 source page (1.php, 2.php, 3.php,
  // hd.php). The feed lists a "generated" wrapper and a "native" entry for the
  // same page, which the bySource dedup above already merged — so one resolved
  // entry is one signal. Distinct pages stay separate even when they resolve
  // to the same playlist path: each is its own button on the site, and the
  // different pages often point at different edge servers.
  //
  // Each signal plays best as HLS (native player, relayed through /api/hls —
  // the CDN blocks the browser directly) with the frameable tvf90 page as an
  // extra "Web" channel; signals without a resolvable m3u8 only offer iframe.
  const channels: Channel[] = [];
  for (const { source, label, hls } of resolved) {
    if (hls) {
      channels.push({
        id: `futbolvideos-${channels.length + 1}`,
        name: label,
        url: toHlsProxyUrl(hls),
        kind: "hls",
      });
      channels.push({
        id: `futbolvideos-${channels.length + 1}`,
        name: `${label} · Web`,
        url: source,
        kind: "iframe",
      });
    } else {
      channels.push({
        id: `futbolvideos-${channels.length + 1}`,
        name: label,
        url: source,
        kind: "iframe",
      });
    }
  }

  resolvedCache.set(cacheKey, { channels, expiresAt: Date.now() + RESOLVED_TTL });
  return channels;
}
