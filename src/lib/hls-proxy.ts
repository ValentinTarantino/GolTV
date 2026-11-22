/**
 * Helpers for the HLS relay route (`/api/hls`).
 *
 * HLS relay helpers for approved providers whose playlists need server-side
 * fetching or CORS support. The relay returns the media bytes to the app and
 * rewrites playlist and URI references so segments also pass through it.
 */

import { sealLpfUrl } from "./sealed-url";

/** Only these hosts (and their subdomains) may be relayed — not an open proxy. */
const ALLOWED_HOST_SUFFIXES = [".ftlly.com", ".futlivehd.com", ".ebaclofen.org"];

/**
 * RBTV+ stream CDNs rotate across throwaway domains but always keep the
 * `fhlsport` label (fhlsportNNN.<random>.{xyz,ru,cfd,...}).
 */
const ALLOWED_HOST_PREFIXES = ["fhlsport"];

const URI_ATTR_RE = /URI="([^"]+)"/g;

/** True when the URL points at a host we are willing to relay. */
export function isAllowedStreamUrl(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (
    ALLOWED_HOST_SUFFIXES.some(
      (suffix) => host === suffix.slice(1) || host.endsWith(suffix)
    ) || ALLOWED_HOST_PREFIXES.some((prefix) => host.startsWith(prefix))
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

function toRelay(value: string, upstream: URL): string {
  if (/^(data|blob):/i.test(value)) return value;
  try {
    return toHlsProxyUrl(new URL(value, upstream).toString());
  } catch {
    return value;
  }
}

/**
 * Rewrites a HLS playlist so segments (and key/map URIs) load through the
 * relay. Relative lines are resolved against the upstream playlist URL first,
 * mirroring how browsers resolve them.
 */
export function rewriteHlsPlaylist(body: string, upstream: URL): string {
  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "") return line;
      if (trimmed.startsWith("#")) {
        // EXT-X-KEY / EXT-X-MAP / EXT-X-I-FRAME-STREAM-INF carry URI="…" attrs.
        return line.replace(URI_ATTR_RE, (_match, uri: string) => `URI="${toRelay(uri, upstream)}"`);
      }
      return toRelay(trimmed, upstream);
    })
    .join("\n");
}
