import { z } from "zod";
import { getChatMessages, addChatMessage, isIPBanned, getDeletedChatMessageIds } from "@/lib/chat";
import { isMongoConfigured } from "@/lib/mongo";
import { validateQuery, validateBody, createErrorResponse, chatPostSchema } from "@/lib/validators";
import { isValidAdminSession } from "@/lib/admin-session";
import { touchRequestPresence } from "@/lib/presence";
import { BANNED_HEADER } from "@/lib/viewer-id";

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
  matchId: z.string().regex(/^\d+$/, "Invalid match ID"),
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

  const validation = await validateQuery(request, chatGetSchema);
  if ("error" in validation) return validation.error;

  const { matchId, offset } = validation.data;
  touchRequestPresence(request, matchId);
  const offsetNum = offset ? parseInt(offset, 10) : 0;
  try {
    const safeOffset = isNaN(offsetNum) ? 0 : offsetNum;
    const messages = await getChatMessages(matchId, safeOffset);
    // Only a client that already holds history needs the tombstones.
    const deleted = safeOffset > 0 ? await getDeletedChatMessageIds(matchId) : [];
    return Response.json(
      { messages, persistent: isMongoConfigured(), deleted },
      { headers: { "Cache-Control": "no-store" } }
    );
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

  return Response.json({ ok: true, persistent: result.persistent });
}
