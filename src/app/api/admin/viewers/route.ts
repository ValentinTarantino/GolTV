import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { listActiveViewers, SITE_PRESENCE_ID } from "@/lib/viewers";

export const dynamic = "force-dynamic";

/**
 * Live viewer list for the admin panel: every active viewer id, the chat
 * nick they used (if any) and which match — or the site itself — they are
 * on. Read-only; presence is registered by ambient traffic.
 */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const viewers = await listActiveViewers();
    return NextResponse.json({
      viewers,
      siteCount: viewers.filter((v) => v.matchId === SITE_PRESENCE_ID).length,
      generatedAt: Date.now(),
    });
  } catch {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
