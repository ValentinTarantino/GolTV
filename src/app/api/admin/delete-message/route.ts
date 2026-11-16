import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/mongo";
import { getCache, setCache } from "@/lib/cache";
import type { ChatMessage } from "@/lib/chat";

const SESSION_COOKIE = "goltv_admin_session";
const CHAT_MESSAGES_KEY = "chat:messages";
const CHAT_COLLECTION = "chat_messages";

export async function POST(request: NextRequest) {
  try {
    // Verify admin session
    const cookieStore = await cookies();
    const session = cookieStore.get(SESSION_COOKIE);
    
    if (!session || session.value !== "authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messageId, matchId } = await request.json();
    
    if (!messageId || !matchId) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    // Try MongoDB first
    const db = await getDb();
    if (db) {
      try {
        const collection = db.collection(CHAT_COLLECTION);
        const result = await collection.deleteOne({ id: messageId, matchId });
        
        if (result.deletedCount > 0) {
          // Also remove from cache
          const messages = await getCache<ChatMessage[]>(`${CHAT_MESSAGES_KEY}:${matchId}`);
          if (messages) {
            const filtered = messages.filter(m => m.id !== messageId);
            await setCache(`${CHAT_MESSAGES_KEY}:${matchId}`, filtered, 24 * 60 * 60 * 1000);
          }
          return NextResponse.json({ success: true });
        }
      } catch (error) {
        console.warn("[admin/delete-message] MongoDB error:", error);
      }
    }

    // Fallback to cache only
    const messages = await getCache<ChatMessage[]>(`${CHAT_MESSAGES_KEY}:${matchId}`);
    
    if (!messages) {
      return NextResponse.json({ error: "No messages found" }, { status: 404 });
    }

    const filtered = messages.filter(m => m.id !== messageId);
    
    if (filtered.length === messages.length) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    await setCache(`${CHAT_MESSAGES_KEY}:${matchId}`, filtered, 24 * 60 * 60 * 1000);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
