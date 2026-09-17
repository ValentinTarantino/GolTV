import type { Match } from "./types";
import { getChannelsForCountry } from "./constants";

function todayAt(hour: number, min: number): { date: string; timestamp: number } {
  const d = new Date();
  d.setHours(hour, min, 0, 0);
  return { date: d.toISOString(), timestamp: Math.floor(d.getTime() / 1000) };
}

function yesterdayAt(hour: number, min: number): { date: string; timestamp: number } {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(hour, min, 0, 0);
  return { date: d.toISOString(), timestamp: Math.floor(d.getTime() / 1000) };
}

function tomorrowAt(hour: number, min: number): { date: string; timestamp: number } {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, min, 0, 0);
  return { date: d.toISOString(), timestamp: Math.floor(d.getTime() / 1000) };
}

const ARG_LEAGUE = {
  id: 128,
  name: "Liga Profesional",
  country: "Argentina",
  logo: "https://media.api-sports.io/football/leagues/128.png",
  flag: "https://media.api-sports.io/flags/ar.svg",
  slug: "liga-argentina",
};

const LIBERTADORES = {
  id: 13,
  name: "Copa Libertadores",
  country: "Internacional",
  logo: "https://media.api-sports.io/football/leagues/13.png",
  flag: "",
  slug: "copa-libertadores",
};

const BRASILEIRAO = {
  id: 71,
  name: "Brasileirão Serie A",
  country: "Brasil",
  logo: "https://media.api-sports.io/football/leagues/71.png",
  flag: "https://media.api-sports.io/flags/br.svg",
  slug: "brasileirao",
};

const LIGA_MX = {
  id: 262,
  name: "Liga MX",
  country: "México",
  logo: "https://media.api-sports.io/football/leagues/262.png",
  flag: "https://media.api-sports.io/flags/mx.svg",
  slug: "liga-mx",
};

const SUDAMERICANA = {
  id: 11,
  name: "Copa Sudamericana",
  country: "Internacional",
  logo: "https://media.api-sports.io/football/leagues/11.png",
  flag: "",
  slug: "copa-sudamericana",
};

function team(id: number, name: string) {
  return {
    id,
    name,
    logo: `https://media.api-sports.io/football/teams/${id}.png`,
  };
}

const TEAMS = {
  river: team(435, "River Plate"),
  boca: team(451, "Boca Juniors"),
  racing: team(456, "Racing Club"),
  independiente: team(462, "Independiente"),
  sanLorenzo: team(458, "San Lorenzo"),
  velez: team(459, "Vélez Sarsfield"),
  estudiantes: team(463, "Estudiantes LP"),
  talleres: team(434, "Talleres"),
  defensa: team(442, "Defensa y Justicia"),
  argentinos: team(448, "Argentinos Jrs"),
  lanus: team(446, "Lanús"),
  banfield: team(440, "Banfield"),
  colon: team(455, "Colón"),
  union: team(467, "Unión"),
  godoy: team(444, "Godoy Cruz"),
  newells: team(457, "Newell's"),
  central: team(460, "Rosario Central"),
  huracan: team(447, "Huracán"),
  flamengo: team(127, "Flamengo"),
  palmeiras: team(121, "Palmeiras"),
  gremio: team(130, "Grêmio"),
  atleticoMG: team(1062, "Atlético MG"),
  inter: team(119, "Internacional"),
  saopaulo: team(126, "São Paulo"),
  fluminense: team(124, "Fluminense"),
  botafogo: team(118, "Botafogo"),
  america: team(2283, "Club América"),
  monterrey: team(2284, "Monterrey"),
  tigres: team(2282, "Tigres UANL"),
  pumas: team(2286, "Pumas UNAM"),
  nacional: team(1132, "Nacional"),
  penarol: team(1131, "Peñarol"),
};

const now = new Date();
const currentHour = now.getHours();

export function getMockMatches(dateStr: string): Match[] {
  const today = new Date();
  const reqDate = new Date(dateStr + "T12:00:00");
  today.setHours(0, 0, 0, 0);
  reqDate.setHours(0, 0, 0, 0);
  const diffDays = Math.round((reqDate.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return getTodayMatches();
  if (diffDays === -1) return getYesterdayMatches();
  if (diffDays === 1) return getTomorrowMatches();
  return [];
}

function getTodayMatches(): Match[] {
  const matches: Match[] = [];

  // Already finished match earlier today
  const fin1 = todayAt(Math.max(currentHour - 4, 11), 0);
  matches.push({
    id: 1001,
    league: ARG_LEAGUE,
    homeTeam: TEAMS.sanLorenzo,
    awayTeam: TEAMS.velez,
    ...fin1,
    status: { short: "FT", long: "Match Finished", elapsed: 90 },
    score: { home: 2, away: 1 },
    channels: getChannelsForCountry("Argentina"),
  });

  // Currently live match
  const live1Time = todayAt(Math.max(currentHour - 1, 13), 30);
  const elapsedMin = Math.min(90, Math.max(1, (Date.now() / 1000 - live1Time.timestamp) / 60));
  matches.push({
    id: 1002,
    league: ARG_LEAGUE,
    homeTeam: TEAMS.river,
    awayTeam: TEAMS.boca,
    ...live1Time,
    status: {
      short: elapsedMin > 45 ? "2H" : "1H",
      long: elapsedMin > 45 ? "Second Half" : "First Half",
      elapsed: Math.floor(elapsedMin),
    },
    score: { home: 1, away: 0 },
    channels: getChannelsForCountry("Argentina"),
  });

  // Another live match
  const live2Time = todayAt(Math.max(currentHour, 14), 0);
  const elapsed2 = Math.min(90, Math.max(1, (Date.now() / 1000 - live2Time.timestamp) / 60));
  if (elapsed2 > 0 && elapsed2 < 91) {
    matches.push({
      id: 1003,
      league: ARG_LEAGUE,
      homeTeam: TEAMS.racing,
      awayTeam: TEAMS.independiente,
      ...live2Time,
      status: {
        short: elapsed2 > 45 ? "2H" : "1H",
        long: elapsed2 > 45 ? "Second Half" : "First Half",
        elapsed: Math.floor(elapsed2),
      },
      score: { home: 0, away: 0 },
      channels: getChannelsForCountry("Argentina"),
    });
  }

  // Upcoming matches today
  matches.push({
    id: 1004,
    league: ARG_LEAGUE,
    homeTeam: TEAMS.estudiantes,
    awayTeam: TEAMS.talleres,
    ...todayAt(Math.max(currentHour + 2, 19), 0),
    status: { short: "NS", long: "Not Started", elapsed: null },
    score: { home: null, away: null },
    channels: [],
    broadcastChannels: ["TyC Sports", "ESPN", "DSports"],
  });

  matches.push({
    id: 1005,
    league: ARG_LEAGUE,
    homeTeam: TEAMS.defensa,
    awayTeam: TEAMS.argentinos,
    ...todayAt(Math.max(currentHour + 3, 21), 30),
    status: { short: "NS", long: "Not Started", elapsed: null },
    score: { home: null, away: null },
    channels: [],
    broadcastChannels: ["TyC Sports", "TNT Sports"],
  });

  // Copa Libertadores
  matches.push({
    id: 1010,
    league: LIBERTADORES,
    homeTeam: TEAMS.river,
    awayTeam: TEAMS.flamengo,
    ...todayAt(Math.max(currentHour + 1, 19), 0),
    status: { short: "NS", long: "Not Started", elapsed: null },
    score: { home: null, away: null },
    channels: [],
    broadcastChannels: ["ESPN", "Fox Sports", "DSports"],
  });

  matches.push({
    id: 1011,
    league: LIBERTADORES,
    homeTeam: TEAMS.palmeiras,
    awayTeam: TEAMS.boca,
    ...todayAt(Math.max(currentHour + 2, 21), 30),
    status: { short: "NS", long: "Not Started", elapsed: null },
    score: { home: null, away: null },
    channels: [],
    broadcastChannels: ["ESPN", "Fox Sports", "ESPN Premium"],
  });

  // Brasileirão
  matches.push({
    id: 1020,
    league: BRASILEIRAO,
    homeTeam: TEAMS.fluminense,
    awayTeam: TEAMS.botafogo,
    ...todayAt(Math.max(currentHour + 1, 18), 0),
    status: { short: "NS", long: "Not Started", elapsed: null },
    score: { home: null, away: null },
    channels: [],
    broadcastChannels: ["SporTV", "Premiere", "Globo"],
  });

  matches.push({
    id: 1021,
    league: BRASILEIRAO,
    homeTeam: TEAMS.gremio,
    awayTeam: TEAMS.inter,
    ...todayAt(Math.max(currentHour + 2, 20), 0),
    status: { short: "NS", long: "Not Started", elapsed: null },
    score: { home: null, away: null },
    channels: [],
    broadcastChannels: ["SporTV", "Premiere"],
  });

  // Liga MX
  matches.push({
    id: 1030,
    league: LIGA_MX,
    homeTeam: TEAMS.america,
    awayTeam: TEAMS.monterrey,
    ...todayAt(Math.max(currentHour + 3, 22), 0),
    status: { short: "NS", long: "Not Started", elapsed: null },
    score: { home: null, away: null },
    channels: [],
    broadcastChannels: ["TUDN", "Sky Sports", "Fox Sports"],
  });

  return matches;
}

function getYesterdayMatches(): Match[] {
  return [
    {
      id: 2001,
      league: ARG_LEAGUE,
      homeTeam: TEAMS.lanus,
      awayTeam: TEAMS.banfield,
      ...yesterdayAt(17, 0),
      status: { short: "FT", long: "Match Finished", elapsed: 90 },
      score: { home: 3, away: 2 },
      channels: getChannelsForCountry("Argentina"),
    },
    {
      id: 2002,
      league: ARG_LEAGUE,
      homeTeam: TEAMS.colon,
      awayTeam: TEAMS.union,
      ...yesterdayAt(19, 30),
      status: { short: "FT", long: "Match Finished", elapsed: 90 },
      score: { home: 1, away: 1 },
      channels: getChannelsForCountry("Argentina"),
    },
    {
      id: 2003,
      league: ARG_LEAGUE,
      homeTeam: TEAMS.godoy,
      awayTeam: TEAMS.newells,
      ...yesterdayAt(21, 30),
      status: { short: "FT", long: "Match Finished", elapsed: 90 },
      score: { home: 0, away: 2 },
      channels: getChannelsForCountry("Argentina"),
    },
    {
      id: 2004,
      league: SUDAMERICANA,
      homeTeam: TEAMS.defensa,
      awayTeam: TEAMS.nacional,
      ...yesterdayAt(19, 0),
      status: { short: "FT", long: "Match Finished", elapsed: 90 },
      score: { home: 2, away: 0 },
      channels: getChannelsForCountry("Internacional"),
    },
    {
      id: 2005,
      league: SUDAMERICANA,
      homeTeam: TEAMS.penarol,
      awayTeam: TEAMS.lanus,
      ...yesterdayAt(21, 30),
      status: { short: "FT", long: "Match Finished", elapsed: 90 },
      score: { home: 1, away: 3 },
      channels: getChannelsForCountry("Internacional"),
    },
  ];
}

function getTomorrowMatches(): Match[] {
  return [
    {
      id: 3001,
      league: ARG_LEAGUE,
      homeTeam: TEAMS.central,
      awayTeam: TEAMS.huracan,
      ...tomorrowAt(15, 0),
      status: { short: "NS", long: "Not Started", elapsed: null },
      score: { home: null, away: null },
      channels: [],
      broadcastChannels: ["TyC Sports", "ESPN"],
    },
    {
      id: 3002,
      league: ARG_LEAGUE,
      homeTeam: TEAMS.talleres,
      awayTeam: TEAMS.racing,
      ...tomorrowAt(17, 30),
      status: { short: "NS", long: "Not Started", elapsed: null },
      score: { home: null, away: null },
      channels: [],
      broadcastChannels: ["TyC Sports", "TNT Sports"],
    },
    {
      id: 3003,
      league: ARG_LEAGUE,
      homeTeam: TEAMS.boca,
      awayTeam: TEAMS.estudiantes,
      ...tomorrowAt(20, 0),
      status: { short: "NS", long: "Not Started", elapsed: null },
      score: { home: null, away: null },
      channels: [],
      broadcastChannels: ["TyC Sports", "ESPN", "DSports"],
    },
    {
      id: 3004,
      league: LIBERTADORES,
      homeTeam: TEAMS.atleticoMG,
      awayTeam: TEAMS.racing,
      ...tomorrowAt(19, 0),
      status: { short: "NS", long: "Not Started", elapsed: null },
      score: { home: null, away: null },
      channels: [],
      broadcastChannels: ["ESPN", "Fox Sports"],
    },
    {
      id: 3005,
      league: BRASILEIRAO,
      homeTeam: TEAMS.saopaulo,
      awayTeam: TEAMS.flamengo,
      ...tomorrowAt(20, 0),
      status: { short: "NS", long: "Not Started", elapsed: null },
      score: { home: null, away: null },
      channels: [],
      broadcastChannels: ["SporTV", "Premiere", "Globo"],
    },
    {
      id: 3006,
      league: LIGA_MX,
      homeTeam: TEAMS.tigres,
      awayTeam: TEAMS.pumas,
      ...tomorrowAt(22, 0),
      status: { short: "NS", long: "Not Started", elapsed: null },
      score: { home: null, away: null },
      channels: [],
      broadcastChannels: ["TUDN", "Sky Sports"],
    },
  ];
}

export function getMockStandings(leagueId: number) {
  if (leagueId === 128) {
    return [
      { rank: 1, team: TEAMS.river, points: 38, played: 16, won: 12, drawn: 2, lost: 2, goalsFor: 31, goalsAgainst: 10, goalsDiff: 21 },
      { rank: 2, team: TEAMS.talleres, points: 33, played: 16, won: 10, drawn: 3, lost: 3, goalsFor: 25, goalsAgainst: 14, goalsDiff: 11 },
      { rank: 3, team: TEAMS.racing, points: 31, played: 16, won: 9, drawn: 4, lost: 3, goalsFor: 22, goalsAgainst: 12, goalsDiff: 10 },
      { rank: 4, team: TEAMS.boca, points: 29, played: 16, won: 8, drawn: 5, lost: 3, goalsFor: 20, goalsAgainst: 13, goalsDiff: 7 },
      { rank: 5, team: TEAMS.estudiantes, points: 27, played: 16, won: 8, drawn: 3, lost: 5, goalsFor: 19, goalsAgainst: 16, goalsDiff: 3 },
      { rank: 6, team: TEAMS.defensa, points: 26, played: 16, won: 7, drawn: 5, lost: 4, goalsFor: 18, goalsAgainst: 14, goalsDiff: 4 },
      { rank: 7, team: TEAMS.independiente, points: 24, played: 16, won: 7, drawn: 3, lost: 6, goalsFor: 21, goalsAgainst: 19, goalsDiff: 2 },
      { rank: 8, team: TEAMS.sanLorenzo, points: 23, played: 16, won: 6, drawn: 5, lost: 5, goalsFor: 17, goalsAgainst: 15, goalsDiff: 2 },
      { rank: 9, team: TEAMS.velez, points: 22, played: 16, won: 6, drawn: 4, lost: 6, goalsFor: 18, goalsAgainst: 18, goalsDiff: 0 },
      { rank: 10, team: TEAMS.argentinos, points: 21, played: 16, won: 6, drawn: 3, lost: 7, goalsFor: 16, goalsAgainst: 19, goalsDiff: -3 },
      { rank: 11, team: TEAMS.lanus, points: 20, played: 16, won: 5, drawn: 5, lost: 6, goalsFor: 15, goalsAgainst: 17, goalsDiff: -2 },
      { rank: 12, team: TEAMS.huracan, points: 19, played: 16, won: 5, drawn: 4, lost: 7, goalsFor: 14, goalsAgainst: 20, goalsDiff: -6 },
      { rank: 13, team: TEAMS.central, points: 17, played: 16, won: 4, drawn: 5, lost: 7, goalsFor: 13, goalsAgainst: 18, goalsDiff: -5 },
      { rank: 14, team: TEAMS.newells, points: 16, played: 16, won: 4, drawn: 4, lost: 8, goalsFor: 12, goalsAgainst: 22, goalsDiff: -10 },
      { rank: 15, team: TEAMS.godoy, points: 15, played: 16, won: 3, drawn: 6, lost: 7, goalsFor: 11, goalsAgainst: 18, goalsDiff: -7 },
      { rank: 16, team: TEAMS.banfield, points: 14, played: 16, won: 3, drawn: 5, lost: 8, goalsFor: 10, goalsAgainst: 20, goalsDiff: -10 },
      { rank: 17, team: TEAMS.colon, points: 13, played: 16, won: 3, drawn: 4, lost: 9, goalsFor: 12, goalsAgainst: 25, goalsDiff: -13 },
      { rank: 18, team: TEAMS.union, points: 11, played: 16, won: 2, drawn: 5, lost: 9, goalsFor: 9, goalsAgainst: 23, goalsDiff: -14 },
    ];
  }
  return [];
}
