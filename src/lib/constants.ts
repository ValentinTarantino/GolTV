import type { LeagueConfig } from "./types";

export const SUPPORTED_LEAGUES: LeagueConfig[] = [
  { id: 128, name: "Liga Profesional", country: "Argentina", countryFlag: "🇦🇷", slug: "liga-argentina", season: 2026 },
  { id: 1032, name: "Copa de la Liga", country: "Argentina", countryFlag: "🇦🇷", slug: "copa-de-la-liga", season: 2026 },
  { id: 130, name: "Copa Argentina", country: "Argentina", countryFlag: "🇦🇷", slug: "copa-argentina", season: 2026 },
  { id: 13, name: "Copa Libertadores", country: "Internacional", countryFlag: "🌎", slug: "copa-libertadores", season: 2026 },
  { id: 11, name: "Copa Sudamericana", country: "Internacional", countryFlag: "🌎", slug: "copa-sudamericana", season: 2026 },
  { id: 2, name: "Champions League", country: "Europa", countryFlag: "🇪🇺", slug: "champions-league", season: 2026 },
  { id: 3, name: "Europa League", country: "Europa", countryFlag: "🇪🇺", slug: "europa-league", season: 2026 },
  { id: 140, name: "La Liga", country: "España", countryFlag: "🇪🇸", slug: "la-liga", season: 2026 },
  { id: 39, name: "Premier League", country: "Inglaterra", countryFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", slug: "premier-league", season: 2026 },
  { id: 71, name: "Brasileirão Serie A", country: "Brasil", countryFlag: "🇧🇷", slug: "brasileirao", season: 2026 },
  { id: 262, name: "Liga MX", country: "México", countryFlag: "🇲🇽", slug: "liga-mx", season: 2026 },
  { id: 239, name: "Liga BetPlay", country: "Colombia", countryFlag: "🇨🇴", slug: "liga-betplay", season: 2026 },
  { id: 265, name: "Primera División", country: "Chile", countryFlag: "🇨🇱", slug: "primera-chile", season: 2026 },
  { id: 268, name: "Primera División", country: "Uruguay", countryFlag: "🇺🇾", slug: "primera-uruguay", season: 2026 },
  { id: 367, name: "División de Honor", country: "Paraguay", countryFlag: "🇵🇾", slug: "division-paraguay", season: 2026 },
  { id: 281, name: "Liga 1", country: "Perú", countryFlag: "🇵🇪", slug: "liga1-peru", season: 2026 },
  { id: 242, name: "Liga Pro", country: "Ecuador", countryFlag: "🇪🇨", slug: "liga-pro-ecuador", season: 2026 },
  { id: 230, name: "Primera División", country: "Bolivia", countryFlag: "🇧🇴", slug: "primera-bolivia", season: 2026 },
  { id: 299, name: "Primera División", country: "Venezuela", countryFlag: "🇻🇪", slug: "primera-venezuela", season: 2026 },
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
  mexico: [
    { id: "tudn", name: "TUDN", url: "https://cdn.jwplayer.com/manifests/pZxWPRg4.m3u8" },
    { id: "sky", name: "Sky", url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8" },
    { id: "fox", name: "Fox Sports", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
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
  if (key.includes("brasil")) return CHANNEL_SETS.brasil;
  if (key.includes("mexico")) return CHANNEL_SETS.mexico;
  if (key.includes("españa") || key.includes("spain")) return CHANNEL_SETS.españa;
  if (key.includes("inglaterra") || key.includes("england")) return CHANNEL_SETS.inglaterra;
  if (key.includes("internacional") || key.includes("europa")) return CHANNEL_SETS.internacional;
  return CHANNEL_SETS.default;
}

export const BROADCAST_CHANNELS: Record<number, string[]> = {
  128: ["TyC Sports", "ESPN", "TNT Sports", "DSports"],
  1032: ["TyC Sports Play", "ESPN"],
  130: ["TyC Sports", "ESPN"],
  13: ["ESPN", "Fox Sports", "DSports", "ESPN Premium"],
  11: ["ESPN", "Fox Sports", "DSports"],
  2: ["HBO Max", "ESPN", "Fox Sports", "DSports", "Movistar Plus+"],
  3: ["HBO Max", "ESPN", "Fox Sports", "DSports"],
  140: ["Movistar Plus+", "DAZN", "ESPN"],
  39: ["Sky Sports", "TNT Sports", "Prime Video"],
  71: ["SporTV", "Premiere", "Globo"],
  262: ["TUDN", "Sky Sports", "Fox Sports"],
  239: ["Win Sports", "DSports"],
  265: ["ESPN", "Fox Sports"],
  268: ["DSports", "ESPN"],
  367: ["Tigo Sports", "ESPN"],
  281: ["Latina Televisión", "Movistar Deportes"],
  242: ["Star Ecuador", "ESPN"],
  230: ["Tigo Sports", "ESPN"],
  299: ["TVP", "ESPN"],
};

export function getBroadcastChannels(leagueId: number): string[] {
  return BROADCAST_CHANNELS[leagueId] || ["TyC Sports", "ESPN", "Fox Sports"];
}
