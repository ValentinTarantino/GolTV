import { getMatchById } from "@/lib/api-football";
import { getStreamsForMatch } from "@/lib/streaming";
import { getPelotaLibreStream, findPelotaLibreStreams } from "@/lib/pelotalibre";
import { LIVE_STATUSES, getLeagueIdByName, getLeagueLogo } from "@/lib/constants";
import type { Match, Channel } from "@/lib/types";

export const revalidate = 900;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  const url = new URL(request.url);
  const streamId = url.searchParams.get("streamId");
  const plSlug = url.searchParams.get("plSlug");
  const plSources = url.searchParams.get("plSources");
  const id = parseInt(matchId, 10);

  if (isNaN(id) && !streamId) {
    return Response.json({ error: "Invalid match ID" }, { status: 400 });
  }

  let match: Match | null = null;
  if (!isNaN(id)) {
    match = (await getMatchById(id)) ?? null;
  }

  if (match && LIVE_STATUSES.includes(match.status.short)) {
    const channels: Channel[] = [];

    if (plSlug && plSources) {
      try {
        const sources = JSON.parse(plSources) as { id: string; name: string }[];
        for (const source of sources) {
          const ch = await getPelotaLibreStream(plSlug, source.id);
          if (ch) {
            ch.name = source.name;
            channels.push(ch);
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    if (channels.length === 0) {
      const plChannels = await findPelotaLibreStreams(
        match.homeTeam.name,
        match.awayTeam.name
      );
      channels.push(...plChannels);
    }

    if (channels.length === 0 && streamId) {
      const rapidChannels = await getStreamsForMatch(
        match.homeTeam.name,
        match.awayTeam.name,
        streamId
      );
      channels.push(...rapidChannels);
    } else if (channels.length === 0) {
      const rapidChannels = await getStreamsForMatch(
        match.homeTeam.name,
        match.awayTeam.name
      );
      channels.push(...rapidChannels);
    }

    if (channels.length > 0) {
      match.channels = channels;
    }
  }

  if (match) {
    return Response.json({ match });
  }

  const homeTeam = url.searchParams.get("home") || "Home";
  const awayTeam = url.searchParams.get("away") || "Away";
  const league = url.searchParams.get("league") || "Internacional";

  if (plSlug && plSources) {
    const channels: Channel[] = [];
    try {
      const sources = JSON.parse(plSources) as { id: string; name: string }[];
      for (const source of sources) {
        const ch = await getPelotaLibreStream(plSlug, source.id);
        if (ch) {
          ch.name = source.name;
          channels.push(ch);
        }
      }
    } catch {
      // ignore parse errors
    }

    const leagueId = getLeagueIdByName(league);
    const syntheticMatch: Match = {
      id: id || 0,
      league: {
        id: leagueId,
        name: league,
        country: "Internacional",
        logo: getLeagueLogo(leagueId),
        flag: "",
        slug: league.toLowerCase().replace(/\s+/g, "-"),
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

  if (streamId) {
    const channels: Channel[] = [];
    const rapidChannels = await getStreamsForMatch(homeTeam, awayTeam, streamId);
    channels.push(...rapidChannels);

    const leagueId = getLeagueIdByName(league);
    const syntheticMatch: Match = {
      id: id || 0,
      league: {
        id: leagueId,
        name: league,
        country: "Internacional",
        logo: getLeagueLogo(leagueId),
        flag: "",
        slug: league.toLowerCase().replace(/\s+/g, "-"),
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

  return Response.json({ error: "Match not found" }, { status: 404 });
}
