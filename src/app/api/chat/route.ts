import { z } from "zod";
import { getChatMessages, addChatMessage, isIPBanned } from "@/lib/chat";
import { isMongoConfigured } from "@/lib/mongo";
import { validateQuery, validateBody, createErrorResponse, chatPostSchema } from "@/lib/validators";

const ADMIN_SESSION_COOKIE = "goltv_admin_session";

function getAdminFromRequest(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return false;
  const cookies = cookieHeader.split(";").map(c => c.trim());
  return cookies.some(c => c === `${ADMIN_SESSION_COOKIE}=authenticated`);
}

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
    return createErrorResponse("Access denied", 403);
  }

  const validation = await validateQuery(request, chatGetSchema);
  if ("error" in validation) return validation.error;

  const { matchId, offset } = validation.data;
  const offsetNum = offset ? parseInt(offset, 10) : 0;
  try {
    const messages = await getChatMessages(matchId, isNaN(offsetNum) ? 0 : offsetNum);
    return Response.json({ messages, persistent: isMongoConfigured() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return createErrorResponse("Chat unavailable", 503);
  }
}

export async function POST(request: Request) {
  const clientIP = getClientIP(request);
  if (await isIPBanned(clientIP)) {
    return createErrorResponse("Access denied", 403);
  }

  const validation = await validateBody(request, chatPostSchema);
  if ("error" in validation) return validation.error;

  const { matchId, nick, text, nickColor, textColor, replyTo } = validation.data;

  // Check if the requester is admin via session cookie
  const isAdmin = getAdminFromRequest(request);

  const result = await addChatMessage(matchId, nick, text, { nickColor, textColor, replyTo, isAdmin, ip: clientIP });

  if (!result.ok) {
    const status = result.error === "Rate limited" ? 429 : 400;
    return createErrorResponse(result.error!, status);
  }

  return Response.json({ ok: true, persistent: result.persistent });
}
