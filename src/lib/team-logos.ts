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
  "intermilano": "Inter Milan",
  "internazionale": "Inter Milan",
  "acmilan": "AC Milan",
  "sscnapoli": "Napoli",
  "asroma": "Roma",
  "sslazio": "Lazio",
  "sportinggijon": "Sporting de Gijon",
  "puertomontt": "Deportes Puerto Montt",
  "deportespuertomontt": "Deportes Puerto Montt",
  "medellin": "Independiente Medellin",
  "ohleuven": "Oud-Heverlee Leuven",
  "oudheverleeleuven": "Oud-Heverlee Leuven",
  "leuven": "Oud-Heverlee Leuven",
  // National teams
  "republicadominicana": "Dominican Republic",
  "repdominicana": "Dominican Republic",
  "dominicanrepublic": "Dominican Republic",
  "curazao": "Curaçao",
  "curacao": "Curaçao",
  "costarica": "Costa Rica",
  "nicaragua": "Nicaragua",
  "noruega": "Norway",
  "dinamarca": "Denmark",
  "gales": "Wales",
  "wales": "Wales",
  "lituania": "Lithuania",
  "paisesbajos": "Netherlands",
  "netherlands": "Netherlands",
  "holanda": "Netherlands",
  "alemania": "Germany",
  "germany": "Germany",
  "irlanda": "Ireland",
  "ireland": "Ireland",
  "republicofireland": "Ireland",
  "republicofirlanda": "Ireland",
  "repdelirlanda": "Ireland",
  "republicadeirlanda": "Ireland",
  "república": "Ireland",
  "kosovo": "Kosovo",
  "elsalvador": "El Salvador",
  "el salvador": "El Salvador",
  "martinica": "Martinique",
  "martinique": "Martinique",
};

// Country flags mapping for national teams using flagcdn.com (more reliable)
const COUNTRY_FLAGS: Record<string, string> = {
  "Portugal": "https://flagcdn.com/w160/pt.png",
  "Liechtenstein": "https://flagcdn.com/w160/li.png",
  "Austria": "https://flagcdn.com/w160/at.png",
  "Israel": "https://flagcdn.com/w160/il.png",
  "Wales": "https://flagcdn.com/w160/gb-wls.png",
  "Lithuania": "https://flagcdn.com/w160/lt.png",
  "Netherlands": "https://flagcdn.com/w160/nl.png",
  "Germany": "https://flagcdn.com/w160/de.png",
  "Dominican Republic": "https://flagcdn.com/w160/do.png",
  "Curaçao": "https://flagcdn.com/w160/cw.png",
  "Costa Rica": "https://flagcdn.com/w160/cr.png",
  "Nicaragua": "https://flagcdn.com/w160/ni.png",
  "Norway": "https://flagcdn.com/w160/no.png",
  "Denmark": "https://flagcdn.com/w160/dk.png",
  "Italy": "https://flagcdn.com/w160/it.png",
  "Italia": "https://flagcdn.com/w160/it.png",
  "Belgium": "https://flagcdn.com/w160/be.png",
  "Bélgica": "https://flagcdn.com/w160/be.png",
  "Belgica": "https://flagcdn.com/w160/be.png",
  "Spain": "https://flagcdn.com/w160/es.png",
  "Andorra": "https://flagcdn.com/w160/ad.png",
  "Malta": "https://flagcdn.com/w160/mt.png",
  "Ireland": "https://flagcdn.com/w160/ie.png",
  "Republic of Ireland": "https://flagcdn.com/w160/ie.png",
  "República de Irlanda": "https://flagcdn.com/w160/ie.png",
  "REPÚBLICA DE IRLANDA": "https://flagcdn.com/w160/ie.png",
  "republicadeirlanda": "https://flagcdn.com/w160/ie.png",
  "repdelirlanda": "https://flagcdn.com/w160/ie.png",
  "Armenia": "https://flagcdn.com/w160/am.png",
  "Poland": "https://flagcdn.com/w160/pl.png",
  "Bosnia and Herzegovina": "https://flagcdn.com/w160/ba.png",
  "Montenegro": "https://flagcdn.com/w160/me.png",
  "Cyprus": "https://flagcdn.com/w160/cy.png",
  "Chipre": "https://flagcdn.com/w160/cy.png",
  "Latvia": "https://flagcdn.com/w160/lv.png",
  "Letonia": "https://flagcdn.com/w160/lv.png",
  "Hungary": "https://flagcdn.com/w160/hu.png",
  "Hungría": "https://flagcdn.com/w160/hu.png",
  "Sweden": "https://flagcdn.com/w160/se.png",
  "Suecia": "https://flagcdn.com/w160/se.png",
  "Turkey": "https://flagcdn.com/w160/tr.png",
  "Turquía": "https://flagcdn.com/w160/tr.png",
  "Ukraine": "https://flagcdn.com/w160/ua.png",
  "Ucrania": "https://flagcdn.com/w160/ua.png",
  "Romania": "https://flagcdn.com/w160/ro.png",
  "Rumania": "https://flagcdn.com/w160/ro.png",
  "France": "https://flagcdn.com/w160/fr.png",
  "Francia": "https://flagcdn.com/w160/fr.png",
  "Kosovo": "https://flagcdn.com/w160/xk.png",
  "El Salvador": "https://flagcdn.com/w160/sv.png",
  "Martinique": "https://flagcdn.com/w160/mq.png",
};

const NATIONAL_TEAM_BADGES: Record<string, string> = {
  georgia: "https://upload.wikimedia.org/wikipedia/en/9/9c/Georgia_national_football_team_crest.svg",
  georgianationalfootballteam: "https://upload.wikimedia.org/wikipedia/en/9/9c/Georgia_national_football_team_crest.svg",
  northernireland: "https://upload.wikimedia.org/wikipedia/en/2/25/Irish_Football_Association_logo.svg",
  irlandadelnorte: "https://upload.wikimedia.org/wikipedia/en/2/25/Irish_Football_Association_logo.svg",
  armenia: "https://flagcdn.com/w160/am.png",
  armenianationalfootballteam: "https://flagcdn.com/w160/am.png",
  poland: "https://flagcdn.com/w160/pl.png",
  polandnationalfootballteam: "https://flagcdn.com/w160/pl.png",
  bosniaandherzegovina: "https://flagcdn.com/w160/ba.png",
  bosniaherzegovina: "https://flagcdn.com/w160/ba.png",
  bosniaandherzegovinanationalfootballteam: "https://flagcdn.com/w160/ba.png",
  montenegro: "https://flagcdn.com/w160/me.png",
  montenegronationalfootballteam: "https://flagcdn.com/w160/me.png",
  cyprus: "https://flagcdn.com/w160/cy.png",
  cyprusnationalfootballteam: "https://flagcdn.com/w160/cy.png",
  chipre: "https://flagcdn.com/w160/cy.png",
  chiprenationalfootballteam: "https://flagcdn.com/w160/cy.png",
  latvia: "https://flagcdn.com/w160/lv.png",
  latvianationalfootballteam: "https://flagcdn.com/w160/lv.png",
  letonia: "https://flagcdn.com/w160/lv.png",
  letonianationalfootballteam: "https://flagcdn.com/w160/lv.png",
  hungary: "https://flagcdn.com/w160/hu.png",
  hungarnationalfootballteam: "https://flagcdn.com/w160/hu.png",
  hungria: "https://flagcdn.com/w160/hu.png",
  sweden: "https://flagcdn.com/w160/se.png",
  swedennationalfootballteam: "https://flagcdn.com/w160/se.png",
  suecia: "https://flagcdn.com/w160/se.png",
  turkey: "https://flagcdn.com/w160/tr.png",
  turkishnationalfootballteam: "https://flagcdn.com/w160/tr.png",
  turquia: "https://flagcdn.com/w160/tr.png",
  ukraine: "https://flagcdn.com/w160/ua.png",
  ukrainenationalfootballteam: "https://flagcdn.com/w160/ua.png",
  ucrania: "https://flagcdn.com/w160/ua.png",
  romania: "https://flagcdn.com/w160/ro.png",
  romanianationalfootballteam: "https://flagcdn.com/w160/ro.png",
  rumania: "https://flagcdn.com/w160/ro.png",
  france: "https://flagcdn.com/w160/fr.png",
  francesnationalfootballteam: "https://flagcdn.com/w160/fr.png",
  francia: "https://flagcdn.com/w160/fr.png",
  martinique: "https://flagcdn.com/w160/mq.png",
  martiniqunationalfootballteam: "https://flagcdn.com/w160/mq.png",
  martinica: "https://flagcdn.com/w160/mq.png",
  kosovo: "https://flagcdn.com/w160/xk.png",
  kosovonationalfootballteam: "https://flagcdn.com/w160/xk.png",
  elsalvador: "https://flagcdn.com/w160/sv.png",
  elsalvadornationalfootballteam: "https://flagcdn.com/w160/sv.png",
};

const LEAGUE_COUNTRY_FLAGS: Record<string, string> = {
  argentina: "https://flagcdn.com/w160/ar.png",
  brasil: "https://flagcdn.com/w160/br.png",
  brazil: "https://flagcdn.com/w160/br.png",
  chile: "https://flagcdn.com/w160/cl.png",
  colombia: "https://flagcdn.com/w160/co.png",
  peru: "https://flagcdn.com/w160/pe.png",
  "perú": "https://flagcdn.com/w160/pe.png",
  ecuador: "https://flagcdn.com/w160/ec.png",
  uruguay: "https://flagcdn.com/w160/uy.png",
  paraguay: "https://flagcdn.com/w160/py.png",
  italia: "https://flagcdn.com/w160/it.png",
  italy: "https://flagcdn.com/w160/it.png",
  espana: "https://flagcdn.com/w160/es.png",
  españa: "https://flagcdn.com/w160/es.png",
  spain: "https://flagcdn.com/w160/es.png",
  inglaterra: "https://flagcdn.com/w160/gb-eng.png",
  england: "https://flagcdn.com/w160/gb-eng.png",
  alemania: "https://flagcdn.com/w160/de.png",
  germany: "https://flagcdn.com/w160/de.png",
  "estados unidos": "https://flagcdn.com/w160/us.png",
  "united states": "https://flagcdn.com/w160/us.png",
};

function getCountryFlag(country?: string): string {
  if (!country) return "";
  const normalizedCountry = normalize(country);
  return LEAGUE_COUNTRY_FLAGS[normalizedCountry] || "";
}

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

export async function getTeamLogo(teamName: string, country?: string): Promise<string> {
  const key = normalize(teamName);
  const fallbackFlag = getCountryFlag(country);
  if (!key) return fallbackFlag;

  const explicitAudaxLogo = PROMIEDOS_BADGES["audaxitaliano"] || PROMIEDOS_BADGES["audax italiano"];
  if (key === "audaxitaliano" || key === "audaxitaliano" || key === "audaxitaliano") {
    return explicitAudaxLogo || fallbackFlag;
  }

  const nationalTeamBadge = NATIONAL_TEAM_BADGES[key];
  if (nationalTeamBadge) return nationalTeamBadge;

  // Direct country matching for Ireland - special case
  if (key === "irland" || key === "ireland" || key === "republicofireland") {
    return "https://flagcdn.com/w160/ie.png";
  }

  // Check if it's a national team first - improved matching
  const normalizedTeamName = teamName.toLowerCase();
  for (const [country, flagUrl] of Object.entries(COUNTRY_FLAGS)) {
    const countryLower = country.toLowerCase();
    const normalizedCountry = normalize(country);
    // Check if team name contains country name or vice versa
    if (normalizedTeamName.includes(countryLower) || countryLower.includes(normalizedTeamName)
      || key === normalizedCountry || key.includes(normalizedCountry) || normalizedCountry.includes(key)) {
      return flagUrl;
    }
    // Check for more specific matches
    if (normalizedTeamName === countryLower || key === normalizedCountry) {
      return flagUrl;
    }
  }

  const aliasKey = PROMIEDOS_ALIASES[key];
  const promiedosUrl = PROMIEDOS_BADGES[aliasKey || key];
  if (promiedosUrl) return promiedosUrl;

  const cached = logoCache.get(key);
  if (cached !== undefined) return cached || fallbackFlag;

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

      logoCache.set(key, fallbackFlag);
      return fallbackFlag;
    } catch {
      logoCache.set(key, fallbackFlag);
      return fallbackFlag;
    } finally {
      pendingLookups.delete(key);
    }
  })();

  pendingLookups.set(key, promise);
  return promise;
}
