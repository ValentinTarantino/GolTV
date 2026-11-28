import { fetchAgenda } from "./agenda-source";
import { fetchSecondaryAgenda } from "./secondary-source";
import { fetchEventAgenda } from "./event-source";
import { fetchPlayerFiveAgenda } from "./player-five-source";
import { cleanAgendaTeamName, cleanAgendaText } from "./agenda-text";
import { matchPlLeague, isItalianSerieATeam, SUPPORTED_LEAGUES } from "./constants";
import { findFinishedMatchContext } from "./finished-matches";

export function hashSlug(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
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

export function classifyAgendaLeague(leagueName: string, homeTeam: string, awayTeam: string) {
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

export interface AgendaFixtureContext {
  homeTeam: string;
  awayTeam: string;
  leagueName: string;
  dateISO: string;
}

interface AgendaEntry {
  slug: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  dateISO: string;
}

/**
 * Agenda fixtures are not API-Football records: their public id is
 * hashSlug(entry.slug). Watch links no longer carry the fixture context, so
 * the match route rebuilds it here from the same cached agendas the fixture
 * list used. Returns null when the id matches no current agenda entry.
 */
export async function findAgendaFixtureById(id: number): Promise<AgendaFixtureContext | null> {
  const agendaOrEmpty = async <T>(fetcher: () => Promise<T[]>): Promise<T[]> => {
    try {
      return (await fetcher()) ?? [];
    } catch {
      return [];
    }
  };
  const [flAgenda, secondaryAgenda, eventAgenda, playerFiveAgenda] = await Promise.all([
    agendaOrEmpty(fetchAgenda),
    agendaOrEmpty(fetchSecondaryAgenda),
    agendaOrEmpty(fetchEventAgenda),
    agendaOrEmpty(fetchPlayerFiveAgenda),
  ]);

  const classified: AgendaEntry[] = [
    ...flAgenda,
    ...secondaryAgenda,
    ...eventAgenda,
  ];
  for (const raw of classified) {
    if (hashSlug(raw.slug) !== id) continue;
    const league = cleanAgendaText(raw.league);
    const homeTeam = cleanAgendaTeamName(raw.homeTeam, raw.league);
    const awayTeam = cleanAgendaTeamName(raw.awayTeam, raw.league);
    const classifiedLeague = classifyAgendaLeague(league, homeTeam, awayTeam);
    if (!classifiedLeague) continue;
    return { homeTeam, awayTeam, leagueName: classifiedLeague.name, dateISO: raw.dateISO };
  }

  for (const raw of playerFiveAgenda) {
    if (hashSlug(raw.slug) !== id) continue;
    const league = SUPPORTED_LEAGUES.find((l) => l.id === 129);
    if (!league) continue;
    return {
      homeTeam: cleanAgendaTeamName(raw.homeTeam, raw.league),
      awayTeam: cleanAgendaTeamName(raw.awayTeam, raw.league),
      leagueName: league.name,
      dateISO: raw.dateISO,
    };
  }

  // Finished fixtures the providers already dropped still resolve through
  // the recent-finished store, so celebrations remain watchable.
  return findFinishedMatchContext(id);
}
