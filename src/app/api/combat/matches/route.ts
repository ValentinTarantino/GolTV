import { NextResponse } from "next/server";
import { listCombatMatches, mergeRecentCombatMatches, type CombatMatch } from "@/lib/combat-source";
import { findPrimaryEventStreams } from "@/lib/primary-player-source";
import { matchSignalAlive } from "@/lib/signal-alive";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Fight nights/shows run ~3-4h, but the feed's own `live` flag stays on
// longer — a 4h clock alone marked still-airing cards as finished. The
// provider flag wins inside a generous 12h cap; past the 4h window without
// the flag the card is a result, not a broadcast.
const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000;
const FEED_LIVE_MAX_MS = 12 * 60 * 60 * 1000;

export async function GET() {
  try {
    const matches = await listCombatMatches();
    const now = Date.now();
    const enriched = await Promise.all(
      matches.map(async (m): Promise<CombatMatch> => {
        // The provider's own finished flag is authoritative — it knows when
        // the card ended even inside our live window.
        if (m.feedFinished) return { ...m, live: false, finished: true };
        if (now - m.timestamp > FEED_LIVE_MAX_MS) {
          return { ...m, live: false, finished: true };
        }
        const feedLive = m.feedLive;
        if (!feedLive && m.timestamp > now) {
          return { ...m, live: false, finished: false };
        }
        if (!feedLive && now - m.timestamp > LIVE_WINDOW_MS) {
          return { ...m, live: false, finished: true };
        }
        // The feed says live: keep the badge even while the provider's
        // signal is still spinning up — the player retries on its own.
        if (feedLive) return { ...m, live: true, finished: false };
        // Started recently without the feed flag: probe the signal so a
        // transmitting card still earns the live badge.
        const alive = await matchSignalAlive(`combat:alive:${m.id}`, () =>
          findPrimaryEventStreams(m.id, "gsc")
        );
        return { ...m, live: alive, finished: false };
      })
    );
    // Feed-dropped events stay listed as finished for the grace window —
    // celebrations keep streaming after the provider removes the card.
    return NextResponse.json({ matches: await mergeRecentCombatMatches(enriched) });
  } catch (error) {
    console.error("[api/combat/matches]", error);
    return NextResponse.json({ matches: [] }, { status: 502 });
  }
}
