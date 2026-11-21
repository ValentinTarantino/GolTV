import { load } from "cheerio/slim";

/** Provider text can contain HTML entities, including double-encoded ones. */
export function cleanAgendaText(value: string): string {
  let text = value;
  for (let pass = 0; pass < 3; pass++) {
    const decoded = load(text, {}, false).text();
    if (decoded === text) break;
    text = decoded;
  }
  return text.replace(/\s+/g, " ").trim();
}

/** Some providers repeat the competition label inside the team's text. */
export function cleanAgendaTeamName(value: string, league: string): string {
  let name = cleanAgendaText(value);
  const key = (text: string) => cleanAgendaText(text).replace(/:$/, "").trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const competition = key(league);
  while (competition && name.includes(":")) {
    const colon = name.indexOf(":");
    if (key(name.slice(0, colon)) !== competition) break;
    name = name.slice(colon + 1).trim();
  }
  return name;
}

/**
 * Providers append the competition stage to the last team name ("Boca Juniors
 * - Final"). It is not part of the club and it breaks fixture identity, so the
 * same game showed up twice.
 */
const MATCH_STAGE_SUFFIX = /\s+[-–—]\s+(?:final|semifinal(?:es)?|cuartos?(?:\s+de\s+final)?|octavos?(?:\s+de\s+final)?|dieciseisavos?(?:\s+de\s+final)?|fase(?:\s+de\s+grupos)?|grupo\s+[a-z]|play-?offs?|repechaje|ida|vuelta)\b.*$/i;

export function stripMatchStageSuffix(value: string): string {
  return value.replace(MATCH_STAGE_SUFFIX, "").trim();
}
