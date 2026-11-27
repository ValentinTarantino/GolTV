import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { isValidViewerId } from "@/lib/viewer-id";
import { getKickedViewerIdList, kickViewer, unkickViewer } from "@/lib/kicked-viewers";
import { listActiveViewers, removeViewerEverywhere, SITE_PRESENCE_ID } from "@/lib/viewers";

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
      kickedViewerIds: await getKickedViewerIdList(),
      generatedAt: Date.now(),
    });
  } catch {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}

/**
 * Kick a viewer: their next chat poll returns `kicked` and the client
 * navigates to about:blank. Presence docs are purged so they vanish from
 * the panel immediately, and touchRequestPresence refuses to re-add them.
 */
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { viewerId, action } = await request.json();
    if (!isValidViewerId(viewerId)) {
      return NextResponse.json({ error: "Invalid viewer id" }, { status: 400 });
    }

    if (action === "unkick") {
      await unkickViewer(viewerId);
      return NextResponse.json({ ok: true, action: "unkick" });
    }

    await kickViewer(viewerId);
    await removeViewerEverywhere(viewerId);
    return NextResponse.json({ ok: true, action: "kick" });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
