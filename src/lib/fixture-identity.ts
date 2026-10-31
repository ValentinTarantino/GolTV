import { TEAM_DISPLAY_NAMES } from "./constants";
import { cleanAgendaText } from "./agenda-text";

const TEAM_DEDUP_ALIASES: Record<string, string> = {
  bayern: "bayernmunich",
  bayernmunchen: "bayernmunich",
  bayernmunich: "bayernmunich",
  talleres: "tallerescordoba",
  talleresdecordoba: "tallerescordoba",
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
  39: { coventry: "coventrycity" },
  78: {
    augsburgo: "augsburg", friburgo: "freiburg", wolfsburgo: "wolfsburg",
    borussiamgladbach: "borussiamonchengladbach",
    paderborn: "paderborn07", scpaderborn07: "paderborn07",
  },
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
  268: {
    racing: "racingmontevideo", racingclub: "racingmontevideo",
    racingdemontevideo: "racingmontevideo", racingclubmontevideo: "racingmontevideo",
    wanderers: "montevideowanderers",
  },
  930: {
    racing: "racingmontevideo", racingclub: "racingmontevideo",
    racingdemontevideo: "racingmontevideo", racingclubmontevideo: "racingmontevideo",
    wanderers: "montevideowanderers",
  },
  239: { alianza: "alianzavalledupar", alianzafc: "alianzavalledupar" },
  281: { alianza: "alianzalima" },
};

const TEAM_NAME_DESIGNATORS = new Set([
  "ac", "ae", "afc", "ca", "cf", "cd", "club", "fc", "fk", "if", "sc", "sk", "ud", "ub",
]);

// Share the explicit full/short names used by cards, not fuzzy string matches
// or badge aliases (reserve teams may share a crest with their senior team).
const displayIdentities = new Map(
  Object.entries(TEAM_DISPLAY_NAMES).map(([full, short]) => [teamKey(full, false), teamKey(short, false)])
);

function teamKey(value: string, stripDesignators = true): string {
  return cleanAgendaText(value)
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(?:[a-z]\.){2,}/g, (abbr) => abbr.replace(/\./g, ""))
    .split(/[^a-z0-9]+/)
    .filter((token) => token && (!stripDesignators || !TEAM_NAME_DESIGNATORS.has(token)))
    .join("");
}

const globalAliases = new Map(Object.entries(TEAM_DEDUP_ALIASES).map(([a, b]) => [teamKey(a, false), teamKey(b, false)]));
const scopedAliases = new Map(Object.entries(LEAGUE_TEAM_DEDUP_ALIASES).map(([id, aliases]) =>
  [Number(id), new Map(Object.entries(aliases).map(([a, b]) => [teamKey(a, false), teamKey(b, false)]))]
));

export function canonicalTeamForDedup(team: string, leagueId: number): string {
  const lookup = (key: string) => scopedAliases.get(leagueId)?.get(key) ?? globalAliases.get(key) ?? displayIdentities.get(key);
  // Resolve complete known names before dropping FC/Club: compact provider
  // aliases such as LAFC and 1FCNurnberg must reach the same canonical target.
  const full = teamKey(team, false);
  let key = lookup(full) !== undefined ? full : teamKey(team);
  const visited = new Set<string>();
  while (!visited.has(key)) {
    visited.add(key);
    const next = lookup(key);
    if (!next || next === key) break;
    key = next;
  }
  return key;
}

export function fixtureTeamPair(home: string, away: string, leagueId: number): string {
  return JSON.stringify([canonicalTeamForDedup(home, leagueId), canonicalTeamForDedup(away, leagueId)].sort());
}
