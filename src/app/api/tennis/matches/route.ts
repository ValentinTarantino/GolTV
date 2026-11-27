import { findTennisStreams, listTennisMatches } from "@/lib/player-six-source";
import { channelsSignalAlive, matchSignalAlive } from "@/lib/signal-alive";
import { getTeamLogo, peekTeamLogo } from "@/lib/team-logos";
import { proxyImageUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A tennis game runs ~2h15m; the provider keeps the card up for a while
// after the final whistle, so the live badge gets a little slack.
const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;
// Davis Cup/Fed Cup ties run well past that window (up to ~7h). Past the
// window we probe the provider's stream list instead of guessing: resolvable
// streams mean the broadcast is still up. 12h caps the probe cost — beyond
// that the card is certainly done.
const LIVE_PROBE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const badgeKey = (name: string, country: string) => `${country}${name}`;

/**
 * Matches of the tennis section. Same agenda the provider publishes
 * on its tennis page: every league it carries, grouped client-side.
 *
 * Crests come straight from the provider feed (its own logo CDN, host
 * rewritten to the live domain). The shared team catalog is the fallback
 * for the few fixtures where the provider has no crest.
 */
export async function GET(): Promise<Response> {
  const matches = await listTennisMatches();
  const now = Date.now();

  // Past the live window, probe the borderline cards (kickoff already behind
  // us but recent enough to plausibly still be on air — Davis Cup ties run
  // for hours). Matches with resolvable streams stay "live".
  const stillLive = new Set<number>();
  const borderline = matches.filter(
    (m) =>
      m.kickoffMs > 0 &&
      now - m.kickoffMs > LIVE_WINDOW_MS &&
      now - m.kickoffMs <= LIVE_PROBE_MAX_AGE_MS
  );
  if (borderline.length > 0) {
    let probeTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled(
          borderline.map(async (m) => {
            const channels = await findTennisStreams(m.matchId);
            if (channels.length > 0 && (await channelsSignalAlive(channels))) {
              stillLive.add(m.matchId);
            }
          })
        ),
        new Promise((resolve) => {
          probeTimeout = setTimeout(resolve, 8000);
        }),
      ]);
    } finally {
      clearTimeout(probeTimeout);
    }
  }

  // Inside the live window the clock alone decides "live" — but a feed can
  // die mid-match while the card stays up. Probe the playlists (90s cache
  // per match); dead signals drop to "finished" until they revive.
  const deadLive = new Set<number>();
  const inWindow = matches.filter(
    (m) => m.kickoffMs > 0 && m.kickoffMs <= now && now - m.kickoffMs <= LIVE_WINDOW_MS
  );
  if (inWindow.length > 0) {
    await Promise.all(
      inWindow.map(async (m) => {
        const alive = await matchSignalAlive(`tennis:alive:${m.matchId}`, () =>
          findTennisStreams(m.matchId)
        );
        if (!alive) deadLive.add(m.matchId);
      })
    );
  }

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

  const payload = matches.map((match) => ({
    id: match.matchId,
    competition: match.league,
    home: match.home,
    away: match.away,
    homeLogo: proxyImageUrl(match.homeLogo || logos.get(badgeKey(match.home, match.country)) || ""),
    awayLogo: proxyImageUrl(match.awayLogo || logos.get(badgeKey(match.away, match.country)) || ""),
    start: match.kickoffMs ? new Date(match.kickoffMs).toISOString() : "",
    status:
      match.kickoffMs > now
        ? "upcoming"
        : deadLive.has(match.matchId)
          ? "finished"
          : now - match.kickoffMs <= LIVE_WINDOW_MS || stillLive.has(match.matchId)
            ? "live"
            : "finished",
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
