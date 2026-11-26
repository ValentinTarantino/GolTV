/**
 * Helpers for the HLS relay route (`/api/hls`).
 *
 * HLS relay helpers for approved providers whose playlists need server-side
 * fetching or CORS support. The relay returns the media bytes to the app and
 * rewrites playlist and URI references so segments also pass through it.
 */

import { sealLpfSegmentUrl, sealLpfUrl } from "./sealed-url";
import {
  deferSegmentUrl,
  r2SegmentUrl,
  r2SegmentsEnabled,
  triggerSegmentPopulate,
  workerSegFallbackUrl,
  type DeferredSegmentUrl,
} from "./r2-segments";

/**
 * Optional external segment relay (e.g. a Cloudflare Tunnel to a home/office
 * machine). When set, media segments are served from there instead of
 * `/api/hls/seg`, moving ~95% of the site's bandwidth off the app server.
 * Playlists always stay on the app server — they are tiny and must stay fresh.
 */
const SEG_RELAY_BASE = (process.env.HLS_SEG_RELAY_BASE ?? "").replace(/\/+$/, "");

/**
 * Upstream hosts the relay may fetch, from `HLS_STREAM_HOSTS` (comma-separated).
 * An entry ending in `*` matches by prefix (rotating CDN labels); any other
 * entry matches the host itself or its subdomains. No hosts are baked in.
 */
let allowedCache: { raw: string; suffixes: string[]; prefixes: string[] } | null = null;

function allowedHosts(): { suffixes: string[]; prefixes: string[] } {
  const raw = process.env.HLS_STREAM_HOSTS ?? "";
  if (allowedCache && allowedCache.raw === raw) return allowedCache;
  const suffixes: string[] = [];
  const prefixes: string[] = [];
  for (const entry of raw.split(",")) {
    const host = entry.trim().toLowerCase();
    if (!host) continue;
    if (host.endsWith("*")) prefixes.push(host.slice(0, -1));
    else suffixes.push(host.replace(/^\.+/, ""));
  }
  allowedCache = { raw, suffixes, prefixes };
  return allowedCache;
}

const URI_ATTR_RE = /URI="([^"]+)"/g;

/** True when the URL points at a host we are willing to relay. */
export function isAllowedStreamUrl(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  const { suffixes, prefixes } = allowedHosts();
  return (
    suffixes.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    ) || prefixes.some((prefix) => host.startsWith(prefix))
  );
}

/**
 * Builds the client-facing relay URL for an absolute upstream stream URL.
 * The upstream is sealed into an opaque token so provider hosts never reach
 * the browser — not even inside playlist segment URIs.
 */
export function toHlsProxyUrl(absoluteUrl: string): string {
  try {
    return `/api/hls?t=${sealLpfUrl(absoluteUrl)}`;
  } catch {
    // Without LPF_PROXY_SECRET we cannot seal; fall back to the plaintext
    // form so playback keeps working in misconfigured environments.
    return `/api/hls?u=${encodeURIComponent(absoluteUrl)}`;
  }
}

/**
 * Builds the client-facing relay URL for a frame-restricted player page. The
 * relay asks the page for a fresh signed playlist on every request, so short
 * lived tokens never reach the browser.
 */
export function toEmbedRelayUrl(pageUrl: string): string {
  try {
    return `/api/hls?t=${sealLpfUrl(pageUrl)}`;
  } catch {
    return `/api/hls?e=${encodeURIComponent(pageUrl)}`;
  }
}

/**
 * Playlists for these embeds live behind a host that sends no CORS headers,
 * while their segments are served with `access-control-allow-origin: *`. Point
 * playlist entries at their absolute origin so segment traffic never has to
 * travel through the app server.
 */
export function rewritePlaylistToAbsolute(body: string, upstream: URL): string {
  const absolutize = (value: string): string => {
    if (/^(data|blob):/i.test(value)) return value;
    try {
      return new URL(value, upstream).toString();
    } catch {
      return value;
    }
  };
  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "") return line;
      if (trimmed.startsWith("#")) {
        return line.replace(URI_ATTR_RE, (_match, uri: string) => `URI="${absolutize(uri)}"`);
      }
      return absolutize(trimmed);
    })
    .join("\n");
}

function toRelay(
  value: string,
  upstream: URL,
  defer?: DeferredSegmentUrl[]
): string {
  if (/^(data|blob):/i.test(value)) return value;
  try {
    const absolute = new URL(value, upstream).toString();
    // Nested playlists (variant/audio .m3u8) stay on the no-store relay;
    // media segments, keys and init maps go through the CDN-cacheable
    // segment relay whose token is deterministic per time bucket.
    const isPlaylist = /\.m3u8(?:[?#]|$)/i.test(absolute);
    if (isPlaylist) {
      try {
        return `/api/hls?t=${sealLpfUrl(absolute)}`;
      } catch {
        return `/api/hls?u=${encodeURIComponent(absolute)}`;
      }
    }
    try {
      const token = sealLpfSegmentUrl(absolute);
      if (r2SegmentsEnabled()) {
        // Deferred fallback is the worker segment relay: it is the only path
        // that serves upstream bytes with Cloudflare edge bandwidth (no
        // Render egress), at the cost of one Worker request per segment.
        const fallback = SEG_RELAY_BASE
          ? `${SEG_RELAY_BASE}/seg?t=${token}`
          : workerSegFallbackUrl(token);
        if (defer) return deferSegmentUrl("lpf", token, fallback, defer);
        triggerSegmentPopulate("lpf", token);
        return r2SegmentUrl("lpf", token);
      }
      return SEG_RELAY_BASE
        ? `${SEG_RELAY_BASE}/seg?t=${token}`
        : `/api/hls/seg?t=${token}`;
    } catch {
      return SEG_RELAY_BASE
        ? `${SEG_RELAY_BASE}/seg?u=${encodeURIComponent(absolute)}`
        : `/api/hls/seg?u=${encodeURIComponent(absolute)}`;
    }
  } catch {
    return value;
  }
}

/**
 * Rewrites a HLS playlist so segments (and key/map URIs) load through the
 * relay. Relative lines are resolved against the upstream playlist URL first,
 * mirroring how browsers resolve them.
 */
export function rewriteHlsPlaylist(
  body: string,
  upstream: URL,
  defer?: DeferredSegmentUrl[]
): string {
  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "") return line;
      if (trimmed.startsWith("#")) {
        // EXT-X-KEY / EXT-X-MAP / EXT-X-I-FRAME-STREAM-INF carry URI="…" attrs.
        return line.replace(URI_ATTR_RE, (_match, uri: string) => `URI="${toRelay(uri, upstream, defer)}"`);
      }
      return toRelay(trimmed, upstream, defer);
    })
    .join("\n");
}
