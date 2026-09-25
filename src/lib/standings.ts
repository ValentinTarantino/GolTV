import type { Standing, StandingsTable, StandingsTab, BracketRound, BracketMatch, LeagueStandingsData } from "./types";
import { getCache, setCache } from "./cache";

const PROMIEDOS_BASE = "https://www.promiedos.com.ar/league";

export interface PromiedosLeague {
  urlName: string;
  id: string;
}

export const PROMIEDOS_LEAGUES: Record<number, PromiedosLeague> = {
  128: { urlName: "liga-profesional", id: "hc" },
  130: { urlName: "copa-argentina", id: "gea" },
  71: { urlName: "brasileirao-serie-a", id: "bbd" },
  73: { urlName: "copa-do-brasil", id: "bbf" },
  13: { urlName: "libertadores", id: "bac" },
  11: { urlName: "conmebol-sudamericana", id: "dij" },
  2: { urlName: "uefa-champions-league", id: "fhc" },
  3: { urlName: "uefa-europa-league", id: "fhd" },
  39: { urlName: "premier-league", id: "h" },
  140: { urlName: "laliga", id: "bb" },
  135: { urlName: "serie-a", id: "bh" },
  78: { urlName: "bundesliga", id: "cf" },
  80: { urlName: "3-bundesliga", id: "cfb" },
  332: { urlName: "mls", id: "bae" },
  268: { urlName: "uruguayan-championship", id: "gbh" },
  18: { urlName: "concacaf-champions-cup", id: "bhb" },
  265: { urlName: "campeonato-nacional", id: "bdf" },
  267: { urlName: "copa-chile", id: "bde" },
  239: { urlName: "liga-betplay", id: "gca" },
  281: { urlName: "liga-1-peru", id: "gbc" },
  57: { urlName: "liga-pro-ecuador", id: "gbd" },
  504: { urlName: "copa-ecuador", id: "gbe" },
  137: { urlName: "coppa-italia", id: "bhc" },
  235: { urlName: "liga-mx", id: "gbf" },
  431: { urlName: "leagues-cup", id: "bgf" },
  // National teams - unlikely to have Promiedos standings
  // 5: UEFA Nations League
  // 6: CONCACAF Nations League
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseValues(values: { key: string; value: any }[]): Record<string, string | number[]> {
  const map: Record<string, string | number[]> = {};
  for (const v of values) {
    map[v.key] = v.value;
  }
  return map;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStandingRow(row: any): Standing {
  const vals = parseValues(row.values);
  const goalsRaw = (vals.Goals as string) || (vals.Goles as string) || "0:0";
  const [gf, ga] = goalsRaw.split(":").map(Number);

  // Try multiple possible field names for team name
  const teamName = 
    row.entity?.object?.name ||
    row.team?.name ||
    row.entity?.name ||
    vals.Team ||
    vals.Equipo ||
    vals["Team"] ||
    vals["Equipo"] ||
    "";

  return {
    rank: Math.round(row.num || 0),
    team: {
      id: 0,
      name: teamName,
      logo: "",
    },
    points: Number(vals.Points) || Number(vals.Puntos) || Number(vals.PTS) || 0,
    played: Number(vals.GamePlayed) || Number(vals.PJ) || Number(vals.JJ) || 0,
    won: Number(vals.GamesWon) || Number(vals.PG) || Number(vals.G) || 0,
    drawn: Number(vals.GamesEven) || Number(vals.PE) || Number(vals.E) || 0,
    lost: Number(vals.GamesLost) || Number(vals.PP) || Number(vals.P) || 0,
    goalsFor: gf || 0,
    goalsAgainst: ga || 0,
    goalsDiff: Number(vals.Ratio) || Number(vals.Dif) || Number(vals.DG) || 0,
    trend: (Array.isArray(vals["{trend}"]) ? vals["{trend}"] : []) as number[],
    destinationColor: row.destination_color || undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTablesGroups(tablesGroups: any[]): StandingsTab[] {
  return tablesGroups.map((group) => ({
    name: group.name || "General",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tables: (group.tables || []).map((table: any): StandingsTable => ({
      name: table.name || "General",
      standings: (table.table?.rows || []).map(parseStandingRow),
    })),
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBrackets(brackets: any): BracketRound[] {
  if (!brackets?.stages) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return brackets.stages.map((stage: any): BracketRound => ({
    name: stage.name || "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matches: (stage.groups || []).flatMap((group: any): BracketMatch[] => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (group.games || []).map((game: any): BracketMatch => {
        const home = game.teams?.[0];
        const away = game.teams?.[1];
        return {
          homeTeam: home?.name || "",
          awayTeam: away?.name || "",
          homeScore: game.scores?.[0] != null ? String(game.scores[0]) : "",
          awayScore: game.scores?.[1] != null ? String(game.scores[1]) : "",
          round: stage.name || "",
          status: game.status?.short_name || game.game_time_status_to_display || "",
        };
      });
    }),
  }));
}

const STANDINGS_CACHE_TTL = 30 * 60 * 1000;

function logStandingsDebug(...args: unknown[]): void {
  if (process.env.NODE_ENV === "development") {
    console.log(...args);
  }
}

// Fallback: fetch from a public API that provides standings
async function fetchFromApiFootball(leagueId: number, season: number): Promise<LeagueStandingsData | null> {
  try {
    const apiKey = process.env.API_FOOTBALL_KEY?.split(",")[0]?.trim();
    if (!apiKey) return null;

    const res = await fetch(`https://v3.football.api-sports.io/standings?league=${leagueId}&season=${season}`, {
      headers: { "x-apisports-key": apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const response = data.response?.[0];
    if (!response?.league?.standings) return null;

    interface ApiFootballStandingRow {
  team: { id: number; name: string; logo: string };
  points: number;
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  goalsDiff: number;
  form?: string;
  description?: string;
}

const tabs: StandingsTab[] = response.league.standings.map((standingGroup: ApiFootballStandingRow[], groupIndex: number) => ({
      name: standingGroup.length > 0 ? `Group ${groupIndex + 1}` : "General",
      tables: [{
        name: "General",
        standings: standingGroup.map((row: ApiFootballStandingRow, index: number) => ({
          rank: index + 1,
          team: {
            id: row.team?.id || 0,
            name: row.team?.name || "",
            logo: row.team?.logo || "",
          },
          points: row.points || 0,
          played: row.all?.played || 0,
          won: row.all?.win || 0,
          drawn: row.all?.draw || 0,
          lost: row.all?.lose || 0,
          goalsFor: row.all?.goals?.for || 0,
          goalsAgainst: row.all?.goals?.against || 0,
          goalsDiff: row.goalsDiff || 0,
          trend: row.form ? row.form.split("").map((c: string) => c === "W" ? 1 : c === "D" ? 2 : 3).slice(0, 5) : [],
          destinationColor: row.description ? 
            (row.description.includes("Champions") ? "gold" : 
             row.description.includes("Europa") ? "silver" : 
             row.description.includes("Relegation") ? "red" : undefined) : undefined,
        })),
      }],
    }));

    return { tabs, brackets: [] };
  } catch {
    return null;
  }
}

export async function fetchLeagueStandings(
  leagueId: number
): Promise<LeagueStandingsData> {
  const league = PROMIEDOS_LEAGUES[leagueId];
  if (!league) return { tabs: [], brackets: [] };

  const cacheKey = `standings:${leagueId}`;
  const cached = await getCache<LeagueStandingsData>(cacheKey);
  if (cached) return cached;

  // Try Promiedos first
  try {
    const url = `${PROMIEDOS_BASE}/${league.urlName}/${league.id}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GolTVLibre/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[standings] Promiedos HTTP ${res.status} for league ${leagueId}`);
      throw new Error("Promiedos failed");
    }

    const html = await res.text();

    const nextDataMatch = html.match(
      /<script\s+id="__NEXT_DATA__"\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/
    );
    if (!nextDataMatch) {
      console.warn(`[standings] No __NEXT_DATA__ found for league ${leagueId}`);
      throw new Error("No NEXT_DATA");
    }

    const nextData = JSON.parse(nextDataMatch[1]);
    const data = nextData?.props?.pageProps?.data;
    if (!data) {
      console.warn(`[standings] No pageProps.data for league ${leagueId}`);
      throw new Error("No pageProps");
    }

    logStandingsDebug(`[standings] League ${leagueId} - tables_groups:`, data.tables_groups?.length || 0);
    logStandingsDebug(`[standings] League ${leagueId} - brackets:`, data.brackets?.stages?.length || 0);

    const tabs = data.tables_groups ? parseTablesGroups(data.tables_groups) : [];
    const brackets = data.brackets ? parseBrackets(data.brackets) : [];

    const totalStandings = tabs.reduce((sum, t) => sum + t.tables.reduce((s, tbl) => s + tbl.standings.length, 0), 0);
    logStandingsDebug(`[standings] League ${leagueId} - parsed ${tabs.length} tabs, ${totalStandings} total standings`);

    // If Promiedos returns empty, fall back to API-Football
    if (totalStandings === 0) {
      throw new Error("Empty standings from Promiedos");
    }

    const result: LeagueStandingsData = { tabs, brackets };
    await setCache(cacheKey, result, STANDINGS_CACHE_TTL);
    return result;
  } catch (promiedosError) {
    console.warn(`[standings] Promiedos failed for league ${leagueId}, trying API-Football fallback:`, promiedosError);
    
    // Fallback to API-Football
    const currentSeason = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const apiFootballData = await fetchFromApiFootball(leagueId, currentSeason);
    if (apiFootballData && apiFootballData.tabs.some(t => t.tables.some(tbl => tbl.standings.length > 0))) {
      logStandingsDebug(`[standings] Using API-Football fallback for league ${leagueId}`);
      await setCache(cacheKey, apiFootballData, STANDINGS_CACHE_TTL);
      return apiFootballData;
    }

    console.warn(`[standings] All sources failed for league ${leagueId}`);
    return { tabs: [], brackets: [] };
  }
}

export function hasStandings(leagueId: number): boolean {
  return leagueId in PROMIEDOS_LEAGUES;
}