import { findBasketballStreams, listBasketballMatches } from "@/lib/player-six-source";
import { matchSignalAlive } from "@/lib/signal-alive";
import { getTeamLogo, peekTeamLogo } from "@/lib/team-logos";
import { proxyImageUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A basketball game runs ~2h15m; the provider keeps the card up for a while
// after the final whistle, so the live badge gets a little slack.
const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

const badgeKey = (name: string, country: string) => `${country}${name}`;

/**
 * Matches of the NBA/basketball section. Same agenda the provider publishes
 * on its basketball page: every league it carries, grouped client-side.
 *
 * Crests come straight from the provider feed (its own logo CDN, host
 * rewritten to the live domain). The shared team catalog is the fallback
 * for the few fixtures where the provider has no crest.
 */
export async function GET(): Promise<Response> {
  const matches = await listBasketballMatches();
  const now = Date.now();

  // Resolve every crest up front; uncatalogued teams fall back to the
  // provider name search, capped so the list never stalls.
  const teams = new Map<string, { name: string; country: string }>();
  for (const match of matches) {
    for (const team of [match.home, match.away]) {
      teams.set(badgeKey(team, match.country), { name: team, country: match.country });
    }
  }

  const logos = new Map<string, string>();
  const pending: Promise<void>[] = [];
  for (const [key, { name, country }] of teams) {
    const peeked = peekTeamLogo(name, country);
    if (peeked !== null) {
      logos.set(key, peeked);
    } else {
      logos.set(key, "");
      pending.push(
        getTeamLogo(name, country)
          .then((logo) => {
            logos.set(key, logo);
          })
          .catch(() => {})
      );
    }
  }
  if (pending.length > 0) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled(pending),
        new Promise((resolve) => {
          timeout = setTimeout(resolve, 3000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  // Kickoff time alone cannot tell a live game from a dead feed: the
  // provider keeps cards up after the final whistle. Live-window matches
  // get their playlists probed; dead signals drop to "finished".
  const statuses = new Map<number, "live" | "upcoming" | "finished">();
  await Promise.all(
    matches.map(async (match) => {
      const status =
        match.kickoffMs > now
          ? "upcoming"
          : now - match.kickoffMs <= LIVE_WINDOW_MS
            ? "live"
            : "finished";
      if (status === "live" && !(await matchSignalAlive(`nba:alive:${match.matchId}`, () => findBasketballStreams(match.matchId)))) {
        statuses.set(match.matchId, "finished");
        return;
      }
      statuses.set(match.matchId, status);
    })
  );

  const payload = matches.map((match) => ({
    id: match.matchId,
    competition: match.league,
    leagueLogo: proxyImageUrl(match.leagueLogo || ""),
    home: match.home,
    away: match.away,
    homeLogo: proxyImageUrl(match.homeLogo || logos.get(badgeKey(match.home, match.country)) || ""),
    awayLogo: proxyImageUrl(match.awayLogo || logos.get(badgeKey(match.away, match.country)) || ""),
    start: match.kickoffMs ? new Date(match.kickoffMs).toISOString() : "",
    status: statuses.get(match.matchId) ?? "finished",
  }));

  return Response.json(
    { matches: payload },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
