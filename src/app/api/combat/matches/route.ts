import { NextResponse } from "next/server";
import { listCombatMatches, type CombatMatch } from "@/lib/combat-source";
import { findFightingStreams } from "@/lib/player-six-source";
import { matchSignalAlive } from "@/lib/signal-alive";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Fight nights/shows run ~3-4h. Past that the card is a result, not a
// broadcast — and inside the window the clock alone cannot tell a live
// feed from a dead one, so live candidates get their playlists probed
// (90s cache per event via matchSignalAlive).
const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000;

export async function GET() {
  try {
    const matches = await listCombatMatches();
    const now = Date.now();
    const enriched = await Promise.all(
      matches.map(async (m): Promise<CombatMatch> => {
        if (m.timestamp > now) return { ...m, live: false, finished: false };
        if (now - m.timestamp > LIVE_WINDOW_MS) return { ...m, live: false, finished: true };
        const alive = await matchSignalAlive(`combat:alive:${m.id}`, () =>
          findFightingStreams(m.id)
        );
        return { ...m, live: alive, finished: !alive };
      })
    );
    return NextResponse.json({ matches: enriched });
  } catch (error) {
    console.error("[api/combat/matches]", error);
    return NextResponse.json({ matches: [] }, { status: 502 });
  }
}
