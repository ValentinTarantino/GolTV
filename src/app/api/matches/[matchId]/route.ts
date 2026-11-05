import { findPlayerFiveStreams } from "@/lib/player-five-source";
import { findPrimaryStreams } from "@/lib/primary-player-source";
import { getMatchById } from "@/lib/api-football";
import { getStreamsForMatch } from "@/lib/streaming";
import { getAgendaStream, findAgendaStreams } from "@/lib/agenda-source";
import { findEventStreams } from "@/lib/event-source";
import { findSecondaryStreams } from "@/lib/secondary-source";
import { findPlayerTwoStreams } from "@/lib/player-two-source";
import { LIVE_STATUSES, getLeagueIdByName, getLeagueLogo } from "@/lib/constants";
import type { Match, Channel } from "@/lib/types";
import { validateParams, validateQuery, createErrorResponse, matchIdParamsSchema, matchIdQuerySchema } from "@/lib/validators";

// Stream selection depends on the requested player mode and provider's current
// match mapping. Reusing a response can keep the previous channel attached
// after switching between providers.
export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const paramsValidation = await validateParams(params, matchIdParamsSchema);
  if ("error" in paramsValidation) return paramsValidation.error;

  const { matchId } = paramsValidation.data;
  const queryValidation = await validateQuery(request, matchIdQuerySchema);
  if ("error" in queryValidation) return queryValidation.error;

  const { streamId, eventSlug, eventSources, player, home, away, league } = queryValidation.data;
  const playerMode = player === "2" || player === "3" || player === "4" || player === "5" || player === "6" ? player : "1";
  const id = parseInt(matchId, 10);

  if (isNaN(id) && !streamId) {
    return createErrorResponse("Invalid match ID", 400);
  }

  let match: Match | null = null;
  if (!isNaN(id)) {
    match = (await getMatchById(id)) ?? null;
  }

  if (match && (LIVE_STATUSES.includes(match.status.short) || playerMode !== "3")) {
    const channels: Channel[] = [];

    if (playerMode === "6") {
      channels.push(...await findPrimaryStreams(match.homeTeam.name, match.awayTeam.name));
    } else if (playerMode === "1") {
      channels.push(...await findSecondaryStreams(match.homeTeam.name, match.awayTeam.name));
    } else if (playerMode === "2") {
      // Player 2 now uses Secondary Streams (old Player 1)
      channels.push(...await findSecondaryStreams(match.homeTeam.name, match.awayTeam.name));
    } else if (playerMode === "4") {
      channels.push(...await findEventStreams(match.homeTeam.name, match.awayTeam.name));
    } else if (playerMode === "5") {
      channels.push(...await findPlayerFiveStreams(match.homeTeam.name, match.awayTeam.name));
    } else if (eventSlug && eventSources) {
      try {
        const sources = JSON.parse(eventSources) as { id: string; name: string; embedIframe: string }[];
        for (const source of sources) {
          const ch = await getAgendaStream(source.embedIframe, source.name);
          if (ch) {
            channels.push(ch);
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    if (playerMode === "3" && channels.length === 0) {
      const rapidChannels = await getStreamsForMatch(
        match.homeTeam.name,
        match.awayTeam.name,
        streamId || undefined
      );
      channels.push(...rapidChannels);
    }

    // Each player mode is a separate provider. Never leave the previous
    // provider's channels attached when the selected source returns none.
    if (playerMode !== "3" || channels.length > 0) {
      match.channels = channels;
    }
  }

  if (match) {
    return Response.json({ match });
  }

  const homeTeam = home || "Home";
  const awayTeam = away || "Away";
  const leagueName = league || "Internacional";

  if ((playerMode === "1" || playerMode === "6") && home && away) {
    const channels = playerMode === "6"
      ? await findPrimaryStreams(homeTeam, awayTeam)
      : await findSecondaryStreams(homeTeam, awayTeam);
    const leagueId = getLeagueIdByName(leagueName);
    const syntheticMatch: Match = {
      id: id || 0,
      league: {
        id: leagueId,
        name: leagueName,
        country: "Internacional",
        logo: getLeagueLogo(leagueId),
        flag: "",
        slug: leagueName.toLowerCase().replace(/\s+/g, "-"),
      },
      homeTeam: { id: 0, name: homeTeam, logo: "" },
      awayTeam: { id: 0, name: awayTeam, logo: "" },
      date: new Date().toISOString(),
      timestamp: Math.floor(Date.now() / 1000),
      status: { short: "LIVE", long: "En Juego", elapsed: null },
      score: { home: 0, away: 0 },
      channels,
    };

    return Response.json({ match: syntheticMatch });
  }

  if (playerMode === "2" && home && away) {
    const channels = await findPlayerTwoStreams(homeTeam, awayTeam);
    const leagueId = getLeagueIdByName(leagueName);
    const syntheticMatch: Match = {
      id: id || 0,
      league: {
        id: leagueId,
        name: leagueName,
        country: "Internacional",
        logo: getLeagueLogo(leagueId),
        flag: "",
        slug: leagueName.toLowerCase().replace(/\s+/g, "-"),
      },
      homeTeam: { id: 0, name: homeTeam, logo: "" },
      awayTeam: { id: 0, name: awayTeam, logo: "" },
      date: new Date().toISOString(),
      timestamp: Math.floor(Date.now() / 1000),
      status: { short: "LIVE", long: "En Juego", elapsed: null },
      score: { home: 0, away: 0 },
      channels,
    };

    return Response.json({ match: syntheticMatch });
  }

  if (playerMode === "4" && home && away) {
    const channels = await findEventStreams(homeTeam, awayTeam);
    const leagueId = getLeagueIdByName(leagueName);
    const syntheticMatch: Match = {
      id: id || 0,
      league: {
        id: leagueId,
        name: leagueName,
        country: "Internacional",
        logo: getLeagueLogo(leagueId),
        flag: "",
        slug: leagueName.toLowerCase().replace(/\s+/g, "-"),
      },
      homeTeam: { id: 0, name: homeTeam, logo: "" },
      awayTeam: { id: 0, name: awayTeam, logo: "" },
      date: new Date().toISOString(),
      timestamp: Math.floor(Date.now() / 1000),
      status: { short: "LIVE", long: "En Juego", elapsed: null },
      score: { home: 0, away: 0 },
      channels,
    };

    return Response.json({ match: syntheticMatch });
  }

  if (playerMode === "5" && home && away) {
    const channels = await findPlayerFiveStreams(homeTeam, awayTeam);
    const leagueId = getLeagueIdByName(leagueName);
    const syntheticMatch: Match = {
      id: id || 0,
      league: {
        id: leagueId,
        name: leagueName,
        country: "Internacional",
        logo: getLeagueLogo(leagueId),
        flag: "",
        slug: leagueName.toLowerCase().replace(/\s+/g, "-"),
      },
      homeTeam: { id: 0, name: homeTeam, logo: "" },
      awayTeam: { id: 0, name: awayTeam, logo: "" },
      date: new Date().toISOString(),
      timestamp: Math.floor(Date.now() / 1000),
      status: { short: "LIVE", long: "En Juego", elapsed: null },
      score: { home: 0, away: 0 },
      channels,
    };

    return Response.json({ match: syntheticMatch });
  }

  if (playerMode === "3" && eventSlug && eventSources) {
    const channels: Channel[] = [];
    try {
      const sources = JSON.parse(eventSources) as { id: string; name: string; embedIframe: string }[];
      for (const source of sources) {
        const ch = await getAgendaStream(source.embedIframe, source.name);
        if (ch) {
          channels.push(ch);
        }
      }
    } catch {
      // ignore parse errors
    }

    const leagueId = getLeagueIdByName(leagueName);
    const syntheticMatch: Match = {
      id: id || 0,
      league: {
        id: leagueId,
        name: leagueName,
        country: "Internacional",
        logo: getLeagueLogo(leagueId),
        flag: "",
        slug: leagueName.toLowerCase().replace(/\s+/g, "-"),
      },
      homeTeam: { id: 0, name: homeTeam, logo: "" },
      awayTeam: { id: 0, name: awayTeam, logo: "" },
      date: new Date().toISOString(),
      timestamp: Math.floor(Date.now() / 1000),
      status: { short: "LIVE", long: "En Juego", elapsed: null },
      score: { home: 0, away: 0 },
      channels,
    };

    return Response.json({ match: syntheticMatch });
  }

  if (playerMode === "3" && streamId) {
    const channels: Channel[] = [];
    const rapidChannels = await getStreamsForMatch(homeTeam, awayTeam, streamId);
    channels.push(...rapidChannels);

    const leagueId = getLeagueIdByName(leagueName);
    const syntheticMatch: Match = {
      id: id || 0,
      league: {
        id: leagueId,
        name: leagueName,
        country: "Internacional",
        logo: getLeagueLogo(leagueId),
        flag: "",
        slug: leagueName.toLowerCase().replace(/\s+/g, "-"),
      },
      homeTeam: { id: 0, name: homeTeam, logo: "" },
      awayTeam: { id: 0, name: awayTeam, logo: "" },
      date: new Date().toISOString(),
      timestamp: Math.floor(Date.now() / 1000),
      status: { short: "LIVE", long: "En Juego", elapsed: null },
      score: { home: 0, away: 0 },
      channels,
    };

    return Response.json({ match: syntheticMatch });
  }

  // Secondary-fixture matches: player 3 resolves the primary agenda by team
  // names when no API-Football record or stream ID is available.
  if (playerMode === "3" && home && away) {
    const channels = await findAgendaStreams(home, away);
    const leagueId = getLeagueIdByName(leagueName);
    const syntheticMatch: Match = {
      id: id || 0,
      league: {
        id: leagueId,
        name: leagueName,
        country: "Internacional",
        logo: getLeagueLogo(leagueId),
        flag: "",
        slug: leagueName.toLowerCase().replace(/\s+/g, "-"),
      },
      homeTeam: { id: 0, name: homeTeam, logo: "" },
      awayTeam: { id: 0, name: awayTeam, logo: "" },
      date: new Date().toISOString(),
      timestamp: Math.floor(Date.now() / 1000),
      status: { short: "LIVE", long: "En Juego", elapsed: null },
      score: { home: 0, away: 0 },
      channels,
    };

    return Response.json({ match: syntheticMatch });
  }

  return createErrorResponse("Match not found", 404);
}
