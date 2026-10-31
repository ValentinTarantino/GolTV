import { dictionaries, translateLeague, leagueNames } from "@/i18n/dictionaries";

describe("dictionaries", () => {
  it("es and en expose identical key sets", () => {
    const flatten = (value: unknown, prefix = ""): string[] =>
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
            flatten(child, prefix ? `${prefix}.${key}` : key)
          )
        : [prefix];

    const es = flatten(dictionaries.es).sort();
    const en = flatten(dictionaries.en).sort();

    expect(en).toEqual(es);
  });

  it("translateLeague keeps Spanish names untouched", () => {
    expect(translateLeague("Brasileirão Serie A", "es")).toBe("Brasileirão Serie A");
    expect(translateLeague("Serie A", "es")).toBe("Serie A");
  });

  it("shows the Brazilian league as Brasileirão in English", () => {
    // Regression: it used to map to "Serie A", making the Brasileirão group
    // header identical to the Italian Serie A one.
    expect(leagueNames["Brasileirão Serie A"]).toBe("Brasileirão");
    expect(translateLeague("Brasileirão Serie A", "en")).toBe("Brasileirão");
    expect(translateLeague("Serie A", "en")).toBe("Serie A");
  });
});
