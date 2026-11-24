import { NextResponse } from "next/server";
import { findCombatMatch } from "@/lib/combat-source";
import { resolveCombatSources } from "@/lib/combat-sources";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const matchId = Number.parseInt(id, 10);
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const match = await findCombatMatch(matchId);
    if (!match) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    // Only real signals are returned: an event without a provisioned
    // broadcast yields an empty list and the page shows its pending state.
    const finalSources = (await resolveCombatSources(match)).slice(0, 4);

    return NextResponse.json({
      src: finalSources[0]?.src ?? null,
      kind: finalSources[0]?.kind ?? null,
      sources: finalSources,
      live: match.live,
    });
  } catch (error) {
    console.error("[api/combat/[id]]", error);
    return NextResponse.json({ error: "upstream failed" }, { status: 502 });
  }
}
