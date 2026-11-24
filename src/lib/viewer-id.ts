/**
 * Shared viewer-identity constants and helpers. Isomorphic: safe to import
 * from client components and server routes (no server-only dependencies).
 *
 * The viewer id lives in two places on purpose:
 *  - localStorage (`goltv-viewer-id`): stable per browser, readable by JS
 *  - cookie (`gt_vid`): travels automatically on every request, so server
 *    routes can register presence without any dedicated polling endpoint
 */
export const VIEWER_ID_COOKIE = "gt_vid";
export const VIEWER_ID_STORAGE_KEY = "goltv-viewer-id";

/** Response header set on ban denials so the client can react without polling. */
export const BANNED_HEADER = "x-goltv-banned";

const VIEWER_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidViewerId(id: string | null | undefined): id is string {
  return typeof id === "string" && VIEWER_ID_RE.test(id);
}

/**
 * Appends `?m=<matchId>` to same-origin API stream URLs so playlist relays
 * can attribute the viewer to a match. hls.js reloads the playlist URL
 * every few seconds — including with the tab hidden — which makes it a
 * free presence heartbeat. External/iframe URLs are left untouched.
 */
export function withMatchParam(url: string, matchId: string): string {
  if (!url.startsWith("/api/") || !/^\d+$/.test(matchId)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}m=${matchId}`;
}
