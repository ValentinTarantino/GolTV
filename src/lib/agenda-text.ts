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
