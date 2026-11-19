import { NextRequest, NextResponse } from "next/server";
import { deleteChatMessage } from "@/lib/chat";
import { isAdminRequest } from "@/lib/admin-session";

/**
 * Deletes one chat message for everybody. The deletion also stores a
 * tombstone so open chats (which poll with an offset and only append) drop
 * the message on their next read instead of waiting for a page reload.
 */
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { messageId?: unknown; matchId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { messageId, matchId } = payload;
  if (typeof messageId !== "string" || typeof matchId !== "string" || !messageId || !matchId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  try {
    const deleted = await deleteChatMessage(matchId, messageId);
    if (!deleted) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
