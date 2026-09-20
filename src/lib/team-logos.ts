import { PROMIEDOS_BADGES, PROMIEDOS_ALIASES } from "./constants";

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
    if (nt.includes(nq) && nt.length - nq.length <= 6) return team;
    if (nq.includes(nt) && nq.length - nt.length <= 6) return team;
  }
  for (const team of teams) {
    const nt = normalize(team.strTeam);
    const minLen = Math.min(nt.length, nq.length);
    const threshold = Math.max(8, Math.floor(minLen * 0.7));
    if (nt.slice(0, threshold) === nq.slice(0, threshold)) return team;
  }
  return null;
}

const TEAM_SEARCH_ALIASES: Record<string, string> = {
  "celtadevigo": "Celta Vigo",
  "racingsantander": "Racing de Santander",
  "gimnasialaplata": "Gimnasia y Esgrima de La Plata",
  "gimnasiamendoza": "Gimnasia y Esgrima de Mendoza",
  "brightonhovealbion": "Brighton and Hove Albion",
  "mainz05": "1. FSV Mainz 05",
  "realsociedadii": "Real Sociedad B",
  "karlsruhersc": "Karlsruher SC",
  "nurnberg": "1. FC Nurnberg",
  "tallerescordoba": "Talleres de Cordoba",
  "borussiamgladbach": "Borussia Monchengladbach",
  "unionsantafe": "Unión de Santa Fe",
  "cdguadalajara": "Guadalajara",
  "losangelesfc": "Los Angeles FC",
  "cfmontreal": "CF Montréal",
  "sjearthquakes": "San Jose Earthquakes",
  "sportingkc": "Sporting Kansas City",
  "dcunited": "DC United",
  "charlotte": "Charlotte FC",
  "newengland": "New England Revolution",
  "orlandocitysc": "Orlando City",
  "dallas": "FC Dallas",
  "seattlesoundersfc": "Seattle Sounders",
  "atlantaunited": "Atlanta United",
  "stlouiscity": "STL City",
  "intermilan": "Inter Milan",
  "internazionale": "Inter Milan",
  "acmilan": "AC Milan",
  "sscnapoli": "Napoli",
  "asroma": "Roma",
  "sslazio": "Lazio",
  "sportinggijon": "Sporting de Gijon",
};

function getSearchVariations(name: string): string[] {
  const words = name.split(/\s+/);
  const variations: string[] = [name];

  if (words.length > 2) {
    const filtered = words.filter(
      (w) => !/^(de|del|la|las|el|los|fc|sc|cf|cd|ac|rc|rr|sd|ud|sv|ii|iii|iv)$/i.test(w)
    );
    if (filtered.length >= 1) variations.push(filtered.join(" "));
    if (filtered.length >= 2) {
      variations.push(filtered[0]);
      variations.push(filtered.slice(0, 2).join(" "));
    }
  }

  if (words.length > 1) {
    variations.push(words[words.length - 1]);
  }

  const seen = new Set<string>();
  return variations.filter((v) => {
    const key = normalize(v);
    if (!key || key.length < 2 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchTeam(query: string): Promise<SportsDBTeam[]> {
  const url = `${SPORTSDB_BASE}/${SPORTSDB_KEY}/searchteams.php?t=${encodeURIComponent(query)}`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return [];
  const data: SportsDBResponse = await res.json();
  return data.teams ?? [];
}

export async function getTeamLogo(teamName: string): Promise<string> {
  const key = normalize(teamName);
  if (!key) return "";

  const aliasKey = PROMIEDOS_ALIASES[key];
  const promiedosUrl = PROMIEDOS_BADGES[aliasKey || key];
  if (promiedosUrl) return promiedosUrl;

  const cached = logoCache.get(key);
  if (cached !== undefined) return cached;

  const pending = pendingLookups.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const aliasKey = TEAM_SEARCH_ALIASES[key];
      const searchName = aliasKey || teamName;
      const variations = getSearchVariations(searchName);

      for (const query of variations) {
        const teams = await searchTeam(query);
        if (teams.length === 0) continue;

        const match = findBestMatch(teams, teamName) || (aliasKey ? findBestMatch(teams, aliasKey) : null);
        if (match?.strBadge) {
          logoCache.set(key, match.strBadge);
          return match.strBadge;
        }
      }

      logoCache.set(key, "");
      return "";
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
