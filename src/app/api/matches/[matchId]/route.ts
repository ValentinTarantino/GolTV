import { getMatchById } from "@/lib/api-football";
import { getStreamsForMatch } from "@/lib/streaming";
import { getFutbolLibreStream } from "@/lib/futbollibre";
import { findPelotaLibreStreams } from "@/lib/pelotalibre";
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
  const player = url.searchParams.get("player") === "2" ? "2" : "1";
  const id = parseInt(matchId, 10);

  if (isNaN(id) && !streamId) {
    return Response.json({ error: "Invalid match ID" }, { status: 400 });
  }

  let match: Match | null = null;
  if (!isNaN(id)) {
    match = (await getMatchById(id)) ?? null;
  }

  if (match && (LIVE_STATUSES.includes(match.status.short) || player === "2")) {
    const channels: Channel[] = [];

    if (player === "2") {
      channels.push(...await findPelotaLibreStreams(match.homeTeam.name, match.awayTeam.name));
    } else if (plSlug && plSources) {
      try {
        const sources = JSON.parse(plSources) as { id: string; name: string; embedIframe: string }[];
        for (const source of sources) {
          const ch = await getFutbolLibreStream(source.embedIframe, source.name);
          if (ch) {
            channels.push(ch);
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    if (player === "1" && channels.length === 0) {
      const rapidChannels = await getStreamsForMatch(
        match.homeTeam.name,
        match.awayTeam.name,
        streamId || undefined
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

  if (player === "2") {
    const channels = await findPelotaLibreStreams(homeTeam, awayTeam);
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

  if (plSlug && plSources) {
    const channels: Channel[] = [];
    try {
      const sources = JSON.parse(plSources) as { id: string; name: string; embedIframe: string }[];
      for (const source of sources) {
        const ch = await getFutbolLibreStream(source.embedIframe, source.name);
        if (ch) {
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
