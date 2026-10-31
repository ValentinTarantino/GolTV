import catalog from "@/data/team-badges.json";

const normalize = (value: string) => value.toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const countries: Record<string, string> = {
  usa: "estadosunidos", unitedstates: "estadosunidos", unitedstatesofamerica: "estadosunidos",
  spain: "espana", italy: "italia", germany: "alemania",
};
const countryKey = (value: string) => countries[normalize(value)] ?? normalize(value);
const internationalRegions = new Set(["internacional", "international", "europa", "europe", "sudamerica", "norteamerica", "mundial", "world"]);
const designators = /\b(fc|cf|sc|ac|cd|sd|ud|club)\b/gi;
const nameKeys = (name: string) => [normalize(name), normalize(name.replace(designators, " "))];
const byCountry = new Map<string, string>();
const byName = new Map<string, Set<string>>();

for (const entry of catalog) {
  for (const name of entry.names) {
    for (const key of nameKeys(name)) {
      if (!key) continue;
      byCountry.set(`${countryKey(entry.country)}:${key}`, entry.file);
      const options = byName.get(key) ?? new Set<string>();
      options.add(entry.file);
      byName.set(key, options);
    }
  }
}

/** Known clubs resolve synchronously, without network searches or negative caches. */
export function getLocalTeamBadge(name: string, country?: string): string | null {
  for (const key of nameKeys(name)) {
    if (country) {
      const badge = byCountry.get(`${countryKey(country)}:${key}`);
      if (badge) return badge;
    }
    if (!country || internationalRegions.has(countryKey(country))) {
      const options = byName.get(key);
      // Barcelona (Spain/Ecuador), for example, requires country context.
      if (options?.size === 1) return options.values().next().value ?? null;
    }
  }
  return null;
}
