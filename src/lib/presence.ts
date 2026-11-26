import { touchViewer, SITE_PRESENCE_ID } from "./viewers";
import { isValidViewerId, VIEWER_ID_COOKIE } from "./viewer-id";
import { extractViewerMeta } from "./viewer-meta";

/**
 * Ambient presence: routes call `touchRequestPresence` on requests the
 * client already makes, so viewers are counted without any dedicated
 * polling endpoint. Fire-and-forget — never adds latency to the response.
 */

/** Reads the viewer id the client stores in the `gt_vid` cookie. */
export function viewerIdFromRequest(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === VIEWER_ID_COOKIE) {
      const value = part.slice(eq + 1).trim();
      return isValidViewerId(value) ? value : null;
    }
  }
  return null;
}

/**
 * Marks the caller as present site-wide, and under `matchId` too when the
 * request carries one (chat polls, `?m=` playlist reloads, match lookups).
 */
export function touchRequestPresence(request: Request, matchId?: string | null): void {
  const viewerId = viewerIdFromRequest(request);
  if (!viewerId) return;
  const meta = extractViewerMeta(request);
  void touchViewer(SITE_PRESENCE_ID, viewerId, undefined, meta).catch(() => {});
  if (matchId && /^\d+$/.test(matchId)) {
    void touchViewer(matchId, viewerId, undefined, meta).catch(() => {});
  }
}
