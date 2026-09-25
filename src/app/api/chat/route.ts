import { z } from "zod";
import { getChatMessages, addChatMessage } from "@/lib/chat";
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
  const messages = await getChatMessages(matchId, isNaN(offsetNum) ? 0 : offsetNum);
  return Response.json({ messages });
}

export async function POST(request: Request) {
  const validation = await validateBody(request, chatPostSchema);
  if ("error" in validation) return validation.error;

  const { matchId, nick, text } = validation.data;
  const result = await addChatMessage(matchId, nick, text);

  if (!result.ok) {
    return createErrorResponse(result.error!, 400);
  }

  return Response.json({ ok: true });
}
