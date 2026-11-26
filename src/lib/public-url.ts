import { openLpfUrl, sealLpfDailyUrl, sealLpfUrl } from "./sealed-url";
import {
  r2SegmentUrl,
  r2SegmentsEnabled,
  segmentPopulateState,
  triggerSegmentPopulate,
} from "./r2-segments";
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

/**
 * Badge CDNs allowed through `/api/img`, from `IMG_PROXY_HOSTS`
 * (comma-separated hostnames). Mirrors the worker's `IMG_PROXY_HOSTS`.
 */
let imageHostsCache: { raw: string; hosts: Set<string> } | null = null;

function proxiedImageHosts(): Set<string> {
  const raw = process.env.IMG_PROXY_HOSTS ?? "";
  if (imageHostsCache && imageHostsCache.raw === raw) return imageHostsCache.hosts;
  const hosts = new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
  imageHostsCache = { raw, hosts };
  return hosts;
}

export function isProxiedImageHost(url: string): boolean {
  try {
    return proxiedImageHosts().has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function proxyImageUrl(url: string): string {
  if (!url || !url.startsWith("http") || !isProxiedImageHost(url)) return url;
  try {
    const token = sealLpfDailyUrl(url);
    // Badges are tiny and heavily repeated: when R2 delivery is enabled they
    // are served from the CDN like video segments, so a new visitor anywhere
    // gets an edge HIT instead of waiting on this server or the upstream CDN.
    // The daily-bucket token keeps the object key stable for ~a day.
    if (r2SegmentsEnabled()) {
      // A populate that already failed means the object is not (and may never
      // be) in R2: serve the badge through the live relay instead of a 404.
      const failing = segmentPopulateState("img", token) === "failed";
      triggerSegmentPopulate("img", token);
      if (!failing) return r2SegmentUrl("img", token);
    }
    return `/api/img?t=${token}`;
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
 * Hosts come from `NEXT_PUBLIC_HTML_PROXY_HOSTS` (comma-separated).
 */
function htmlProxyHosts(): string[] {
  return (process.env.NEXT_PUBLIC_HTML_PROXY_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function sealFrameUrl(rawUrl: string): string | null {
  try {
    const token = sealLpfUrl(rawUrl);
    const host = new URL(rawUrl).hostname.toLowerCase();
    const proxied = htmlProxyHosts().some(
      (entry) => host === entry || host.endsWith(`.${entry}`)
    );
    return proxied
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
    // Player-five embeds are fragile third-party players: any hop through our
    // relay routes (302 or JS navigation) gets flagged by their anti-leech
    // checks and kills fullscreen. They load the provider URL directly, the
    // same way they did before URL sealing — the domain is visible in the
    // network tab either way once the frame loads.
    if (channel.provider === "player-five") return channel;
    return { ...channel, url: publicFrameUrl(channel.url) };
  });
}
