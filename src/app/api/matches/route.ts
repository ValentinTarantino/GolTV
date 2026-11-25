import { canonicalTeamForDedup, fixtureTeamPair, isPlaceholderTeam } from "@/lib/fixture-identity";
import { cleanAgendaText, cleanAgendaTeamName } from "@/lib/agenda-text";
import { NextRequest } from "next/server";
import { fetchAgenda } from "@/lib/agenda-source";
import { fetchSecondaryAgenda } from "@/lib/secondary-source";
import { fetchEventAgenda } from "@/lib/event-source";
import { fetchPlayerFiveAgenda } from "@/lib/player-five-source";
import { getBroadcastChannels, LEAGUE_LOGOS, isMenFootballMatch, SUPPORTED_LEAGUES, hasParaguayanClub, FINISHED_STATUSES } from "@/lib/constants";
import { getTeamLogo, peekTeamLogo } from "@/lib/team-logos";
import { leagueRanks, loadLeagueOrder } from "@/lib/league-order";
import { espnSlugsForLeague, espnSlugsForLeagues, findEspnEvent, loadEspnScoreboards } from "@/lib/espn-scores";
import { findSportplusScoreEvent, listSportplusScores, type SportplusScoreEvent } from "@/lib/lpf-matches";
import { getCache, setCache } from "@/lib/cache";
import { openImageToken, proxyImageUrl } from "@/lib/public-url";
import { prefetchImage } from "@/lib/image-cache";
import { matchTeamsPair } from "@/lib/team-matching";
import { classifyAgendaLeague, hashSlug } from "@/lib/agenda-fixture";
import { isIPBanned } from "@/lib/chat";
import { touchRequestPresence } from "@/lib/presence";
import { BANNED_HEADER } from "@/lib/viewer-id";
import { settleImagePopulates } from "@/lib/r2-segments";
import type { Match } from "@/lib/types";
import { validateQuery, matchesQuerySchema } from "@/lib/validators";

function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;
  const cfIP = request.headers.get("cf-connecting-ip");
  if (cfIP) return cfIP;
  return "unknown";
}

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

/**
 * Hard ceiling per agenda source. Internal timeouts can stack (primary fetch
 * plus sequential DNS fallbacks), so the route bounds each source itself:
 * past the cap the source contributes nothing to this response, while the
 * underlying fetch keeps running and still fills its cache.
 */
function withAgendaTimeout<T extends unknown[]>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve([] as unknown as T), 15_000);
    }),
  ]).finally(() => clearTimeout(timer));
}

const badgeKey = (name: string, country: string) => JSON.stringify([country, name]);

/**
 * Resolves every fixture crest. Started early so the wait overlaps score
 * enrichment; the 3s cap counts from call time. Known clubs resolve
 * synchronously (local catalog + static maps). Uncatalogued clubs keep
 * resolving after the cap, land in the in-memory cache, and crests backfill
 * on the home page's poll (peekTeamLogo reads that cache).
 */
function resolveTeamLogos(matches: Match[]): Promise<Map<string, string>> {
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
            // Prefetch the image into the shared cache so it loads instantly
            // when the client requests it via /api/img. Fire-and-forget.
            if (logo) prefetchImage(logo);
          })
          .catch(() => {})
      );
    }
  }

  if (lookupPromises.length === 0) return Promise.resolve(logoMap);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    Promise.allSettled(lookupPromises).then(() => logoMap),
    new Promise<Map<string, string>>((resolve) => {
      timeout = setTimeout(() => resolve(logoMap), 3000);
    }),
  ]).finally(() => clearTimeout(timeout));
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

interface SeenFixture {
  date: string;
  argentinaDate: string;
  timestamp: number;
  kickoffTime: string;
  id: number;
  index: number;
}

const CROSS_DATE_DUPLICATE_WINDOW_MS = 12 * 60 * 60 * 1000; // Increased to 12 hours
const SAME_FIXTURE_NEXT_DAY_WINDOW_MS = 36 * 60 * 60 * 1000; // Increased to 36 hours

/**
 * Index of the fixtures already accepted, per competition and kickoff minute.
 * Some providers cannot match a fixture on the team pair:
 *  - they publish it before the bracket resolves ("Nashville SC vs TBD"),
 *  - or they cut the club name ("Girona vs Eiba" next to "Girona vs Eibar").
 * Both are only ever merged with a record that shares the competition, the
 * exact kickoff minute and the other club, so two real fixtures cannot collide.
 */
interface KickoffFixture {
  index: number;
  homeKey: string;
  awayKey: string;
  /** True when one side of this record is a placeholder ("TBD"). */
  open: boolean;
}

function kickoffKey(leagueId: number, dateISO: string): string {
  return `${leagueId}|${new Date(dateISO).toISOString().slice(0, 16)}`;
}

/** True when one club name is a cut-off version of the other (min 4 chars). */
function isTruncatedClub(left: string, right: string): boolean {
  if (!left || !right || left === right) return false;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  if (short.length < 4) return false;
  if (long.startsWith(short)) return true;
  // Providers also drop the leading designator ("Deportes Concepción" ->
  // "Concepción"): the short form is then a suffix, not a prefix. The higher
  // minimum length keeps short generic tails ("nacional", "racing") safe.
  return short.length >= 5 && long.endsWith(short);
}

/**
 * When two records of the same fixture disagree on a club name, keep the one
 * the visitor can actually read: a resolved name over "TBD", and the full name
 * over a provider's cut-off version ("Eibar" over "Eiba").
 */
function preferCompleteName(current: string, candidate: string, leagueId: number): string {
  if (!candidate || isPlaceholderTeam(candidate)) return current;
  if (isPlaceholderTeam(current)) return candidate;
  if (candidate.length <= current.length) return current;
  const currentKey = canonicalTeamForDedup(current, leagueId);
  const candidateKey = canonicalTeamForDedup(candidate, leagueId);
  return isTruncatedClub(currentKey, candidateKey) ? candidate : current;
}

function findDuplicateFixture(
  seenMatches: Map<string, SeenFixture[]>,
  kickoffFixtures: Map<string, KickoffFixture[]>,
  dateISO: string,
  leagueId: number,
  homeTeam: string,
  awayTeam: string,
  id: number,
  index: number
): number | undefined {
  const key = fixtureTeamPair(homeTeam, awayTeam, leagueId);
  // Use UTC date instead of Argentina date to avoid timezone issues
  const date = new Date(dateISO).toISOString().slice(0, 10);
  const argentinaDate = toArgentinaDate(dateISO);
  const kickoffTime = new Date(dateISO).toLocaleTimeString("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const timestamp = new Date(dateISO).getTime();
  const previous = seenMatches.get(key) ?? [];

const duplicate = previous.find((fixture) => {
    const difference = Math.abs(fixture.timestamp - timestamp);
    // More aggressive duplicate detection:
    // 1. Same UTC date
    // 2. Within 12 hours (cross-day matches)
    // 3. Within 36 hours with same kickoff time (same fixture reported on adjacent days)
    return fixture.date === date
      || fixture.argentinaDate === argentinaDate
      || difference <= CROSS_DATE_DUPLICATE_WINDOW_MS
      || (difference <= SAME_FIXTURE_NEXT_DAY_WINDOW_MS
        && (fixture.id === id || fixture.kickoffTime === kickoffTime));
  });
  if (duplicate) return duplicate.index;

  const homeKey = canonicalTeamForDedup(homeTeam, leagueId);
  const awayKey = canonicalTeamForDedup(awayTeam, leagueId);
  const homeOpen = isPlaceholderTeam(homeTeam);
  const awayOpen = isPlaceholderTeam(awayTeam);
  const openFixture = homeOpen || awayOpen;
  const sameMinute = kickoffFixtures.get(kickoffKey(leagueId, dateISO)) ?? [];

  for (const candidate of sameMinute) {
    // Same known club on one side; the other side is either unresolved in one
    // of the two records, or cut short by a provider.
    const homeMatched = !homeOpen && homeKey === candidate.homeKey;
    const awayMatched = !awayOpen && awayKey === candidate.awayKey;
    if (openFixture && (homeMatched || awayMatched)) return candidate.index;
    if (homeMatched && isTruncatedClub(awayKey, candidate.awayKey)) return candidate.index;
    if (awayMatched && isTruncatedClub(homeKey, candidate.homeKey)) return candidate.index;
  }

  previous.push({ date, argentinaDate, timestamp, kickoffTime, id, index });
  seenMatches.set(key, previous);
  const list = kickoffFixtures.get(kickoffKey(leagueId, dateISO)) ?? [];
  list.push({ index, homeKey, awayKey, open: openFixture });
  kickoffFixtures.set(kickoffKey(leagueId, dateISO), list);
  return undefined;
}

function inferStatus(dateISO: string): "NS" | "1H" | "FT" {
  const diffMin = (new Date(dateISO).getTime() - Date.now()) / 60000;
  if (diffMin > 10) return "NS";
  // Agendas have no final whistle status. Allow extra time/penalties, but
  // don't advertise a kickoff as live for four hours.
  if (!Number.isFinite(diffMin) || diffMin <= -140) return "FT";
  return "1H";
}

export async function GET(request: NextRequest) {
  const clientIP = getClientIP(request);
  if (await isIPBanned(clientIP)) {
    return Response.json(
      { error: "Access denied" },
      { status: 403, headers: { [BANNED_HEADER]: "1" } }
    );
  }
  touchRequestPresence(request);

  const validation = await validateQuery(request, matchesQuerySchema);
  if ("error" in validation) return validation.error;

  const requestedDate = validation.data.date;
  // Every upstream call starts together: a slow or dead provider must not
  // serialize the whole fixture behind it. Agenda sources keep their own
  // caches, so a timed-out fetch still warms them for the next poll.
  const sportplusScoresPromise = listSportplusScores().catch(() => [] as SportplusScoreEvent[]);
  const leagueOrderPromise = loadLeagueOrder().catch(() => [] as number[]);
  const [flAgenda, secondaryAgenda, eventAgenda, playerFiveAgenda] = await Promise.all([
    withAgendaTimeout(fetchAgenda()),
    withAgendaTimeout(fetchSecondaryAgenda()),
    withAgendaTimeout(fetchEventAgenda()),
    withAgendaTimeout(fetchPlayerFiveAgenda()),
  ]);

  const date = requestedDate || getArgentinaToday();
  // Every source enters the same normalization and identity pipeline. Source
  // slugs remain playback locators, never the identity of a football fixture.
  const agenda = [
    ...flAgenda.map((entry) => ({ ...entry, dateInferred: false, fixtureStatus: undefined, hasStreams: entry.embeds.length > 0 })),
    ...secondaryAgenda.map((entry) => ({ ...entry, embeds: undefined, hasStreams: entry.sources.length > 0 })),
    ...eventAgenda.map((entry) => ({ ...entry, embeds: undefined, dateInferred: false, fixtureStatus: undefined, hasStreams: entry.sources.length > 0 })),
    ...playerFiveAgenda.map((entry) => ({ ...entry, embeds: undefined, dateInferred: false, fixtureStatus: undefined, preferredPlayer: "5" as const })),
  ];
  const seenMatches = new Map<string, SeenFixture[]>();
  const kickoffFixtures = new Map<string, KickoffFixture[]>();
  const matches: Match[] = [];

  for (const raw of agenda) {
    // Undated records enrich player lookups only; they must never invent a
    // kickoff. A *dated* fixture without published signals is still a fixture:
    // providers publish channels minutes before kickoff (some list the game with
    // none at all), and hiding its card until an embed exists makes a live match
    // vanish from the list. Listings with no signal far from kickoff stay out.
    if (raw.dateInferred) continue;
    if (!raw.hasStreams && !isNearNow(raw.dateISO)) continue;
    const entry = {
      ...raw,
      homeTeam: cleanAgendaTeamName(raw.homeTeam, raw.league),
      awayTeam: cleanAgendaTeamName(raw.awayTeam, raw.league),
      league: cleanAgendaText(raw.league),
    };
    if (!isMenFootballMatch(entry.league, entry.homeTeam, entry.awayTeam)) continue;
    if (!(toArgentinaDate(entry.dateISO) === date || isNearNow(entry.dateISO))) continue;
    let league = "preferredPlayer" in entry
      ? SUPPORTED_LEAGUES.find(league => league.id === 129)
      : classifyAgendaLeague(entry.league, entry.homeTeam, entry.awayTeam);
    // Sources sometimes label Paraguayan fixtures as Primera Nacional — they
    // belong to the Paraguayan league (255), never the Argentine second tier.
    if (league?.id === 129 && hasParaguayanClub(entry.homeTeam, entry.awayTeam)) {
      league = SUPPORTED_LEAGUES.find((l) => l.id === 255) ?? league;
    }
    if (!league) continue;
    // Primera Nacional (Argentina) always opens on Reproductor 6 (mode "5",
    // the label visitors see); the selector stays available for anyone who
    // wants another source.
    const preferredPlayer =
      league.id === 129 ? ("5" as const) : "preferredPlayer" in entry ? entry.preferredPlayer : undefined;
    const status = entry.fixtureStatus ?? inferStatus(entry.dateISO);
    // Finished fixtures are results, not listings: once a match is over it
    // leaves the agenda so users never click a dead player. Postponed and
    // cancelled entries are dropped the same way.
    if (FINISHED_STATUSES.includes(status) || status === "PST" || status === "CANC") continue;

    const id = hashSlug(entry.slug);
    const duplicateIndex = findDuplicateFixture(seenMatches, kickoffFixtures, entry.dateISO, league.id, entry.homeTeam, entry.awayTeam, id, matches.length);
    if (duplicateIndex !== undefined) {
      // Multiple primary records can carry different channels for one game.
      // Keep them on the winning fixture instead of discarding their signals.
      const existing = matches[duplicateIndex];
      // Same fixture under two provider spellings: keep the readable club name.
      existing.homeTeam.name = preferCompleteName(existing.homeTeam.name, entry.homeTeam, league.id);
      existing.awayTeam.name = preferCompleteName(existing.awayTeam.name, entry.awayTeam, league.id);
      // A verified final whistle wins over another agenda's clock-based guess,
      // without replacing the primary fixture's identity or stream sources.
      if (entry.fixtureStatus && Math.abs(existing.timestamp * 1000 - Date.parse(entry.dateISO)) <= 60 * 60_000) {
        existing.status = {
          short: status,
          long: status === "FT" ? "Finalizado" : status === "NS" ? "Próximamente" : "En Juego",
          elapsed: null,
        };
      }
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
        logo: proxyImageUrl(LEAGUE_LOGOS[league.id] || `https://media.api-sports.io/football/leagues/${league.id}.png`),
        flag: league.countryFlag,
        slug: league.slug,
      },
      homeTeam: { id: 0, name: entry.homeTeam, logo: "" },
      awayTeam: { id: 0, name: entry.awayTeam, logo: "" },
      date: entry.dateISO,
      timestamp: Math.floor(new Date(entry.dateISO).getTime() / 1000),
      status: {
        short: status,
        long: status === "FT" ? "Finalizado" : status === "NS" ? "Próximamente" : "En Juego",
        elapsed: null,
      },
      score: { home: null, away: null },
      channels: [],
      broadcastChannels: getBroadcastChannels(league.id),
      _eventSlug: entry.slug,
      ...(preferredPlayer ? { _preferredPlayer: preferredPlayer } : {}),
      ...(entry.embeds ? { _eventSources: [...entry.embeds] } : {}),
    });
  }

  // Crest lookups start now so they overlap the ESPN/Sportplus enrichment
  // below instead of adding their own serial wait at the end. The 3s cap
  // counts from this point: anything slower still lands in the logo cache
  // for the next poll.
  const logoWork = resolveTeamLogos(matches);

  // The admin's category order wins; inside a category, kickoff time. The
  // client groups by first appearance, so this is the section order everyone
  // sees. Unranked competitions keep their natural kickoff order.
  const rankOf = leagueRanks(await leagueOrderPromise);
  matches.sort((a, b) => rankOf(a.league.id) - rankOf(b.league.id) || a.timestamp - b.timestamp);

  // Live score enrichment from ESPN's public scoreboard (no API key). One
  // request per league slug per ~45s; a miss or failure keeps agenda data.
  // Sources label Segunda División fixtures as "La Liga", so whenever a 140
  // match exists we also pull esp.2: a hit there reclassifies the fixture.
  const leagueIds = new Set(matches.map((m) => m.league.id));
  const espnSlugs = espnSlugsForLeagues(leagueIds);
  if (leagueIds.has(140) && !espnSlugs.includes("esp.2")) espnSlugs.push("esp.2");
  const reclassifiedFixtures = new Set<Match>();
  if (espnSlugs.length > 0) {
    const boards = await loadEspnScoreboards(espnSlugs);
    const segunda = SUPPORTED_LEAGUES.find((l) => l.id === 141);
    for (const m of matches) {
      const events = espnSlugsForLeague(m.league.id).flatMap((slug) => boards.get(slug) ?? []);
      let event = findEspnEvent(events, m.homeTeam.name, m.awayTeam.name, m.date);
      // Segunda fixture mislabeled as La Liga: ESPN only has it under esp.2.
      if (!event && m.league.id === 140) {
        const segundaEvents = boards.get("esp.2") ?? [];
        const segundaEvent = findEspnEvent(segundaEvents, m.homeTeam.name, m.awayTeam.name, m.date);
        if (segundaEvent && segunda) {
          m.league = {
            id: segunda.id,
            name: segunda.name,
            country: segunda.country,
            logo: proxyImageUrl(LEAGUE_LOGOS[segunda.id] || `https://media.api-sports.io/football/leagues/${segunda.id}.png`),
            flag: segunda.countryFlag,
            slug: segunda.slug,
          };
          reclassifiedFixtures.add(m);
          event = segundaEvent;
        }
      }
      if (!event) continue;
      m.score = { home: event.homeScore, away: event.awayScore };
      if (event.statusShort === "FT") {
        m.status = { short: "FT", long: "Finalizado", elapsed: null };
      } else if (["1H", "HT", "2H", "ET"].includes(event.statusShort)) {
        m.status = { short: event.statusShort as Match["status"]["short"], long: "En Juego", elapsed: event.elapsed };
      } else if (event.statusShort === "NS" && m.status.short !== "FT") {
        // Kickoff info from ESPN is authoritative for "not started" too.
        m.status = { ...m.status, elapsed: null };
      }
    }
  }

  // ESPN reclassification can merge two fixtures that were distinct leagues
  // during the first dedup pass (a "La Liga"-labeled Segunda match next to a
  // properly labeled one). Only fixtures ESPN just moved are re-checked —
  // the fuzzy team matcher is too loose for a global second dedup pass.
  if (espnSlugs.length > 0) {
    const argentinaDay = (iso: string) =>
      new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const richness = (m: Match) =>
      (m.score.home != null || m.score.away != null ? 2 : 0) +
      (m.status.short !== "NS" ? 1 : 0);
    const drop = new Set<number>();
    matches.forEach((m, i) => {
      if (!reclassifiedFixtures.has(m)) return;
      for (let j = 0; j < matches.length; j++) {
        if (j === i || drop.has(j)) continue;
        const other = matches[j];
        if (other.league.id !== m.league.id || argentinaDay(other.date) !== argentinaDay(m.date)) continue;
        if (!matchTeamsPair(m.homeTeam.name, m.awayTeam.name, other.homeTeam.name, other.awayTeam.name)) continue;
        if (richness(other) > richness(m)) {
          drop.add(i);
          return;
        }
        drop.add(j);
      }
    });
    for (let i = matches.length - 1; i >= 0; i--) {
      if (drop.has(i)) matches.splice(i, 1);
    }
  }

  // Sportplus's global board covers competitions ESPN misses (e.g. Chilean
  // Primera B). One request returns every live match; only fixtures still
  // missing a score after ESPN enrichment are looked up. The board drops a
  // match once its broadcast ends, so the last score seen is remembered per
  // fixture: a vanished live match past its ~140min window reads as FT.
  if (matches.some((m) => m.score.home == null && m.score.away == null)) {
    const sportplusEvents = await sportplusScoresPromise;
    const memoryWrites: Promise<void>[] = [];
    for (const m of matches) {
      if (m.score.home != null || m.score.away != null) continue;
      const memoryKey = `sp:last:${toArgentinaDate(m.date)}|${normalize(m.homeTeam.name)}|${normalize(m.awayTeam.name)}`;
      const boardEvent = findSportplusScoreEvent(sportplusEvents, m.homeTeam.name, m.awayTeam.name, m.date);
      const event = boardEvent ?? (await getCache<SportplusScoreEvent>(memoryKey));
      if (!event) continue;

      let statusShort = event.statusShort;
      if (!boardEvent && statusShort !== "FT") {
        // Off the board while the match should already be over → final.
        const startTs = new Date(event.date.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")).getTime();
        if (!Number.isNaN(startTs) && Date.now() - startTs > 140 * 60_000) statusShort = "FT";
      }

      m.score = { home: event.homeScore, away: event.awayScore };
      if (statusShort === "FT") {
        m.status = { short: "FT", long: "Finalizado", elapsed: null };
      } else {
        m.status = { short: statusShort as Match["status"]["short"], long: "En Juego", elapsed: event.elapsed };
      }
      if (boardEvent) {
        memoryWrites.push(setCache(memoryKey, event, 3 * 60 * 60 * 1000));
      }
    }
    await Promise.allSettled(memoryWrites);
  }

  // Enrichment can flip a fixture to a finished state after it passed the
  // entry filter (ESPN final whistle, Sportplus board drop). Finished games
  // leave the listing entirely — they are results, not watchable fixtures.
  for (let i = matches.length - 1; i >= 0; i--) {
    if (FINISHED_STATUSES.includes(matches[i].status.short)) matches.splice(i, 1);
  }

  const logoMap = await logoWork;
  for (const m of matches) {
    m.homeTeam.logo = proxyImageUrl(logoMap.get(badgeKey(m.homeTeam.name, m.league.country)) ?? "");
    m.awayTeam.logo = proxyImageUrl(logoMap.get(badgeKey(m.awayTeam.name, m.league.country)) ?? "");
  }

  // Warm every sealed badge (league + team crests) into the shared image
  // cache before responding, so the browser's /api/img requests — fired the
  // moment the cards render — are served from memory instead of waiting on
  // the upstream CDN. Dedupe by upstream URL; fire-and-forget.
  const warmed = new Set<string>();
  for (const m of matches) {
    for (const logo of [m.league.logo, m.homeTeam.logo, m.awayTeam.logo]) {
      if (!logo?.startsWith("/api/img?t=")) continue;
      const target = openImageToken(logo.slice("/api/img?t=".length));
      if (target && !warmed.has(target)) {
        warmed.add(target);
        prefetchImage(target);
      }
    }
  }

  // proxyImageUrl emits R2 badge URLs and fires their populates; hold the
  // response until those objects exist so the browser never 404s on a badge
  // that the edge then caches as missing. Scoped to images so live-match
  // segment uploads never slow this route down. Bounded internally.
  await settleImagePopulates();

  return Response.json({ matches, date }, { 
    headers: { 
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
      "Expires": "0"
    } 
  });
}
