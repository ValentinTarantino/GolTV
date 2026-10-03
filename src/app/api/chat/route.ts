import { z } from "zod";
import { CHAT_STORAGE_UNAVAILABLE, getChatMessages, addChatMessage } from "@/lib/chat";
import { isMongoConfigured } from "@/lib/mongo";
import { validateQuery, validateBody, createErrorResponse, chatPostSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

const chatGetSchema = z.object({
  matchId: z.string().regex(/^\d+$/, "Invalid match ID"),
  offset: z.string().regex(/^\d+$/).optional(),
});

export async function GET(request: Request) {
  const validation = await validateQuery(request, chatGetSchema);
  if ("error" in validation) return validation.error;

  const { matchId, offset } = validation.data;
  const offsetNum = offset ? parseInt(offset, 10) : 0;
  try {
    const messages = await getChatMessages(matchId, isNaN(offsetNum) ? 0 : offsetNum);
    return Response.json({ messages, persistent: isMongoConfigured() });
  } catch {
    return createErrorResponse(CHAT_STORAGE_UNAVAILABLE, 503);
  }
}

export async function POST(request: Request) {
  const validation = await validateBody(request, chatPostSchema);
  if ("error" in validation) return validation.error;

  const { matchId, nick, text } = validation.data;
  const result = await addChatMessage(matchId, nick, text);

  if (!result.ok) {
    const status = result.error === CHAT_STORAGE_UNAVAILABLE ? 503 : 400;
    return createErrorResponse(result.error!, status);
  }

  return Response.json({ ok: true, persistent: result.persistent });
}
