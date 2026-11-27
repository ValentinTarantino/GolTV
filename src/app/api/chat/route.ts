import { z } from "zod";
import { getChatMessages, addChatMessage, isIPBanned, getDeletedChatMessageIds } from "@/lib/chat";
import { isMongoConfigured } from "@/lib/mongo";
import { validateQuery, validateBody, createErrorResponse, chatPostSchema, chatMatchIdSchema } from "@/lib/validators";
import { isValidAdminSession } from "@/lib/admin-session";
import { touchRequestPresence, viewerIdFromRequest } from "@/lib/presence";
import { touchViewer, SITE_PRESENCE_ID } from "@/lib/viewers";
import { extractViewerMeta } from "@/lib/viewer-meta";
import { BANNED_HEADER } from "@/lib/viewer-id";
import { isViewerKicked } from "@/lib/kicked-viewers";
import { deleteSharedPlaylist, getSharedPlaylist, setSharedPlaylist } from "@/lib/playlist-cache";

function getClientIP(request: Request): string {
  // Try common headers for client IP
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;
  const cfIP = request.headers.get("cf-connecting-ip");
  if (cfIP) return cfIP;
  return "unknown";
}

export const dynamic = "force-dynamic";

const chatGetSchema = z.object({
  matchId: chatMatchIdSchema,
  offset: z.string().regex(/^\d+$/).optional(),
});

export async function GET(request: Request) {
  const clientIP = getClientIP(request);
  if (await isIPBanned(clientIP)) {
    return Response.json(
      { error: "Access denied" },
      { status: 403, headers: { [BANNED_HEADER]: "1" } }
    );
  }

  // Kicked viewers get a flag instead of messages — the client answers by
  // navigating the tab to about:blank (same effect as DevToolsGuard).
  // Checked before the shared playlist cache so the flag is never stale.
  const getViewerId = viewerIdFromRequest(request);
  if (await isViewerKicked(getViewerId)) {
    return Response.json({ kicked: true, messages: [], persistent: isMongoConfigured(), deleted: [] });
  }

  const validation = await validateQuery(request, chatGetSchema);
  if ("error" in validation) return validation.error;

  const { matchId, offset } = validation.data;
  touchRequestPresence(request, matchId);
  const offsetNum = offset ? parseInt(offset, 10) : 0;
  try {
    const safeOffset = isNaN(offsetNum) ? 0 : offsetNum;
    // Every viewer of the same match polls the same latest messages every
    // 3s — share one Mongo read per 2s window across all of them. History
    // fetches (offset > 0) stay uncached: they are rare and per-user.
    const cacheKey = `chat:${matchId}:${safeOffset}`;
    if (safeOffset === 0) {
      const cached = getSharedPlaylist(cacheKey);
      if (cached !== null) {
        return Response.json(JSON.parse(cached), {
          headers: { "Cache-Control": "no-store" },
        });
      }
    }
    const messages = await getChatMessages(matchId, safeOffset);
    // Only a client that already holds history needs the tombstones.
    const deleted = safeOffset > 0 ? await getDeletedChatMessageIds(matchId) : [];
    const payload = { messages, persistent: isMongoConfigured(), deleted };
    if (safeOffset === 0) setSharedPlaylist(cacheKey, JSON.stringify(payload));
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return createErrorResponse("Chat unavailable", 503);
  }
}

export async function POST(request: Request) {
  const clientIP = getClientIP(request);
  if (await isIPBanned(clientIP)) {
    return Response.json(
      { error: "Access denied" },
      { status: 403, headers: { [BANNED_HEADER]: "1" } }
    );
  }

  const postViewerId = viewerIdFromRequest(request);
  if (await isViewerKicked(postViewerId)) {
    return Response.json({ kicked: true });
  }

  const validation = await validateBody(request, chatPostSchema);
  if ("error" in validation) return validation.error;

  const { matchId, nick, text, nickColor, textColor, replyTo } = validation.data;

  // Check if the requester is admin via the signed session cookie. The old
  // literal `authenticated` check let anybody forge the admin badge.
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionValue = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("goltv_admin_session="))
    ?.split("=")
    .slice(1)
    .join("=");
  const isAdmin = isValidAdminSession(sessionValue);

  const result = await addChatMessage(matchId, nick, text, { nickColor, textColor, replyTo, isAdmin, ip: clientIP });

  if (!result.ok) {
    const status = result.error === "Rate limited" ? 429 : 400;
    return createErrorResponse(result.error!, status);
  }

  // Speaking reveals who the viewer is: attach the nick to their presence
  // doc so the admin panel can list names instead of bare viewer ids.
  const viewerId = viewerIdFromRequest(request);
  if (viewerId) {
    const meta = extractViewerMeta(request);
    void touchViewer(matchId, viewerId, nick, meta);
    void touchViewer(SITE_PRESENCE_ID, viewerId, nick, meta);
  }

  // Drop the cached latest-messages payload so the new post shows up on the
  // next poll instead of waiting out the TTL.
  deleteSharedPlaylist(`chat:${matchId}:0`);

  return Response.json({ ok: true, persistent: result.persistent });
}
