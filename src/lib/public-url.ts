import { openLpfUrl, sealLpfUrl } from "./sealed-url";
import type { Channel } from "./types";

/**
 * Rewrites provider URLs so upstream hostnames never reach the browser.
 *
 * Server-only module (imports the sealed-token crypto): the upstream URL is
 * encrypted into an opaque token, so not even the query string reveals the
 * provider host. Relative/local paths pass through untouched.
 *
 * If sealing is unavailable (missing relay secret) images are dropped and
 * frames fall back to the raw URL — playback keeps working in
 * misconfigured environments.
 */

/** Badge CDNs allowed through `/api/img`. Mirrors `images.remotePatterns`. */
const PROXIED_IMAGE_HOSTS = new Set([
  "r2.thesportsdb.com",
  "www.thesportsdb.com",
  "media.api-sports.io",
  "a.espncdn.com",
  "www.messicup.com",
  "cdn.freebiesupply.com",
  "upload.wikimedia.org",
  "api.promiedos.com.ar",
  "www.promiedos.com.ar",
  "flagcdn.com",
  "encrypted-tbn0.gstatic.com",
  "www.countryflags.com",
  "football-logos.cc",
  "assets.football-logos.cc",
  "i.pinimg.com",
  "www.footylogos.com",
  "images.football-live-stream.online",
]);

export function isProxiedImageHost(url: string): boolean {
  try {
    return PROXIED_IMAGE_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function proxyImageUrl(url: string): string {
  if (!url || !url.startsWith("http") || !isProxiedImageHost(url)) return url;
  try {
    return `/api/img?t=${sealLpfUrl(url)}`;
  } catch {
    return "";
  }
}

/** Opens an `/api/img?t=` token back into its upstream URL. */
export function openImageToken(token: string): string | null {
  let url: string | null = null;
  try {
    url = openLpfUrl(token);
  } catch {
    return null;
  }
  if (!url || !isProxiedImageHost(url)) return null;
  return url;
}

/**
 * Player pages that must be fetched and rewritten by `/api/proxy` (ad
 * stripping, iframe rewriting, framing headers) instead of framed raw.
 * Mirrors the exceptions in `IframePlayer.getProxyUrl`.
 */
const HTML_PROXY_HOSTS = /futbolvivo\.tv|kora-plus\.mov/i;

function sealFrameUrl(rawUrl: string): string | null {
  try {
    const token = sealLpfUrl(rawUrl);
    return HTML_PROXY_HOSTS.test(rawUrl)
      ? `/api/proxy?t=${token}`
      : `/api/frame?t=${token}`;
  } catch {
    return null;
  }
}

/**
 * Client-facing URL for an iframe channel. Absolute provider pages are
 * sealed behind `/api/frame` (302) or `/api/proxy` (HTML rewrite); relative
 * paths are already same-origin and pass through.
 */
export function publicFrameUrl(rawUrl: string): string {
  if (!/^https?:\/\//i.test(rawUrl)) return rawUrl;
  return sealFrameUrl(rawUrl) ?? rawUrl;
}

/**
 * Rewrites the `url` of every iframe channel so provider pages never appear
 * in API payloads. HLS channels already carry sealed relay URLs.
 */
export function publicChannels(channels: Channel[] | undefined): Channel[] | undefined {
  if (!channels?.length) return channels;
  return channels.map((channel) => {
    if (channel.kind !== "iframe") return channel;
    if (channel.provider === "secondary-feed" && /^https?:\/\//i.test(channel.url)) {
      try {
        return { ...channel, url: `/api/secondary?t=${sealLpfUrl(channel.url)}` };
      } catch {
        return channel;
      }
    }
    return { ...channel, url: publicFrameUrl(channel.url) };
  });
}
