import type { Standing, StandingsTable, StandingsTab, BracketRound, BracketMatch, LeagueStandingsData } from "./types";

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
  332: { urlName: "mls", id: "bae" },
  268: { urlName: "uruguayan-championship", id: "gbh" },
  18: { urlName: "concacaf-champions-cup", id: "bhb" },
  265: { urlName: "campeonato-nacional", id: "bdf" },
  239: { urlName: "liga-betplay", id: "gca" },
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
  const goalsRaw = (vals.Goals as string) || "0:0";
  const [gf, ga] = goalsRaw.split(":").map(Number);

  return {
    rank: Math.round(row.num || 0),
    team: {
      id: 0,
      name: row.entity?.object?.name || "",
      logo: "",
    },
    points: Number(vals.Points) || 0,
    played: Number(vals.GamePlayed) || 0,
    won: Number(vals.GamesWon) || 0,
    drawn: Number(vals.GamesEven) || 0,
    lost: Number(vals.GamesLost) || 0,
    goalsFor: gf || 0,
    goalsAgainst: ga || 0,
    goalsDiff: Number(vals.Ratio) || 0,
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

const cache = new Map<string, { data: LeagueStandingsData; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

export async function fetchLeagueStandings(
  leagueId: number
): Promise<LeagueStandingsData> {
  const league = PROMIEDOS_LEAGUES[leagueId];
  if (!league) return { tabs: [], brackets: [] };

  const cacheKey = `promiedos-${league.id}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `${PROMIEDOS_BASE}/${league.urlName}/${league.id}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GolTVLibre/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return cached?.data || { tabs: [], brackets: [] };

    const html = await res.text();

    const nextDataMatch = html.match(
      /<script\s+id="__NEXT_DATA__"\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/
    );
    if (!nextDataMatch) return cached?.data || { tabs: [], brackets: [] };

    const nextData = JSON.parse(nextDataMatch[1]);
    const data = nextData?.props?.pageProps?.data;
    if (!data) return cached?.data || { tabs: [], brackets: [] };

    const tabs = data.tables_groups ? parseTablesGroups(data.tables_groups) : [];
    const brackets = data.brackets ? parseBrackets(data.brackets) : [];

    const result: LeagueStandingsData = { tabs, brackets };
    cache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch {
    return cached?.data || { tabs: [], brackets: [] };
  }
}

export function hasStandings(leagueId: number): boolean {
  return leagueId in PROMIEDOS_LEAGUES;
}
