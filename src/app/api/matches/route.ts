import { NextRequest } from "next/server";
import { fetchAgenda } from "@/lib/agenda-source";
import { matchPlLeague, getBroadcastChannels, LEAGUE_LOGOS } from "@/lib/constants";
import { getTeamLogo } from "@/lib/team-logos";
import type { Match } from "@/lib/types";
import { validateQuery, matchesQuerySchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

function toArgentinaDate(dateISO: string): string {
  return new Date(dateISO).toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 10);
}

function getArgentinaToday(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 10);
}

function isNearNow(dateISO: string): boolean {
  const difference = Math.abs(new Date(dateISO).getTime() - Date.now());
  return difference <= 6 * 60 * 60 * 1000;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function hashSlug(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function inferStatus(dateISO: string): "NS" | "1H" | "FT" {
  const diffMin = (new Date(dateISO).getTime() - Date.now()) / 60000;
  if (diffMin > 10) return "NS";
  if (diffMin < -240) return "FT";
  return "1H";
}

export async function GET(request: NextRequest) {
  const validation = await validateQuery(request, matchesQuerySchema);
  if ("error" in validation) return validation.error;

  const requestedDate = validation.data.date;
  const flAgenda = await fetchAgenda();

  const date = requestedDate || getArgentinaToday();
  const filteredAgenda = flAgenda.filter(
    (m) => toArgentinaDate(m.dateISO) === date || isNearNow(m.dateISO)
  );

  const seenTeams = new Set<string>();
  const matches: Match[] = [];

  for (const flMatch of filteredAgenda) {
    const dedupKey = `${normalize(flMatch.homeTeam)}-${normalize(flMatch.awayTeam)}`;
    if (seenTeams.has(dedupKey)) continue;
    seenTeams.add(dedupKey);

    const league = matchPlLeague(flMatch.league, flMatch.homeTeam, flMatch.awayTeam);
    if (!league) continue;
    if (flMatch.embeds.length === 0) continue;

    const status = inferStatus(flMatch.dateISO);

    matches.push({
      id: hashSlug(flMatch.slug),
      league: {
        id: league.id,
        name: league.name,
        country: league.country,
        logo: LEAGUE_LOGOS[league.id] || `https://media.api-sports.io/football/leagues/${league.id}.png`,
        flag: "",
        slug: league.slug,
      },
      homeTeam: { id: 0, name: flMatch.homeTeam, logo: "" },
      awayTeam: { id: 0, name: flMatch.awayTeam, logo: "" },
      date: flMatch.dateISO,
      timestamp: Math.floor(new Date(flMatch.dateISO).getTime() / 1000),
      status: {
        short: status,
        long: status === "NS" ? "Próximamente" : status === "FT" ? "Finalizado" : "En Juego",
        elapsed: null,
      },
      score: { home: null, away: null },
      channels: [],
      broadcastChannels: getBroadcastChannels(league.id),
      _eventSlug: flMatch.slug,
      _eventSources: flMatch.embeds.map((e) => ({ id: e.id, name: e.name, embedIframe: e.embedIframe })),
    });
  }

  matches.sort((a, b) => a.timestamp - b.timestamp);

  const teamNames = new Set<string>();
  for (const m of matches) {
    teamNames.add(m.homeTeam.name);
    teamNames.add(m.awayTeam.name);
  }

  const logoEntries = await Promise.all(
    Array.from(teamNames).map(async (name) => {
      const logo = await getTeamLogo(name);
      return [name, logo] as const;
    })
  );

  const logoMap = new Map(logoEntries);
  for (const m of matches) {
    m.homeTeam.logo = logoMap.get(m.homeTeam.name) ?? "";
    m.awayTeam.logo = logoMap.get(m.awayTeam.name) ?? "";
  }

  return Response.json({ matches, date });
}
