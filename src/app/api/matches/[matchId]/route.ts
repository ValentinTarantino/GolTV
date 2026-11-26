import { findPlayerFiveStreams } from "@/lib/player-five-source";
import { findPrimaryStreams } from "@/lib/primary-player-source";
import { getAgendaStream, findAgendaStreams } from "@/lib/agenda-source";
import { findSecondaryStreams } from "@/lib/secondary-source";
import { findSportplusStreams } from "@/lib/sportplus-source";
import { findPlayerTwoStreams } from "@/lib/player-two-source";
import { findPlayerSixStreams } from "@/lib/player-six-source";
import { LIVE_STATUSES, getLeagueIdByName, getLeagueLogo as rawLeagueLogo } from "@/lib/constants";
import { proxyImageUrl, publicChannels } from "@/lib/public-url";

/** League badge URLs go through the image proxy so CDN hosts stay hidden. */
const getLeagueLogo = (leagueId: number): string => proxyImageUrl(rawLeagueLogo(leagueId));
import { findAgendaFixtureById } from "@/lib/agenda-fixture";
import { isIPBanned } from "@/lib/chat";
import { touchRequestPresence } from "@/lib/presence";
import { BANNED_HEADER } from "@/lib/viewer-id";
import type { Match, Channel } from "@/lib/types";
import { validateParams, validateQuery, createErrorResponse, matchIdParamsSchema, matchIdQuerySchema } from "@/lib/validators";

function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;
  const cfIP = request.headers.get("cf-connecting-ip");
  if (cfIP) return cfIP;
  return "unknown";
}

// Stream selection depends on the requested player mode and provider's current
// match mapping. Reusing a response can keep the previous channel attached
// after switching between providers.
export const revalidate = 0;

/** Serializes a match with iframe channel URLs sealed behind internal routes. */
function respond(match: Match): Response {
  return Response.json({ match: { ...match, channels: publicChannels(match.channels) } });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const clientIP = getClientIP(request);
  if (await isIPBanned(clientIP)) {
    return Response.json(
      { error: "Access denied" },
      { status: 403, headers: { [BANNED_HEADER]: "1" } }
    );
  }

  const paramsValidation = await validateParams(params, matchIdParamsSchema);
  if ("error" in paramsValidation) return paramsValidation.error;

  const { matchId } = paramsValidation.data;
  touchRequestPresence(request, matchId);
  const queryValidation = await validateQuery(request, matchIdQuerySchema);
  if ("error" in queryValidation) return queryValidation.error;

  const { streamId, eventSlug, eventSources, player } = queryValidation.data;
  let { home, away, league } = queryValidation.data;
  const playerMode = player === "1" || player === "3" || player === "5" || player === "6" || player === "8" ? player : "2";
  const id = parseInt(matchId, 10);

  if (isNaN(id) && !streamId) {
    return createErrorResponse("Invalid match ID", 400);
  }

  const match: Match | null = null;
  // API-Football removed — match info comes from agenda sources only

  // Skip the match-based channel lookup since match is always null now.
  // The fallback below handles all cases via agenda sources.

  // Agenda fixtures are not API-Football records: their id is hashSlug(slug)
  // and watch links no longer carry the fixture context, so rebuild it from
  // the cached agendas. Older shared links still work — explicit params win.
  let fixtureDateISO: string | undefined;
  if (!isNaN(id) && (!home || !away)) {
    const fixture = await findAgendaFixtureById(id).catch(() => null);
    if (fixture) {
      home = home || fixture.homeTeam;
      away = away || fixture.awayTeam;
      league = league || fixture.leagueName;
      fixtureDateISO = fixture.dateISO;
    }
  }
  const fixtureTimestamp = fixtureDateISO
    ? Math.floor(new Date(fixtureDateISO).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

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
      date: fixtureDateISO ?? new Date().toISOString(),
      timestamp: fixtureTimestamp,
      status: { short: "LIVE", long: "En Juego", elapsed: null },
      score: { home: 0, away: 0 },
      channels,
    };

    return respond(syntheticMatch);
  }

  if (playerMode === "2" && home && away) {
    const channels = await findSportplusStreams(homeTeam, awayTeam);
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
      date: fixtureDateISO ?? new Date().toISOString(),
      timestamp: fixtureTimestamp,
      status: { short: "LIVE", long: "En Juego", elapsed: null },
      score: { home: 0, away: 0 },
      channels,
    };

    return respond(syntheticMatch);
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
      date: fixtureDateISO ?? new Date().toISOString(),
      timestamp: fixtureTimestamp,
      status: { short: "LIVE", long: "En Juego", elapsed: null },
      score: { home: 0, away: 0 },
      channels,
    };

    return respond(syntheticMatch);
  }

  if (playerMode === "8" && home && away) {
    const channels = await findPlayerSixStreams(homeTeam, awayTeam);
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
      date: fixtureDateISO ?? new Date().toISOString(),
      timestamp: fixtureTimestamp,
      status: { short: "LIVE", long: "En Juego", elapsed: null },
      score: { home: 0, away: 0 },
      channels,
    };

    return respond(syntheticMatch);
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
      date: fixtureDateISO ?? new Date().toISOString(),
      timestamp: fixtureTimestamp,
      status: { short: "LIVE", long: "En Juego", elapsed: null },
      score: { home: 0, away: 0 },
      channels,
    };

    return respond(syntheticMatch);
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
      date: fixtureDateISO ?? new Date().toISOString(),
      timestamp: fixtureTimestamp,
      status: { short: "LIVE", long: "En Juego", elapsed: null },
      score: { home: 0, away: 0 },
      channels,
    };

    return respond(syntheticMatch);
  }

  return createErrorResponse("Match not found", 404);
}
