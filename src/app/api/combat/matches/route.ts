import { NextResponse } from "next/server";
import { listCombatMatches } from "@/lib/combat-source";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const matches = await listCombatMatches();
    return NextResponse.json({ matches });
  } catch (error) {
    console.error("[api/combat/matches]", error);
    return NextResponse.json({ matches: [] }, { status: 502 });
  }
}
