import { createHash } from "node:crypto";
import {
  listSportplusMatches,
  resolveSportplusMatchStream,
} from "./lpf-matches";
import { lpfRelayUrl } from "./lpf-play";
import { matchTeamsPair } from "./team-matching";
import type { Channel } from "./types";

/** Candidates probed per request: the same fixture can be listed twice. */
const MAX_CANDIDATES = 3;

/**
 * The LPF board as a watch-page player.
 *
 * The provider's global `matches/index` lists every live football match of
 * every competition it carries, so a fixture of the main agenda is matched
 * by team names alone — no competition mapping needed. Each playlist
 * goes through the same sealed relay the /lpf page uses; provider hosts
 * never reach the browser.
 */
export async function findLpfStreams(homeTeam: string, awayTeam: string): Promise<Channel[]> {
  const live = await listSportplusMatches();
  // Live listings first: they are the ones that can actually serve `ls`.
  const candidates = live
    .filter((match) => matchTeamsPair(match.home, match.away, homeTeam, awayTeam))
    .sort((a, b) => Number(b.status === "live") - Number(a.status === "live"))
    .slice(0, MAX_CANDIDATES);
  if (!candidates.length) return [];

  const channels: Channel[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const stream = await resolveSportplusMatchStream(candidate.tournamentId, candidate.id);
    const sources =
      stream?.sources?.length
        ? stream.sources
        : stream?.primary
          ? [{ src: stream.primary }]
          : [];
    sources.forEach((source, index) => {
      const url = lpfRelayUrl(source.src);
      if (seen.has(url)) return;
      seen.add(url);
      channels.push({
        // Opaque id: provider names and coordinates never reach the client.
        id: `lpf-${createHash("sha256")
          .update(`${candidate.tournamentId}|${candidate.id}|${index}`)
          .digest("hex")
          .slice(0, 16)}`,
        name: `Fuente ${index + 1}${source.quality ? ` ${source.quality}` : ""}`,
        url,
        kind: "hls",
      });
    });
  }
  return channels;
}
