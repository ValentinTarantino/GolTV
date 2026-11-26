import { NextResponse } from "next/server";
import { listMotorsportEvents } from "@/lib/motor-source";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const matches = await listMotorsportEvents();
    return NextResponse.json({ matches });
  } catch (error) {
    console.error("[api/motor/matches]", error);
    return NextResponse.json({ matches: [] }, { status: 502 });
  }
}
