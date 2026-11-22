import { badgeNameFor, listLpfMatches } from "@/lib/lpf-matches";
import { getTeamLogo, peekTeamLogo } from "@/lib/team-logos";
import { proxyImageUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Matches of the "LPF Play" section.
 *
 * The response carries opaque ids, the teams, their crests and the kickoff.
 * No provider URL and no player reference leaves the server.
 */
export async function GET(): Promise<Response> {
  const matches = await listLpfMatches();

  // Crests of the teams, resolved with the same catalog the fixtures use.
  const logos = new Map<string, string>();
  const pending: Promise<void>[] = [];

  for (const match of matches) {
    for (const [side, raw] of [
      ["home", match.home],
      ["away", match.away],
    ] as const) {
      const name = badgeNameFor(raw);
      const key = `${side}:${name}`;
      const peeked = peekTeamLogo(name, "Argentina");
      if (peeked !== null) {
        logos.set(key, peeked);
      } else {
        logos.set(key, "");
        pending.push(
          getTeamLogo(name, "Argentina")
            .then((logo) => {
              logos.set(key, logo);
            })
            .catch(() => {})
        );
      }
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

  // Explicit field list: provider identity (`source`), provider coordinates
  // (`viewTid`/`viewMid`) and upstream URLs never leave the server.
  const payload = matches.map((match) => ({
    id: match.id,
    competition: match.competition,
    home: match.home,
    away: match.away,
    // The provider publishes the exact crest of every team; it comes through
    // our own route so the CDN host stays out of the browser.
    homeLogo: match.homePk
      ? `/api/lpf/crest?pk=${match.homePk}`
      : proxyImageUrl(logos.get(`home:${badgeNameFor(match.home)}`) ?? ""),
    awayLogo: match.awayPk
      ? `/api/lpf/crest?pk=${match.awayPk}`
      : proxyImageUrl(logos.get(`away:${badgeNameFor(match.away)}`) ?? ""),
    start: match.start,
    status: match.status,
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
