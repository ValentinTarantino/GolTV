import { NextRequest } from "next/server";
import { fetchAgenda } from "@/lib/agenda-source";
import { fetchSecondaryAgenda } from "@/lib/secondary-source";
import { fetchEventAgenda } from "@/lib/event-source";
import { matchPlLeague, getBroadcastChannels, LEAGUE_LOGOS, isItalianSerieATeam, isMenFootballMatch, SUPPORTED_LEAGUES } from "@/lib/constants";
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
  interdebogota: "internacionaldebogota",
  interbogotafc: "internacionaldebogota",
  alajuelense: "alajuelense",
  ldalajuelense: "alajuelense",
  ligadeportivaalajuelense: "alajuelense",
  perezzeledon: "perezzeledon",
  municipalperezzeledon: "perezzeledon",
  // Providers inconsistently include club abbreviations in display names.
  lebrijana: "lebrijana",
  ublebrijana: "lebrijana",
  cusco: "cusco",
  cuscofc: "cusco",
};

const LEAGUE_TEAM_DEDUP_ALIASES: Record<number, Record<string, string>> = {
  // Pelota Libre lists the same 2026 Copa del Rey tie as both
  // "Auriense - Deportivo La Coruña" and "Auriense Cented Academy - Deportivo".
  // Keep these aliases scoped to this competition because "Deportivo" is
  // ambiguous in other leagues.
  143: {
    auriense: "auriensecentedacademy",
    auriensecented: "auriensecentedacademy",
    auriensecentedacademy: "auriensecentedacademy",
    deportivo: "deportivolacoruna",
    deportivolacoruna: "deportivolacoruna",
    deportivodelacoruna: "deportivolacoruna",
    deportivodeacoruna: "deportivolacoruna",
  },
  239: { alianza: "alianzavalledupar", alianzafc: "alianzavalledupar" },
  281: { alianza: "alianzalima" },
};

const TEAM_NAME_DESIGNATORS = new Set([
  "ac", "ae", "afc", "ca", "cf", "cd", "club", "fc", "fk", "if", "sc", "sk", "ud", "ub",
]);

function canonicalTeamForDedup(team: string, leagueId: number): string {
  const key = normalize(team);
  const leagueAlias = LEAGUE_TEAM_DEDUP_ALIASES[leagueId]?.[key];
  const knownAlias = TEAM_DEDUP_ALIASES[key];
  if (leagueAlias || knownAlias) return leagueAlias ?? knownAlias!;

  // Remove legal club designators as tokens, whether the provider writes them
  // as "AE Prat", "A.E. Prat", or "Prat". Keep all identity-bearing tokens;
  // this avoids fuzzy substring collisions between different clubs.
  return team
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !TEAM_NAME_DESIGNATORS.has(token))
    .join("");
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
  kickoffTime: string;
  id: number;
}

const CROSS_DATE_DUPLICATE_WINDOW_MS = 8 * 60 * 60 * 1000;
const SAME_FIXTURE_NEXT_DAY_WINDOW_MS = 26 * 60 * 60 * 1000;

function isDuplicateFixture(
  seenMatches: Map<string, SeenFixture[]>,
  dateISO: string,
  leagueId: number,
  homeTeam: string,
  awayTeam: string,
  id: number
): boolean {
  const key = matchDedupKey(homeTeam, awayTeam, leagueId);
  const date = toArgentinaDate(dateISO);
  const kickoffTime = new Date(dateISO).toLocaleTimeString("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const timestamp = new Date(dateISO).getTime();
  const previous = seenMatches.get(key) ?? [];

  if (previous.some((fixture) => {
    const difference = Math.abs(fixture.timestamp - timestamp);
    return fixture.date === date
      || difference <= CROSS_DATE_DUPLICATE_WINDOW_MS
      // Providers can publish the same fixture on adjacent days with different
      // team spellings/slugs; their local kickoff time still identifies it.
      || (difference <= SAME_FIXTURE_NEXT_DAY_WINDOW_MS
        && (fixture.id === id || fixture.kickoffTime === kickoffTime));
  })) {
    return true;
  }

  previous.push({ date, timestamp, kickoffTime, id });
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
  // Guard the combined agenda too: a provider season suffix or an alternate
  // Liga Pro label must not leave a match between two Italian clubs in Ecuador.
  if (
    mappedLeague?.id === 57
    && (isItalianSerieATeam(homeTeam) || isItalianSerieATeam(awayTeam))
  ) {
    return SUPPORTED_LEAGUES.find((league) => league.id === 135) ?? null;
  }
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
  // Canonical pair and kickoff identity deduplicate provider copies; the primary source wins.
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

    const id = hashSlug(flMatch.slug);
    if (isDuplicateFixture(seenMatches, flMatch.dateISO, league.id, flMatch.homeTeam, flMatch.awayTeam, id)) continue;

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

    const id = hashSlug(secMatch.slug);
    if (isDuplicateFixture(seenMatches, secMatch.dateISO, league.id, secMatch.homeTeam, secMatch.awayTeam, id)) continue;

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

    const id = hashSlug(eventMatch.slug);
    if (isDuplicateFixture(seenMatches, eventMatch.dateISO, league.id, eventMatch.homeTeam, eventMatch.awayTeam, id)) continue;

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
