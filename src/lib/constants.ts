import type { LeagueConfig } from "./types";

export const LEAGUE_LOGOS: Record<number, string> = {
  128: "https://media.api-sports.io/football/leagues/128.png",
  1032: "https://media.api-sports.io/football/leagues/1032.png",
  130: "https://media.api-sports.io/football/leagues/130.png",
  265: "https://media.api-sports.io/football/leagues/265.png",
  267: "https://media.api-sports.io/football/leagues/267.png",
  71: "https://media.api-sports.io/football/leagues/71.png",
  73: "https://media.api-sports.io/football/leagues/73.png",
  281: "https://media.api-sports.io/football/leagues/281.png",
  503: "https://media.api-sports.io/football/leagues/503.png",
  501: "https://media.api-sports.io/football/leagues/501.png",
  268: "https://media.api-sports.io/football/leagues/268.png",
  930: "https://media.api-sports.io/football/leagues/930.png",
  13: "https://media.api-sports.io/football/leagues/13.png",
  11: "https://media.api-sports.io/football/leagues/11.png",
  2: "https://media.api-sports.io/football/leagues/2.png",
  3: "https://media.api-sports.io/football/leagues/3.png",
  140: "https://media.api-sports.io/football/leagues/140.png",
  39: "https://media.api-sports.io/football/leagues/39.png",
  78: "https://media.api-sports.io/football/leagues/78.png",
  79: "https://media.api-sports.io/football/leagues/79.png",
  80: "https://media.api-sports.io/football/leagues/80.png",
  332: "https://media.api-sports.io/football/leagues/332.png",
  235: "https://media.api-sports.io/football/leagues/235.png",
  5: "https://media.api-sports.io/football/leagues/5.png",
  431: "https://media.api-sports.io/football/leagues/431.png",
};

export function getLeagueLogo(leagueId: number): string {
  return LEAGUE_LOGOS[leagueId] || "";
}

export function getLeagueIdByName(name: string): number {
  const league = SUPPORTED_LEAGUES.find(
    (l) => l.name.toLowerCase() === name.toLowerCase()
  );
  return league?.id ?? 0;
}

/**
 * Agenda acotada: primeras + copas de AR/CL/BR/PE/PY/UY,
 * Libertadores/Sudamericana, y top Europa (Champions, Europa, La Liga, Premier).
 */
export const SUPPORTED_LEAGUES: LeagueConfig[] = [
  // Argentina
  { id: 128, name: "Liga Profesional", country: "Argentina", countryFlag: "🇦🇷", slug: "liga-argentina", season: 2026 },
  { id: 1032, name: "Copa de la Liga", country: "Argentina", countryFlag: "🇦🇷", slug: "copa-de-la-liga", season: 2026 },
  { id: 130, name: "Copa Argentina", country: "Argentina", countryFlag: "🇦🇷", slug: "copa-argentina", season: 2026 },
  // Chile
  { id: 265, name: "Liga de Primera", country: "Chile", countryFlag: "🇨🇱", slug: "liga-de-primera-chile", season: 2026 },
  { id: 267, name: "Copa Chile", country: "Chile", countryFlag: "🇨🇱", slug: "copa-chile", season: 2026 },
  // Brasil
  { id: 71, name: "Brasileirão Serie A", country: "Brasil", countryFlag: "🇧🇷", slug: "brasileirao", season: 2026 },
  { id: 73, name: "Copa do Brasil", country: "Brasil", countryFlag: "🇧🇷", slug: "copa-do-brasil", season: 2026 },
  // Perú
  { id: 281, name: "Liga 1", country: "Perú", countryFlag: "🇵🇪", slug: "liga1-peru", season: 2026 },
  { id: 503, name: "Copa Perú", country: "Perú", countryFlag: "🇵🇪", slug: "copa-peru", season: 2026 },
  // Paraguay
  { id: 501, name: "Copa Paraguay", country: "Paraguay", countryFlag: "🇵🇾", slug: "copa-paraguay", season: 2026 },
  // Uruguay
  { id: 268, name: "Liga AUF Uruguaya", country: "Uruguay", countryFlag: "🇺🇾", slug: "liga-auf-uruguaya", season: 2026 },
  { id: 930, name: "Copa Uruguay", country: "Uruguay", countryFlag: "🇺🇾", slug: "copa-uruguay", season: 2026 },
  // CONMEBOL
  { id: 13, name: "Copa Libertadores", country: "Internacional", countryFlag: "🌎", slug: "copa-libertadores", season: 2026 },
  { id: 11, name: "Copa Sudamericana", country: "Internacional", countryFlag: "🌎", slug: "copa-sudamericana", season: 2026 },
  // Europa
  { id: 2, name: "Champions League", country: "Europa", countryFlag: "🇪🇺", slug: "champions-league", season: 2026 },
  { id: 3, name: "Europa League", country: "Europa", countryFlag: "🇪🇺", slug: "europa-league", season: 2026 },
  { id: 140, name: "La Liga", country: "España", countryFlag: "🇪🇸", slug: "la-liga", season: 2026 },
  { id: 39, name: "Premier League", country: "Inglaterra", countryFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", slug: "premier-league", season: 2026 },
  { id: 78, name: "Bundesliga", country: "Alemania", countryFlag: "🇩🇪", slug: "bundesliga", season: 2026 },
  { id: 79, name: "2. Bundesliga", country: "Alemania", countryFlag: "🇩🇪", slug: "2-bundesliga", season: 2026 },
  { id: 80, name: "3. Liga", country: "Alemania", countryFlag: "🇩🇪", slug: "3-liga", season: 2026 },
  // USA / Mexico / CONCACAF
  { id: 332, name: "MLS", country: "Estados Unidos", countryFlag: "🇺🇸", slug: "mls", season: 2026 },
  { id: 235, name: "Liga MX", country: "Mexico", countryFlag: "🇲🇽", slug: "liga-mx", season: 2026 },
  { id: 5, name: "CONCACAF Champions Cup", country: "Internacional", countryFlag: "🌎", slug: "concacaf-champions-cup", season: 2026 },
  { id: 431, name: "Leagues Cup", country: "Internacional", countryFlag: "🌎", slug: "leagues-cup", season: 2026 },
];

export const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

export const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"];
export const FINISHED_STATUSES = ["FT", "AET", "PEN", "AWD", "WO"];
export const UPCOMING_STATUSES = ["NS", "TBD"];
export const CANCELLED_STATUSES = ["SUSP", "PST", "CANC", "ABD"];

export const DEMO_STREAMS: { id: string; name: string; url: string }[] = [
  { id: "ch1", name: "Canal 1", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  { id: "ch2", name: "Canal 2", url: "https://cdn.jwplayer.com/manifests/pZxWPRg4.m3u8" },
  { id: "ch3", name: "Canal 3", url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8" },
];

export const CHANNEL_SETS: Record<string, { id: string; name: string; url: string }[]> = {
  argentina: [
    { id: "tyc", name: "TyC Sports", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
    { id: "espn", name: "ESPN", url: "https://cdn.jwplayer.com/manifests/pZxWPRg4.m3u8" },
    { id: "dsports", name: "DSports", url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8" },
    { id: "tnt", name: "TNT Sports", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  ],
  brasil: [
    { id: "sporv", name: "SporTV", url: "https://cdn.jwplayer.com/manifests/pZxWPRg4.m3u8" },
    { id: "globo", name: "Globo", url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8" },
    { id: "premier", name: "Premiere", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  ],
  chile: [
    { id: "espn_cl", name: "ESPN", url: "https://cdn.jwplayer.com/manifests/pZxWPRg4.m3u8" },
    { id: "tnt_cl", name: "TNT Sports", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  ],
  peru: [
    { id: "movistar_pe", name: "Movistar Deportes", url: "https://cdn.jwplayer.com/manifests/pZxWPRg4.m3u8" },
    { id: "latina", name: "Latina", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  ],
  paraguay: [
    { id: "tigo_py", name: "Tigo Sports", url: "https://cdn.jwplayer.com/manifests/pZxWPRg4.m3u8" },
    { id: "espn_py", name: "ESPN", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  ],
  uruguay: [
    { id: "dsports_uy", name: "DSports", url: "https://cdn.jwplayer.com/manifests/pZxWPRg4.m3u8" },
    { id: "espn_uy", name: "ESPN", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  ],
  españa: [
    { id: "movistar", name: "Movistar Plus+", url: "https://cdn.jwplayer.com/manifests/pZxWPRg4.m3u8" },
    { id: "dazn_es", name: "DAZN", url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8" },
    { id: "espn_es", name: "ESPN", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  ],
  inglaterra: [
    { id: "sky_sports", name: "Sky Sports", url: "https://cdn.jwplayer.com/manifests/pZxWPRg4.m3u8" },
    { id: "tnt_sports", name: "TNT Sports", url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8" },
    { id: "prime", name: "Prime Video", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  ],
  internacional: [
    { id: "espn2", name: "ESPN 2", url: "https://cdn.jwplayer.com/manifests/pZxWPRg4.m3u8" },
    { id: "fox2", name: "Fox Sports 2", url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8" },
    { id: "dazn", name: "DAZN", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  ],
  default: [
    { id: "ch1", name: "Canal 1", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
    { id: "ch2", name: "Canal 2", url: "https://cdn.jwplayer.com/manifests/pZxWPRg4.m3u8" },
    { id: "ch3", name: "Canal 3", url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8" },
  ],
};

export function getChannelsForCountry(country: string): { id: string; name: string; url: string }[] {
  const key = country.toLowerCase();
  if (key.includes("argentina")) return CHANNEL_SETS.argentina;
  if (key.includes("brasil") || key.includes("brazil")) return CHANNEL_SETS.brasil;
  if (key.includes("chile")) return CHANNEL_SETS.chile;
  if (key.includes("perú") || key.includes("peru")) return CHANNEL_SETS.peru;
  if (key.includes("paraguay")) return CHANNEL_SETS.paraguay;
  if (key.includes("uruguay")) return CHANNEL_SETS.uruguay;
  if (key.includes("españa") || key.includes("spain")) return CHANNEL_SETS.españa;
  if (key.includes("inglaterra") || key.includes("england")) return CHANNEL_SETS.inglaterra;
  if (key.includes("estados unidos") || key.includes("united states") || key.includes("usa")) return CHANNEL_SETS.internacional;
  if (key.includes("mexico") || key.includes("méxico")) return CHANNEL_SETS.internacional;
  if (key.includes("internacional") || key.includes("europa")) return CHANNEL_SETS.internacional;
  return CHANNEL_SETS.default;
}

export const BROADCAST_CHANNELS: Record<number, string[]> = {
  128: ["TyC Sports", "ESPN", "TNT Sports", "DSports"],
  1032: ["TyC Sports Play", "ESPN"],
  130: ["TyC Sports", "ESPN"],
  265: ["ESPN", "TNT Sports", "CDF"],
  267: ["ESPN", "TNT Sports"],
  71: ["SporTV", "Premiere", "Globo"],
  73: ["SporTV", "Globo", "Premiere"],
  281: ["Latina Televisión", "Movistar Deportes"],
  503: ["Latina Televisión", "Movistar Deportes"],
  501: ["Tigo Sports", "ESPN"],
  268: ["DSports", "ESPN"],
  930: ["DSports", "ESPN"],
  13: ["ESPN", "Fox Sports", "DSports", "ESPN Premium"],
  11: ["ESPN", "Fox Sports", "DSports"],
  2: ["HBO Max", "ESPN", "Fox Sports", "DSports", "Movistar Plus+"],
  3: ["HBO Max", "ESPN", "Fox Sports", "DSports"],
  140: ["Movistar Plus+", "DAZN", "ESPN"],
  39: ["Sky Sports", "TNT Sports", "Prime Video"],
  332: ["Apple TV", "Fox Sports", "ESPN"],
  235: ["Fox Sports", "ESPN", "TUDN", "ViX"],
  5: ["Fox Sports", "TUDN", "ViX"],
  431: ["Apple TV", "Fox Sports", "TUDN"],
};

export function getBroadcastChannels(leagueId: number): string[] {
  return BROADCAST_CHANNELS[leagueId] || ["TyC Sports", "ESPN", "Fox Sports"];
}

/* ─── Pelota Libre league name → SUPPORTED_LEAGUES mapping ─── */

const PL_LEAGUE_MAP: Record<string, number> = {
  "liga profesional": 128,
  "liga profesional argentina": 128,
  "copa de la liga": 1032,
  "copa de la liga profesional": 1032,
  "copa argentina": 130,
  "liga de primera": 265,
  "liga de primera chile": 265,
  "copa chile": 267,
  "brasileirão serie a": 71,
  "brasileirao serie a": 71,
  "brasileirão": 71,
  "copa do brasil": 73,
  "liga 1": 281,
  "liga 1 peru": 281,
  "liga 1 peruana": 281,
  "liga peruana": 281,
  "copa perú": 503,
  "copa peru": 503,
  "copa paraguay": 501,
  "liga auf uruguaya": 268,
  "liga uruguaya": 268,
  "copa uruguay": 930,
  "copa libertadores": 13,
  "copa conmebol libertadores": 13,
  "libertadores": 13,
  "copa sudamericana": 11,
  "copa conmebol sudamericana": 11,
  "sudamericana": 11,
  "champions league": 2,
  "uefa champions league": 2,
  "europa league": 3,
  "uefa europa league": 3,
  "la liga": 140,
  "laliga": 140,
  "laliga ea sports": 140,
  "premier league": 39,
  "premier": 39,
  "bundesliga": 78,
  "2. bundesliga": 79,
  "2 bundesliga": 79,
  "3. liga": 80,
  "3 liga": 80,
  "mls": 332,
  "major league soccer": 332,
  "major league": 332,
  "liga mx": 235,
  "concacaf champions cup": 5,
  "concacaf": 5,
  "leagues cup": 431,
};

const PL_EXCLUDED_LEAGUES = [
  "serie a",
  "serie b",
  "ekstraklasa",
  "eredivisie",
  "super lig",
  "ligue 1",
  "primeira liga",
  "liga pro",
  "liga de ecuador",
  "liga ecuatoriana",
  "liga mx femenil",
  "liga de expansión mx",
  "liga de expansion mx",
  "división profesional",
  "division profesional",
];

export function matchPlLeague(plLeagueName: string): LeagueConfig | null {
  const normalized = plLeagueName.toLowerCase().trim();

  for (const excluded of PL_EXCLUDED_LEAGUES) {
    if (normalized === excluded) return null;
  }

  const leagueId = PL_LEAGUE_MAP[normalized];
  if (leagueId) {
    return SUPPORTED_LEAGUES.find((l) => l.id === leagueId) ?? null;
  }
  for (const [key, id] of Object.entries(PL_LEAGUE_MAP)) {
    if (key.length > 3 && (normalized.includes(key) || key.includes(normalized))) {
      return SUPPORTED_LEAGUES.find((l) => l.id === id) ?? null;
    }
  }
  return null;
}
