const SPORTSDB_KEY = "3";
const SPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json";

interface SportsDBTeam {
  strTeam: string;
  strBadge: string;
}

interface SportsDBResponse {
  teams: SportsDBTeam[] | null;
}

const logoCache = new Map<string, string>();
const pendingLookups = new Map<string, Promise<string>>();

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function findBestMatch(teams: SportsDBTeam[], query: string): SportsDBTeam | null {
  const nq = normalize(query);
  if (!nq) return null;

  for (const team of teams) {
    if (normalize(team.strTeam) === nq) return team;
  }
  for (const team of teams) {
    const nt = normalize(team.strTeam);
    if (nt.includes(nq) || nq.includes(nt)) return team;
  }
  for (const team of teams) {
    const nt = normalize(team.strTeam);
    const minLen = Math.min(nt.length, nq.length);
    const threshold = Math.max(6, Math.floor(minLen * 0.6));
    if (nt.slice(0, threshold) === nq.slice(0, threshold)) return team;
  }
  for (const team of teams) {
    const words = normalize(team.strTeam).split(/\s+/);
    if (words.some((w) => w.length > 3 && nq.includes(w))) return team;
  }
  return null;
}

export async function getTeamLogo(teamName: string): Promise<string> {
  const key = normalize(teamName);
  if (!key) return "";

  const cached = logoCache.get(key);
  if (cached !== undefined) return cached;

  const pending = pendingLookups.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const url = `${SPORTSDB_BASE}/${SPORTSDB_KEY}/searchteams.php?t=${encodeURIComponent(teamName)}`;
      const res = await fetch(url, { next: { revalidate: 86400 } });
      if (!res.ok) {
        logoCache.set(key, "");
        return "";
      }
      const data: SportsDBResponse = await res.json();
      if (!data.teams || data.teams.length === 0) {
        logoCache.set(key, "");
        return "";
      }
      const match = findBestMatch(data.teams, teamName);
      const badge = match?.strBadge ?? "";
      logoCache.set(key, badge);
      return badge;
    } catch {
      logoCache.set(key, "");
      return "";
    } finally {
      pendingLookups.delete(key);
    }
  })();

  pendingLookups.set(key, promise);
  return promise;
}
