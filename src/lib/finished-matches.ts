import { getCache } from "./cache";
import type { Match } from "./types";

/**
 * Recently finished football fixtures. `/api/matches` keeps FT cards listed
 * for a grace window — celebrations keep streaming after the whistle — and
 * this store lets stream resolution (`findAgendaFixtureById`) still find
 * the fixture context after providers drop it from their agendas.
 */
export const FINISHED_STORE_KEY = "matches:finished-recent:v1";
export const FINISHED_GRACE_MS = 3 * 60 * 60 * 1000;

export interface FinishedStoreEntry {
  match: Match;
  finishedAt: number;
}

/** Fixture context of a recently finished match, for stream resolution. */
export async function findFinishedMatchContext(
  id: number
): Promise<{ homeTeam: string; awayTeam: string; leagueName: string; dateISO: string } | null> {
  const store = await getCache<Record<string, FinishedStoreEntry>>(FINISHED_STORE_KEY);
  const entry = store?.[String(id)];
  if (!entry || Date.now() - entry.finishedAt > FINISHED_GRACE_MS) return null;
  const m = entry.match;
  return {
    homeTeam: m.homeTeam.name,
    awayTeam: m.awayTeam.name,
    leagueName: m.league.name,
    dateISO: m.date,
  };
}

/** The stored match itself, for callers that need its status/score. */
export async function findFinishedMatch(id: number): Promise<Match | null> {
  const store = await getCache<Record<string, FinishedStoreEntry>>(FINISHED_STORE_KEY);
  const entry = store?.[String(id)];
  if (!entry || Date.now() - entry.finishedAt > FINISHED_GRACE_MS) return null;
  return entry.match;
}
