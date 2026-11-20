import { NextResponse } from "next/server";
import { findCombatMatch } from "@/lib/combat-source";
import { resolveCombatFrames, resolveCombatSources } from "@/lib/combat-sources";

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

    // The provider flags the event as live before it provisions the signal
    // (the kora `?_json=1` probe still answers `ready:false`), so the framed
    // player is always appended: it keeps polling and starts playing on its
    // own once the signal goes up. Raw wrapper embeds are never returned —
    // their inner frame is refused by CSP and only paints a black box.
    const [sources, frames] = await Promise.all([
      resolveCombatSources(match),
      resolveCombatFrames(match),
    ]);
    const finalSources = [...sources, ...frames].slice(0, 4);

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
