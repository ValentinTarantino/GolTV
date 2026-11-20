import { EMBED_USER_AGENT, isPlayerHost } from "./embed-resolver";

/**
 * Same-origin framing for the kora player family used by the boxing/MMA
 * embeds. The provider's `frame-ancestors` allowlist only names its own
 * wrapper domains, so the player page cannot be framed directly — but it can
 * be served through `/api/combat/frame/<host>/...` with the framing headers
 * stripped and its root-relative endpoints rewritten under the prefix.
 */

export const COMBAT_FRAME_PREFIX = "/api/combat/frame";
const UPSTREAM_TIMEOUT_MS = 8_000;
/** The kora gate only answers requests that look like they come from its wrapper. */
const FRAME_REFERER = "https://golygoals.com/";

export function combatFramePrefix(host: string): string | null {
  return isPlayerHost(host) ? `${COMBAT_FRAME_PREFIX}/${host}` : null;
}

/** Proxy URL for a resolved kora player page (`framestream.php?id=…`). */
export function combatFrameUrl(page: URL): string | null {
  const prefix = combatFramePrefix(page.hostname);
  if (!prefix) return null;
  return `${prefix}${page.pathname}${page.search}`;
}

/** Absolute upstream URLs of the player family → their proxy prefix. */
function rewriteAbsoluteHosts(text: string): string {
  return text.replace(
    /https?:\/\/([a-z0-9-]+)\.kora-plus\.(mov|li|app)/gi,
    (_match, edge: string, tld: string) =>
      `${COMBAT_FRAME_PREFIX}/${edge}.kora-plus.${tld.toLowerCase()}`
  );
}

/**
 * HTML/JS served through the proxy: upstream-absolute URLs move under the
 * prefix, the root-relative player endpoint is re-anchored, and
 * `location.origin + <path>` keeps producing same-origin proxy URLs.
 */
export function rewriteFrameText(text: string, host: string): string {
  const prefix = combatFramePrefix(host);
  if (!prefix) return text;
  let out = rewriteAbsoluteHosts(text);
  out = out.split(`//${host}`).join(prefix);
  out = out.replace(/([`"'])\/framestream\.php/g, `$1${prefix}/framestream.php`);
  out = out.replace(/location\.origin(\s*\+\s*)/g, `location.origin+"${prefix}"+`);
  return out;
}

function rewritePlaylistUri(uri: string, host: string): string {
  const trimmed = uri.trim();
  if (!trimmed || trimmed.startsWith("#")) return uri;
  if (trimmed.startsWith("/")) {
    const prefix = combatFramePrefix(host);
    return prefix ? `${prefix}${trimmed}` : uri;
  }
  try {
    const url = new URL(trimmed);
    if (isPlayerHost(url.hostname)) {
      return `${COMBAT_FRAME_PREFIX}/${url.hostname}${url.pathname}${url.search}`;
    }
  } catch {
    // relative segment names stay untouched
  }
  return uri;
}

/** m3u8 bodies: media/key/map URIs that point back at the player host are proxied. */
export function rewriteFramePlaylist(text: string, host: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (line.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${rewritePlaylistUri(uri, host)}"`);
      }
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      return rewritePlaylistUri(trimmed, host);
    })
    .join("\n");
}

export function isFrameMediaPath(pathname: string): boolean {
  return /\.(m3u8|m3u|ts|m4s|mp4|key|txt)$/i.test(pathname) || pathname.includes("/playlist/");
}

/** Fetch an upstream player asset for the frame proxy. */
export async function fetchFrameAsset(
  host: string,
  pathWithSearch: string
): Promise<Response | null> {
  const url = `https://${host}${pathWithSearch}`;
  const isPlayerPage = /\/framestream\.php$/i.test(new URL(url).pathname);
  try {
    return await fetch(url, {
      headers: {
        "User-Agent": EMBED_USER_AGENT,
        Accept: "*/*",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        Referer: FRAME_REFERER,
        ...(isPlayerPage
          ? {
              "Sec-Fetch-Dest": "iframe",
              "Sec-Fetch-Mode": "navigate",
              "Sec-Fetch-Site": "cross-site",
            }
          : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

