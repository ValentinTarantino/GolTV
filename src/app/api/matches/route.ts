import { fixtureTeamPair } from "@/lib/fixture-identity";
import { cleanAgendaText } from "@/lib/agenda-text";
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

interface SeenFixture {
  date: string;
  timestamp: number;
  kickoffTime: string;
  id: number;
  index: number;
}

const CROSS_DATE_DUPLICATE_WINDOW_MS = 8 * 60 * 60 * 1000;
const SAME_FIXTURE_NEXT_DAY_WINDOW_MS = 26 * 60 * 60 * 1000;

function findDuplicateFixture(
  seenMatches: Map<string, SeenFixture[]>,
  dateISO: string,
  leagueId: number,
  homeTeam: string,
  awayTeam: string,
  id: number,
  index: number
): number | undefined {
  const key = fixtureTeamPair(homeTeam, awayTeam, leagueId);
  const date = toArgentinaDate(dateISO);
  const kickoffTime = new Date(dateISO).toLocaleTimeString("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const timestamp = new Date(dateISO).getTime();
  const previous = seenMatches.get(key) ?? [];

  const duplicate = previous.find((fixture) => {
    const difference = Math.abs(fixture.timestamp - timestamp);
    return fixture.date === date
      || difference <= CROSS_DATE_DUPLICATE_WINDOW_MS
      // Providers can publish the same fixture on adjacent days with different
      // team spellings/slugs; their local kickoff time still identifies it.
      || (difference <= SAME_FIXTURE_NEXT_DAY_WINDOW_MS
        && (fixture.id === id || fixture.kickoffTime === kickoffTime));
  });
  if (duplicate) return duplicate.index;

  previous.push({ date, timestamp, kickoffTime, id, index });
  seenMatches.set(key, previous);
  return undefined;
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
  // Agendas have no final whistle status. Allow extra time/penalties, but
  // don't advertise a kickoff as live for four hours.
  if (!Number.isFinite(diffMin) || diffMin <= -180) return "FT";
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
  // Every source enters the same normalization and identity pipeline. Source
  // slugs remain playback locators, never the identity of a football fixture.
  const agenda = [
    ...flAgenda.map((entry) => ({ ...entry, dateInferred: false, hasStreams: entry.embeds.length > 0 })),
    ...secondaryAgenda.map((entry) => ({ ...entry, embeds: undefined, hasStreams: entry.sources.length > 0 })),
    ...eventAgenda.map((entry) => ({ ...entry, embeds: undefined, dateInferred: false, hasStreams: entry.sources.length > 0 })),
  ];
  const seenMatches = new Map<string, SeenFixture[]>();
  const matches: Match[] = [];

  for (const raw of agenda) {
    if (raw.dateInferred || !raw.hasStreams) continue;
    const entry = {
      ...raw,
      homeTeam: cleanAgendaText(raw.homeTeam),
      awayTeam: cleanAgendaText(raw.awayTeam),
      league: cleanAgendaText(raw.league),
    };
    if (!isMenFootballMatch(entry.league, entry.homeTeam, entry.awayTeam)) continue;
    if (!(toArgentinaDate(entry.dateISO) === date || isNearNow(entry.dateISO))) continue;
    const league = classifyAgendaLeague(entry.league, entry.homeTeam, entry.awayTeam);
    if (!league) continue;
    const status = inferStatus(entry.dateISO);
    // Expired records cannot claim the identity of a rescheduled fixture.
    if (status === "FT") continue;

    const id = hashSlug(entry.slug);
    const duplicateIndex = findDuplicateFixture(seenMatches, entry.dateISO, league.id, entry.homeTeam, entry.awayTeam, id, matches.length);
    if (duplicateIndex !== undefined) {
      // Multiple primary records can carry different channels for one game.
      // Keep them on the winning fixture instead of discarding their signals.
      const existing = matches[duplicateIndex];
      if (entry.embeds) {
        const sources = existing._eventSources ?? [];
        const urls = new Set(sources.map((source) => source.embedIframe));
        for (const source of entry.embeds) {
          if (!urls.has(source.embedIframe)) {
            sources.push(source);
            urls.add(source.embedIframe);
          }
        }
        existing._eventSources = sources;
      }
      continue;
    }

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
      homeTeam: { id: 0, name: entry.homeTeam, logo: "" },
      awayTeam: { id: 0, name: entry.awayTeam, logo: "" },
      date: entry.dateISO,
      timestamp: Math.floor(new Date(entry.dateISO).getTime() / 1000),
      status: {
        short: status,
        long: status === "NS" ? "Próximamente" : "En Juego",
        elapsed: null,
      },
      score: { home: null, away: null },
      channels: [],
      broadcastChannels: getBroadcastChannels(league.id),
      _eventSlug: entry.slug,
      ...(entry.embeds ? { _eventSources: [...entry.embeds] } : {}),
    });
  }

  matches.sort((a, b) => a.timestamp - b.timestamp);

  const badgeKey = (name: string, country: string) => JSON.stringify([country, name]);
  const teams = new Map<string, { name: string; country: string }>();
  for (const match of matches) {
    for (const team of [match.homeTeam, match.awayTeam]) {
      teams.set(badgeKey(team.name, match.league.country), { name: team.name, country: match.league.country });
    }
  }

  const logoMap = new Map<string, string>();
  const lookupPromises: Promise<void>[] = [];

  for (const [key, { name, country }] of teams) {
    const peeked = peekTeamLogo(name, country);
    if (peeked !== null) {
      logoMap.set(key, peeked);
    } else {
      logoMap.set(key, "");
      lookupPromises.push(
        getTeamLogo(name, country)
          .then((logo) => {
            logoMap.set(key, logo);
          })
          .catch(() => {})
      );
    }
  }

  if (lookupPromises.length > 0) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled(lookupPromises),
        // Known clubs resolve synchronously (local catalog + static maps).
        // Bound waits for uncatalogued clubs so a slow SportsDB search never
        // delays the fixture list: the lookups keep running after the
        // response, land in the in-memory cache, and crests backfill on the
        // home page's 30s poll (peekTeamLogo reads that cache).
        new Promise((resolve) => { timeout = setTimeout(resolve, 3000); }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  for (const m of matches) {
    m.homeTeam.logo = logoMap.get(badgeKey(m.homeTeam.name, m.league.country)) ?? "";
    m.awayTeam.logo = logoMap.get(badgeKey(m.awayTeam.name, m.league.country)) ?? "";
  }

  return Response.json({ matches, date }, { headers: { "Cache-Control": "no-store" } });
}
