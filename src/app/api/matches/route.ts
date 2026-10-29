import { NextRequest } from "next/server";
import { fetchAgenda } from "@/lib/agenda-source";
import { fetchSecondaryAgenda } from "@/lib/secondary-source";
import { fetchEventAgenda } from "@/lib/event-source";
import { matchPlLeague, getBroadcastChannels, LEAGUE_LOGOS, isMenFootballMatch, SUPPORTED_LEAGUES } from "@/lib/constants";
import { getTeamLogo, peekTeamLogo } from "@/lib/team-logos";
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

const TEAM_DEDUP_ALIASES: Record<string, string> = {
  estudiantes: "estudiantesdelaplata",
  estudianteslp: "estudiantesdelaplata",
  estudiantesdelaplata: "estudiantesdelaplata",
  centralcordoba: "centralcordobasde",
  centralcordobasde: "centralcordobasde",
  centralcordobadesantiagodelestero: "centralcordobasde",
  celtadevigo2: "celtadevigoii",
  celtadevigoii: "celtadevigoii",
  celtavigoii: "celtadevigoii",
  realsociedadb: "realsociedadii",
  realsociedadii: "realsociedadii",
  nurnberg: "nurnberg",
  "1fcnurnberg": "nurnberg",
  wolfsburg: "wolfsburg",
  vflwolfsburg: "wolfsburg",
  inter: "intermilan",
  internazionale: "intermilan",
  intermilano: "intermilan",
  interdemilan: "intermilan",
  fcinternazionale: "intermilan",
  intermilan: "intermilan",
  lafc: "losangelesfc",
  losangelesfc: "losangelesfc",
  galaxy: "lagalaxy",
  lagalaxy: "lagalaxy",
  losangelesgalaxy: "lagalaxy",
  clubnacional: "nacional",
  clubnacionaldefootball: "nacional",
  nacionaldefootball: "nacional",
  liverpoolm: "liverpool",
  liverpoolmontevideo: "liverpool",
  independientemedellin: "independientemedellin",
  independientemedellinfc: "independientemedellin",
  dim: "independientemedellin",
  medellin: "independientemedellin",
  alianza: "alianzavalledupar",
  alianzavalledupar: "alianzavalledupar",
  alianzafc: "alianzavalledupar",
  interbogota: "internacionaldebogota",
  internacionalbogota: "internacionaldebogota",
  internacionaldebogota: "internacionaldebogota",
  alajuelense: "alajuelense",
  ldalajuelense: "alajuelense",
  ligadeportivaalajuelense: "alajuelense",
  perezzeledon: "perezzeledon",
  municipalperezzeledon: "perezzeledon",
};

const LEAGUE_TEAM_DEDUP_ALIASES: Record<number, Record<string, string>> = {
  239: { alianza: "alianzavalledupar", alianzafc: "alianzavalledupar" },
  281: { alianza: "alianzalima" },
};

function canonicalTeamForDedup(team: string, leagueId: number): string {
  const key = normalize(team);
  return LEAGUE_TEAM_DEDUP_ALIASES[leagueId]?.[key] ?? TEAM_DEDUP_ALIASES[key] ?? key;
}

function matchDedupKey(homeTeam: string, awayTeam: string, leagueId: number): string {
  const teams = [homeTeam, awayTeam]
    .map((team) => canonicalTeamForDedup(team, leagueId))
    .sort();
  // League is deliberately omitted: providers sometimes label the same fixture
  // with different competitions, while the canonical team pair is stable.
  return `${teams[0]}-${teams[1]}`;
}

interface SeenFixture {
  date: string;
  timestamp: number;
}

const CROSS_DATE_DUPLICATE_WINDOW_MS = 8 * 60 * 60 * 1000;

function isDuplicateFixture(
  seenMatches: Map<string, SeenFixture[]>,
  dateISO: string,
  leagueId: number,
  homeTeam: string,
  awayTeam: string
): boolean {
  const key = matchDedupKey(homeTeam, awayTeam, leagueId);
  const date = toArgentinaDate(dateISO);
  const timestamp = new Date(dateISO).getTime();
  const previous = seenMatches.get(key) ?? [];

  if (previous.some((fixture) =>
    fixture.date === date || Math.abs(fixture.timestamp - timestamp) <= CROSS_DATE_DUPLICATE_WINDOW_MS
  )) {
    return true;
  }

  previous.push({ date, timestamp });
  seenMatches.set(key, previous);
  return false;
}

const CHILEAN_CLUBS = [
  "audaxitaliano", "cobresal", "colocolo", "coquimbounido", "deportesconcepcion",
  "deportesiquique", "deporteslaserena", "deporteslimache", "huachipato",
  "nublense", "ohiggins", "palestino", "unionlacalera", "unionespanola",
  "universidadcatolica", "universidaddechile", "universidaddeconcepcion", "univconcepcion",
  "santiagowanderers",
];
const BOLIVIAN_CLUBS = [
  "abb", "alwaysready", "aurora", "blooming", "bolivar", "guabira", "gvsanjose",
  "independientepetrolero", "jorgewilstermann", "nacionalpotosi", "orientepetrolero",
  "realoruro", "realtomayapo", "royalpari", "sanantoniobulobulo", "thestrongest",
  "totorarealoruro", "universitariodevinto", "vacadiez", "wilstermann",
];

function classifyAgendaLeague(leagueName: string, homeTeam: string, awayTeam: string) {
  const mappedLeague = matchPlLeague(leagueName, homeTeam, awayTeam);
  if (mappedLeague?.id !== 268) return mappedLeague;

  const teamKeys = [normalize(homeTeam), normalize(awayTeam)];
  const isBolivianFixture = teamKeys.some((team) =>
    BOLIVIAN_CLUBS.some((club) => team === club || team.startsWith(club))
  );
  if (isBolivianFixture) return null;

  const isChileanFixture = teamKeys.some((team) =>
    CHILEAN_CLUBS.some((club) => team === club || team.startsWith(club))
  );
  if (isChileanFixture) {
    return SUPPORTED_LEAGUES.find((league) => league.id === 265) ?? null;
  }

  return mappedLeague;
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
  const [flAgenda, secondaryAgenda, eventAgenda] = await Promise.all([
    fetchAgenda(),
    fetchSecondaryAgenda(),
    fetchEventAgenda(),
  ]);

  const date = requestedDate || getArgentinaToday();
  const filteredAgenda = flAgenda.filter(
    (m) => toArgentinaDate(m.dateISO) === date || isNearNow(m.dateISO)
  );

  const seenMatches = new Map<string, SeenFixture[]>();
  // Providers sometimes list the same fixture on different days (one agenda has
  // it live now, another lists it +24h as upcoming), which a date-window dedup
  // misses. For the same fixture the match id (a hash of the team-pair slug) is
  // identical across providers, so also dedup on team-pair + id — ignoring the
  // date. Distinct fixtures that happen to share a slug stay separate because
  // their canonical team pair differs. The first (primary agenda, which carries
  // the live streams) wins.
  const seenIds = new Set<string>();
  const idDedupToken = (homeTeam: string, awayTeam: string, leagueId: number, id: number) =>
    `${matchDedupKey(homeTeam, awayTeam, leagueId)}#${id}`;
  const matches: Match[] = [];

  for (const flMatch of filteredAgenda) {
    if (!isMenFootballMatch(flMatch.league, flMatch.homeTeam, flMatch.awayTeam)) continue;

    const league = classifyAgendaLeague(flMatch.league, flMatch.homeTeam, flMatch.awayTeam);
    if (!league) continue;
    if (flMatch.embeds.length === 0) continue;

    const status = inferStatus(flMatch.dateISO);
    // Finished matches only clutter the fixture and confuse the live list.
    // Checked before the dedup registrations so a stale (finished) listing
    // can't block a valid rescheduled entry of the same fixture.
    if (status === "FT") continue;

    if (isDuplicateFixture(seenMatches, flMatch.dateISO, league.id, flMatch.homeTeam, flMatch.awayTeam)) continue;

    const id = hashSlug(flMatch.slug);
    const token = idDedupToken(flMatch.homeTeam, flMatch.awayTeam, league.id, id);
    if (seenIds.has(token)) continue;
    seenIds.add(token);

    matches.push({
      id,
      league: {
        id: league.id,
        name: league.name,
        country: league.country,
        logo: LEAGUE_LOGOS[league.id] || `https://media.api-sports.io/football/leagues/${league.id}.png`,
        flag: league.countryFlag,
        slug: league.slug,
      },
      homeTeam: { id: 0, name: flMatch.homeTeam, logo: "" },
      awayTeam: { id: 0, name: flMatch.awayTeam, logo: "" },
      date: flMatch.dateISO,
      timestamp: Math.floor(new Date(flMatch.dateISO).getTime() / 1000),
      status: {
        short: status,
        long: status === "NS" ? "Próximamente" : "En Juego",
        elapsed: null,
      },
      score: { home: null, away: null },
      channels: [],
      broadcastChannels: getBroadcastChannels(league.id),
      _eventSlug: flMatch.slug,
      _eventSources: flMatch.embeds.map((e) => ({ id: e.id, name: e.name, embedIframe: e.embedIframe })),
    });
  }

  // Secondary fixture: only contributes matches the primary fixture is missing.
  for (const secMatch of secondaryAgenda) {
    if (!isMenFootballMatch(secMatch.league, secMatch.homeTeam, secMatch.awayTeam)) continue;

    if (secMatch.sources.length === 0) continue;
    if (!(toArgentinaDate(secMatch.dateISO) === date || isNearNow(secMatch.dateISO))) continue;

    const league = classifyAgendaLeague(secMatch.league, secMatch.homeTeam, secMatch.awayTeam);
    if (!league) continue;

    const status = inferStatus(secMatch.dateISO);
    // Finished matches only clutter the fixture and confuse the live list.
    // Checked before the dedup registrations so a stale (finished) listing
    // can't block a valid rescheduled entry of the same fixture.
    if (status === "FT") continue;

    if (isDuplicateFixture(seenMatches, secMatch.dateISO, league.id, secMatch.homeTeam, secMatch.awayTeam)) continue;

    const id = hashSlug(secMatch.slug);
    const token = idDedupToken(secMatch.homeTeam, secMatch.awayTeam, league.id, id);
    if (seenIds.has(token)) continue;
    seenIds.add(token);

    matches.push({
      id,
      league: {
        id: league.id,
        name: league.name,
        country: league.country,
        logo: LEAGUE_LOGOS[league.id] || `https://media.api-sports.io/football/leagues/${league.id}.png`,
        flag: league.countryFlag,
        slug: league.slug,
      },
      homeTeam: { id: 0, name: secMatch.homeTeam, logo: "" },
      awayTeam: { id: 0, name: secMatch.awayTeam, logo: "" },
      date: secMatch.dateISO,
      timestamp: Math.floor(new Date(secMatch.dateISO).getTime() / 1000),
      status: {
        short: status,
        long: status === "NS" ? "Próximamente" : "En Juego",
        elapsed: null,
      },
      score: { home: null, away: null },
      channels: [],
      broadcastChannels: getBroadcastChannels(league.id),
      _eventSlug: secMatch.slug,
    });
  }

  // Pelota Libre's event agenda is a third fixture provider. It supplies its
  // own streams through player 2, and only fills matches absent from the other
  // agendas.
  for (const eventMatch of eventAgenda) {
    if (!isMenFootballMatch(eventMatch.league, eventMatch.homeTeam, eventMatch.awayTeam)) continue;
    if (eventMatch.sources.length === 0) continue;
    if (!(toArgentinaDate(eventMatch.dateISO) === date || isNearNow(eventMatch.dateISO))) continue;

    const league = classifyAgendaLeague(eventMatch.league, eventMatch.homeTeam, eventMatch.awayTeam);
    if (!league) continue;

    const status = inferStatus(eventMatch.dateISO);
    // Finished matches only clutter the fixture and confuse the live list.
    // Checked before the dedup registrations so a stale (finished) listing
    // can't block a valid rescheduled entry of the same fixture.
    if (status === "FT") continue;

    if (isDuplicateFixture(seenMatches, eventMatch.dateISO, league.id, eventMatch.homeTeam, eventMatch.awayTeam)) continue;

    const id = hashSlug(eventMatch.slug);
    const token = idDedupToken(eventMatch.homeTeam, eventMatch.awayTeam, league.id, id);
    if (seenIds.has(token)) continue;
    seenIds.add(token);

    matches.push({
      id,
      league: {
        id: league.id,
        name: league.name,
        country: league.country,
        logo: LEAGUE_LOGOS[league.id] || `https://media.api-sports.io/football/leagues/${league.id}.png`,
        flag: league.countryFlag,
        slug: league.slug,
      },
      homeTeam: { id: 0, name: eventMatch.homeTeam, logo: "" },
      awayTeam: { id: 0, name: eventMatch.awayTeam, logo: "" },
      date: eventMatch.dateISO,
      timestamp: Math.floor(new Date(eventMatch.dateISO).getTime() / 1000),
      status: {
        short: status,
        long: status === "NS" ? "Próximamente" : "En Juego",
        elapsed: null,
      },
      score: { home: null, away: null },
      channels: [],
      broadcastChannels: getBroadcastChannels(league.id),
      _eventSlug: eventMatch.slug,
    });
  }

  matches.sort((a, b) => a.timestamp - b.timestamp);

  const teamNames = new Set<string>();
  const teamCountries = new Map<string, string>();
  for (const m of matches) {
    teamNames.add(m.homeTeam.name);
    teamNames.add(m.awayTeam.name);
    teamCountries.set(m.homeTeam.name, m.league.country);
    teamCountries.set(m.awayTeam.name, m.league.country);
  }

  const logoMap = new Map<string, string>();
  const lookupPromises: Promise<void>[] = [];

  for (const name of teamNames) {
    const country = teamCountries.get(name);
    const peeked = peekTeamLogo(name, country);
    if (peeked !== null) {
      logoMap.set(name, peeked);
    } else {
      logoMap.set(name, "");
      lookupPromises.push(
        getTeamLogo(name, country)
          .then((logo) => {
            logoMap.set(name, logo);
          })
          .catch(() => {})
      );
    }
  }

  if (lookupPromises.length > 0) {
    await Promise.race([
      Promise.allSettled(lookupPromises),
      // Give the first fixture load enough time for uncached badge lookups;
      // otherwise cards render permanently without logos after the race ends.
      new Promise((resolve) => setTimeout(resolve, 10000)),
    ]);
  }

  for (const m of matches) {
    m.homeTeam.logo = logoMap.get(m.homeTeam.name) ?? "";
    m.awayTeam.logo = logoMap.get(m.awayTeam.name) ?? "";
  }

  return Response.json({ matches, date });
}
