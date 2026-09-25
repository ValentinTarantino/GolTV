import { PROMIEDOS_ALIASES } from "./constants";

const TEAM_STOPWORDS = new Set([
  "fc", "cf", "sc", "ac", "afc", "cfc", "club", "de", "la", "el", "los", "las",
  "the", "united", "city", "real", "sporting", "deportivo", "cd", "ud", "ca",
  "sa", "as", "ss", "fk", "sk", "bk", "if", "vs",
]);

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").trim();
}

function significantTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length > 2 && !TEAM_STOPWORDS.has(t));
}

/**
 * Core team matching logic used by all stream providers.
 * Returns true if teams are considered the same match.
 */
export function teamsMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // Check with aliases (e.g., "river" -> "riverplate")
  const aliasA = PROMIEDOS_ALIASES[na];
  const aliasB = PROMIEDOS_ALIASES[nb];
  if (aliasA && aliasA === nb) return true;
  if (aliasB && aliasB === na) return true;
  if (aliasA && aliasB && aliasA === aliasB) return true;

  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length >= 5 && longer.includes(shorter)) return true;

  const tokensA = significantTokens(a);
  const tokensB = significantTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  let hits = 0;
  for (const ta of tokensA) {
    for (const tb of tokensB) {
      if (ta === tb) {
        hits++;
        break;
      }
      if (ta.length >= 5 && tb.length >= 5 && (ta.includes(tb) || tb.includes(ta))) {
        hits++;
        break;
      }
    }
  }

  const needed = Math.min(tokensA.length, tokensB.length) >= 2 ? 2 : 1;
  return hits >= needed;
}

/**
 * Match a pair of teams (home/away) allowing for swapped sides.
 */
export function matchTeamsPair(
  homeA: string,
  awayA: string,
  homeB: string,
  awayB: string
): boolean {
  return (
    (teamsMatch(homeA, homeB) && teamsMatch(awayA, awayB)) ||
    (teamsMatch(homeA, awayB) && teamsMatch(awayA, homeB))
  );
}