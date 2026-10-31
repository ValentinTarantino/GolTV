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
