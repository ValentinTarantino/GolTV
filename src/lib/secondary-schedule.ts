import { createHash } from "node:crypto";
import { getCache, setCache } from "./cache";
import { fixtureTeamPair } from "./fixture-identity";
import { matchPlLeague } from "./constants";
import type { SecondaryMatch } from "./secondary-source";
import type { MatchStatusShort } from "./types";

interface ScheduledFixture {
  homeTeam: string;
  awayTeam: string;
  dateISO: string;
  fixtureStatus: MatchStatusShort;
}

interface Scoreboard {
  events?: Array<{
    competitions?: Array<{
      date?: string;
      status?: { type?: { name?: string; state?: string; completed?: boolean } };
      competitors?: Array<{ homeAway?: string; team?: { displayName?: string } }>;
    }>;
  }>;
}

function parseSchedule(data: Scoreboard): ScheduledFixture[] {
  return (data.events ?? []).flatMap((event) => (event.competitions ?? []).flatMap((competition) => {
    const homeTeam = competition.competitors?.find((team) => team.homeAway === "home")?.team?.displayName;
    const awayTeam = competition.competitors?.find((team) => team.homeAway === "away")?.team?.displayName;
    const dateISO = competition.date;
    const status = competition.status?.type;
    if (!homeTeam || !awayTeam || !dateISO || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(dateISO)
      || !Number.isFinite(Date.parse(dateISO)) || !status?.state) return [];
    let fixtureStatus: MatchStatusShort;
    if (status.completed || status.state === "post") fixtureStatus = "FT";
    else if (/CANCEL|POSTPONE|SUSPEND|DELAY|ABANDON/i.test(status.name ?? "")) fixtureStatus = "PST";
    else if (status.state === "in") fixtureStatus = "LIVE";
    else if (status.state === "pre") fixtureStatus = "NS";
    else return [];
    return [{ homeTeam, awayTeam, dateISO, fixtureStatus }];
  }));
}

const inFlight = new Map<string, Promise<ScheduledFixture[]>>();

async function fetchSchedule(url: string): Promise<ScheduledFixture[]> {
  const key = "secondary:mls-schedule:v1:" + createHash("sha256").update(url).digest("hex");
  const cached = await getCache<ScheduledFixture[]>(key);
  if (cached) return cached;
  if (inFlight.has(key)) return inFlight.get(key)!;
  const request = (async () => {
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) return [];
      const fixtures = parseSchedule(await response.json());
      // Short cache: a final whistle must not remain live for five minutes.
      await setCache(key, fixtures, 60_000);
      return fixtures;
    } catch {
      return [];
    }
  })();
  inFlight.set(key, request);
  try { return await request; } finally { inFlight.delete(key); }
}

/** Confirm undated MLS channel listings against a separately dated schedule. */
export async function confirmSecondaryMlsDates(matches: SecondaryMatch[]): Promise<SecondaryMatch[]> {
  const isMls = (match: SecondaryMatch) => matchPlLeague(match.league, match.homeTeam, match.awayTeam)?.id === 332;
  if (!matches.some((match) => match.dateInferred && isMls(match))) return matches;
  let base: URL;
  try {
    base = new URL(process.env.SECONDARY_MLS_SCHEDULE_URL ?? "");
    if (base.protocol !== "https:" || base.username || base.password) return matches;
  } catch { return matches; }

  // The scoreboard groups by US date. Yesterday covers late US matches after
  // midnight in Argentina. Keep this independent of the server's timezone.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const day = Date.parse(today + "T12:00:00Z");
  const schedules = await Promise.all([-1, 0].map((offset) => {
    const url = new URL(base);
    url.searchParams.set("dates", new Date(day + offset * 86400_000).toISOString().slice(0, 10).replace(/-/g, ""));
    return fetchSchedule(url.href);
  }));
  const fixtures = schedules.flat().filter((fixture) => {
    const kickoff = Date.parse(fixture.dateISO);
    return kickoff >= day - 24 * 3600_000 && kickoff <= day + 36 * 3600_000;
  });
  return matches.map((match) => {
    if (!match.dateInferred || !isMls(match)) return match;
    const pair = fixtureTeamPair(match.homeTeam, match.awayTeam, 332);
    const candidates = fixtures.filter((fixture) => fixtureTeamPair(fixture.homeTeam, fixture.awayTeam, 332) === pair);
    const distinct = [...new Map(candidates.map((fixture) => [fixture.dateISO, fixture])).values()];
    if (distinct.length !== 1) return match;
    // Preserve channel locators while using the schedule's actual home/away order.
    return { ...match, ...distinct[0], dateInferred: false };
  });
}
