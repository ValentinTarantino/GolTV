import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { loadLeagueOrder, saveLeagueOrder } from "@/lib/league-order";

/**
 * Admin-only category order. It is stored server-side (Mongo when available),
 * so once saved it is what every visitor gets from /api/matches.
 */

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const order = await loadLeagueOrder(true);
  return NextResponse.json({ order }, {
    headers: { "Cache-Control": "no-store, private" },
  });
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { order?: unknown };
  try {
    payload = (await request.json()) as { order?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Only an array is acceptable; `[]` is a valid "back to natural order".
  if (!Array.isArray(payload.order)) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  try {
    const order = await saveLeagueOrder(payload.order);
    return NextResponse.json({ success: true, order });
  } catch {
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}
