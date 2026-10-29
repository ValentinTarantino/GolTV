/**
 * Helpers for the HLS relay route (`/api/hls`).
 *
 * The Player 4 CDN (ftlly.com) serves playlists and segments to our server on
 * every attempt but intermittently answers the browser itself with
 * `403 + x-deny-reason: wrong_domain` for the exact same URL and headers, so
 * the client never gets the stream. The route fetches upstream server-side and
 * relays the bytes with `Access-Control-Allow-Origin: *`; playlists are
 * rewritten so every playlist line and `URI="…"` attribute also resolves back
 * through the relay (segments included).
 */

/** Only these hosts (and their subdomains) may be relayed — not an open proxy. */
const ALLOWED_HOST_SUFFIXES = [".ftlly.com"];

const URI_ATTR_RE = /URI="([^"]+)"/g;

/** True when the URL points at a host we are willing to relay. */
export function isAllowedStreamUrl(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix.slice(1) || host.endsWith(suffix)
  );
}

/** Builds the client-facing relay URL for an absolute upstream stream URL. */
export function toHlsProxyUrl(absoluteUrl: string): string {
  return `/api/hls?u=${encodeURIComponent(absoluteUrl)}`;
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
