import { getChatMessages, addChatMessage } from "@/lib/chat";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const matchId = url.searchParams.get("matchId");
  const offset = url.searchParams.get("offset");

  if (!matchId) {
    return Response.json({ error: "matchId required" }, { status: 400 });
  }

  const offsetNum = offset ? parseInt(offset, 10) : 0;
  const messages = getChatMessages(matchId, isNaN(offsetNum) ? 0 : offsetNum);
  return Response.json({ messages });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { matchId, nick, text } = body ?? {};

    if (!matchId || !nick || !text) {
      return Response.json(
        { error: "matchId, nick, and text are required" },
        { status: 400 }
      );
    }

    const result = addChatMessage(
      String(matchId),
      String(nick),
      String(text)
    );

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
}
