import {
  SUPPORTED_LEAGUES,
  getChannelsForCountry,
  getBroadcastChannels,
  CHANNEL_SETS,
  matchPlLeague,
  isFootballLeagueName,
  isMenFootballMatch,
  shortenTeamName,
} from "@/lib/constants";
import { getTeamLogo, peekTeamLogo } from "@/lib/team-logos";
import { isAllowedStreamLeague } from "@/lib/streaming";

describe("SUPPORTED_LEAGUES", () => {
  it("contains Liga Profesional Argentina", () => {
    const liga = SUPPORTED_LEAGUES.find((l) => l.id === 128);
    expect(liga).toBeDefined();
    expect(liga?.name).toBe("Liga Profesional");
    expect(liga?.country).toBe("Argentina");
  });

  it("uses display names for Uruguay", () => {
    expect(SUPPORTED_LEAGUES.find((l) => l.id === 268)?.name).toBe("Liga AUF Uruguaya");
  });

  it("contains Libertadores, Champions and Premier", () => {
    expect(SUPPORTED_LEAGUES.some((l) => l.id === 13)).toBe(true);
    expect(SUPPORTED_LEAGUES.some((l) => l.id === 2)).toBe(true);
    expect(SUPPORTED_LEAGUES.some((l) => l.id === 39)).toBe(true);
  });

  it("excludes Liga MX", () => {
    expect(SUPPORTED_LEAGUES.some((l) => l.id === 262)).toBe(false);
    expect(SUPPORTED_LEAGUES.some((l) => l.id === 235)).toBe(false);
  });

  it("contains Chile and Colombia leagues", () => {
    const chile = SUPPORTED_LEAGUES.find((l) => l.id === 265);
    const colombia = SUPPORTED_LEAGUES.find((l) => l.id === 239);
    expect(chile).toBeDefined();
    expect(chile?.name).toBe("Campeonato Nacional");
    expect(chile?.country).toBe("Chile");
    expect(SUPPORTED_LEAGUES.some((l) => l.id === 267)).toBe(true);
    expect(SUPPORTED_LEAGUES.find((l) => l.id === 267)?.name).toBe("Copa Chile");
    expect(colombia).toBeDefined();
    expect(colombia?.name).toBe("Liga BetPlay");
    expect(colombia?.country).toBe("Colombia");
  });

  it("contains Liga 1 Peru", () => {
    const peru = SUPPORTED_LEAGUES.find((l) => l.id === 281);
    expect(peru).toBeDefined();
    expect(peru?.name).toBe("Liga 1");
    expect(peru?.country).toBe("Perú");
    expect(getBroadcastChannels(281).length).toBeGreaterThan(0);
    expect(getChannelsForCountry("Perú").length).toBeGreaterThan(0);
  });

  it("has unique IDs", () => {
    const ids = SUPPORTED_LEAGUES.map((l) => l.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("has all required fields", () => {
    SUPPORTED_LEAGUES.forEach((league) => {
      expect(league.id).toBeDefined();
      expect(league.name).toBeDefined();
      expect(league.country).toBeDefined();
      expect(league.slug).toBeDefined();
      expect(league.season).toBeDefined();
    });
  });
});

describe("getChannelsForCountry", () => {
  it("returns Argentine channels", () => {
    const channels = getChannelsForCountry("Argentina");
    expect(channels.length).toBeGreaterThan(0);
    expect(channels[0]).toHaveProperty("id");
  });

  it("returns Uruguayan channels", () => {
    expect(getChannelsForCountry("Uruguay").length).toBeGreaterThan(0);
  });

  it("returns default channels for unknown country", () => {
    expect(getChannelsForCountry("PaisDesconocido")).toEqual(CHANNEL_SETS.default);
  });
});

describe("getBroadcastChannels", () => {
  it("returns channels for Liga Profesional", () => {
    const channels = getBroadcastChannels(128);
    expect(channels).toContain("TyC Sports");
    expect(channels).toContain("ESPN");
  });

  it("returns channels for Premier League", () => {
    expect(getBroadcastChannels(39).length).toBeGreaterThan(0);
  });

  it("returns default channels for unknown league", () => {
    expect(getBroadcastChannels(999999)).toEqual(["TyC Sports", "ESPN", "Fox Sports"]);
  });
});

describe("isAllowedStreamLeague", () => {
  it("allows focus leagues", () => {
    expect(isAllowedStreamLeague("Copa Libertadores")).toBe(true);
    expect(isAllowedStreamLeague("English Premier League")).toBe(true);
    expect(isAllowedStreamLeague("Liga AUF Uruguaya")).toBe(true);
    expect(isAllowedStreamLeague("MLS")).toBe(true);
    expect(isAllowedStreamLeague("USA - MLS 2026")).toBe(true);
    expect(isAllowedStreamLeague("Major League Soccer")).toBe(true);
    expect(isAllowedStreamLeague("MLS 2026 - Regular Season")).toBe(true);
  });

  it("rejects unrelated live noise", () => {
    expect(isAllowedStreamLeague("OCA Asian Games")).toBe(false);
    expect(isAllowedStreamLeague("RUS D3B")).toBe(false);
    expect(isAllowedStreamLeague("Mexican Liga MX")).toBe(false);
    expect(isAllowedStreamLeague("Belarusian Premier League")).toBe(false);
    expect(isAllowedStreamLeague("Poland Liga 1")).toBe(false);
    expect(isAllowedStreamLeague("Azerbaijan Premier League")).toBe(false);
    expect(isAllowedStreamLeague("Armenian Premier League")).toBe(false);
    expect(isAllowedStreamLeague("Jordan Premier League")).toBe(false);
    expect(isAllowedStreamLeague("Kazakhstan Premier League")).toBe(false);
  });
});

describe("getTeamLogo", () => {
  it("resolves Messi Cup academy team names to their club crests", async () => {
    const teams = [
      ["River Plate Academy", "https://api.promiedos.com.ar/images/team/igi/3"],
      ["Ajax Academy", "https://www.messicup.com/media/teams/ajax.webp"],
      ["Boca Juniors Academy", "https://api.promiedos.com.ar/images/team/igg/3"],
      ["Cornellà Academy", "https://www.messicup.com/media/teams/ue-cornella.webp"],
      ["FC Barcelona Academy", "https://api.promiedos.com.ar/images/team/bdc/3"],
      ["Arsenal Academy", "https://api.promiedos.com.ar/images/team/bae/3"],
      ["Palmeiras Academy", "https://api.promiedos.com.ar/images/team/bccc/3"],
      ["Newell's Old Boys Academy", "https://api.promiedos.com.ar/images/team/ihh/3"],
    ];

    for (const [team, crest] of teams) {
      await expect(getTeamLogo(team, "Internacional")).resolves.toBe(crest);
      expect(peekTeamLogo(team, "Internacional")).toBe(crest);
    }
  });

  it("uses stable API-Football badges for missing academy variants", async () => {
    await expect(getTeamLogo("CR Flamengo Academy", "Brasil")).resolves.toBe(
      "https://media.api-sports.io/football/teams/127.png"
    );
    await expect(getTeamLogo("Inter Milan Academy", "Italia")).resolves.toBe(
      "https://media.api-sports.io/football/teams/505.png"
    );
    await expect(getTeamLogo("Manchester City Academy", "Inglaterra")).resolves.toBe(
      "https://media.api-sports.io/football/teams/50.png"
    );
  });

  it("hides the Academy suffix in fixture display names", () => {
    expect(shortenTeamName("Boca Juniors Academy")).toBe("Boca Juniors");
    expect(shortenTeamName("Newell's Old Boys Academy")).toBe("Newell's Old Boys");
    expect(shortenTeamName("CR Flamengo Academy")).toBe("Flamengo");
  });

  it("uses stable MLS crests for LAFC and LA Galaxy aliases", async () => {
    const lafcBadge = "https://a.espncdn.com/i/teamlogos/soccer/500/18966.png";
    const galaxyBadge = "https://a.espncdn.com/i/teamlogos/soccer/500/187.png";

    for (const name of ["LAFC", "Los Angeles FC"]) {
      await expect(getTeamLogo(name, "Estados Unidos")).resolves.toBe(lafcBadge);
      expect(peekTeamLogo(name, "Estados Unidos")).toBe(lafcBadge);
    }
    for (const name of ["LA Galaxy", "Los Angeles Galaxy"]) {
      await expect(getTeamLogo(name, "Estados Unidos")).resolves.toBe(galaxyBadge);
      expect(peekTeamLogo(name, "Estados Unidos")).toBe(galaxyBadge);
    }
  });

  it("resolves Inter Milan and Genoa badge aliases", async () => {
    const interBadge = "https://api.promiedos.com.ar/images/team/cce/3";
    const genoaBadge = "https://api.promiedos.com.ar/images/team/cdb/3";

    for (const name of ["Inter Milan", "Internazionale", "Internazionale Milano", "FC Internazionale"]) {
      await expect(getTeamLogo(name, "Italia")).resolves.toBe(interBadge);
      expect(peekTeamLogo(name, "Italia")).toBe(interBadge);
    }
    for (const name of ["Genoa", "Genova", "Genoa CFC", "Genova FC"]) {
      await expect(getTeamLogo(name, "Italia")).resolves.toBe(genoaBadge);
      expect(peekTeamLogo(name, "Italia")).toBe(genoaBadge);
    }
  });

  it("uses official MLS crests for New York Red Bulls and New England aliases", async () => {
    const newYorkRedBullsCrest = "https://a.espncdn.com/i/teamlogos/soccer/500/190.png";
    const newEnglandRevolutionCrest = "https://a.espncdn.com/i/teamlogos/soccer/500/189.png";

    for (const team of ["New York RB", "New York Red Bulls", "Red Bull New York", "NYRB", "RBNY"]) {
      await expect(getTeamLogo(team, "USA")).resolves.toBe(newYorkRedBullsCrest);
      expect(peekTeamLogo(team, "USA")).toBe(newYorkRedBullsCrest);
    }
    for (const team of ["New England", "New England Revolution", "Revolution"]) {
      await expect(getTeamLogo(team, "USA")).resolves.toBe(newEnglandRevolutionCrest);
      expect(peekTeamLogo(team, "USA")).toBe(newEnglandRevolutionCrest);
    }
  });
  it("uses Brazil's official CBF crest for Portuguese and English names", async () => {
    const brazilCrest = "https://upload.wikimedia.org/wikipedia/commons/d/d4/Brazil_National_Football_Team_%28no_stars%29.svg";

    for (const team of ["Brasil", "Brazil", "Brazil National Football Team", "Brasil National Team"]) {
      await expect(getTeamLogo(team, "Brasil")).resolves.toBe(brazilCrest);
    }
  });
  it("uses South Korea's official national team crest for Spanish and English names", async () => {
    const southKoreaCrest =
      "https://r2.thesportsdb.com/images/media/team/badge/a8nqfs1589564916.png";

    for (const team of [
      "Corea del Sur",
      "COREA DEL SUR",
      "South Korea",
      "Korea Republic",
      "South Korea National Football Team",
    ]) {
      await expect(getTeamLogo(team)).resolves.toBe(southKoreaCrest);
    }
  });

  it("uses Bermuda's official football association crest", async () => {
    const bermudaCrest = "https://upload.wikimedia.org/wikipedia/en/b/bb/Bermuda_FA_logo.svg";

    for (const team of [
      "Bermuda",
      "Bermudas",
      "Bermuda National Team",
      "Bermuda National Football Team",
      "Bermuda Football Association",
    ]) {
      await expect(getTeamLogo(team)).resolves.toBe(bermudaCrest);
    }
  });

  it("returns visible badges for remaining national teams", async () => {
    const expected = {
      Armenia: "https://flagcdn.com/w160/am.png",
      Poland: "https://flagcdn.com/w160/pl.png",
      Croatia: "https://flagcdn.com/w160/hr.png",
      "Croacia": "https://flagcdn.com/w160/hr.png",
      "Bosnia and Herzegovina": "https://flagcdn.com/w160/ba.png",
      Montenegro: "https://flagcdn.com/w160/me.png",
      Cyprus: "https://flagcdn.com/w160/cy.png",
      "Chipre": "https://flagcdn.com/w160/cy.png",
      Latvia: "https://flagcdn.com/w160/lv.png",
      Hungary: "https://flagcdn.com/w160/hu.png",
      Sweden: "https://flagcdn.com/w160/se.png",
      Turkey: "https://flagcdn.com/w160/tr.png",
      Ukraine: "https://flagcdn.com/w160/ua.png",
      Romania: "https://flagcdn.com/w160/ro.png",
      France: "https://flagcdn.com/w160/fr.png",
    };

    for (const [team, url] of Object.entries(expected)) {
      await expect(getTeamLogo(team)).resolves.toBe(url);
    }

    await expect(getTeamLogo("Letonia")).resolves.toBe("https://flagcdn.com/w160/lv.png");
  });

  it("does not use a league country flag as a club badge when lookup fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ teams: null }),
    } as Response);

    try {
      await expect(getTeamLogo("Unmapped Club 207", "Spain")).resolves.toBe("");
    } finally {
      if (originalFetch) globalThis.fetch = originalFetch;
      else delete (globalThis as { fetch?: typeof fetch }).fetch;
    }
  });

  it("uses the Chilean crest for Audax Italiano", async () => {
    await expect(getTeamLogo("Audax Italiano", "Chile")).resolves.toBe("https://audax.dwos.cl/uploads/otros/escudos/2022.svg");
    await expect(getTeamLogo("audaxitaliano")).resolves.toBe("https://audax.dwos.cl/uploads/otros/escudos/2022.svg");
  });

  it("uses the original Estudiantes de La Plata crest for Estudiantes LP", async () => {
    const estudiantesCrest = "https://api.promiedos.com.ar/images/team/igh/3";

    await expect(getTeamLogo("Estudiantes LP", "Argentina")).resolves.toBe(estudiantesCrest);
    await expect(getTeamLogo("Estudiantes LP")).resolves.toBe(estudiantesCrest);
    await expect(getTeamLogo("Estudiantes de La Plata", "Argentina")).resolves.toBe(estudiantesCrest);
  });

  it("uses Universidad de Concepción's crest for its common aliases", async () => {
    const universidadDeConcepcionCrest = "https://api.promiedos.com.ar/images/team/bceh/3";

    for (const team of ["Univ. Concepción", "Universidad de Concepción", "UdeC"]) {
      await expect(getTeamLogo(team, "Chile")).resolves.toBe(universidadDeConcepcionCrest);
    }
  });

  it("still maps Platense to its promiedos badge", async () => {
    await expect(getTeamLogo("Platense", "Argentina")).resolves.toBe("https://api.promiedos.com.ar/images/team/hcah/3");
  });

  it("uses Talleres de Córdoba's crest for its fixture name", async () => {
    const talleresCrest = "/talleres-cordoba.png";

    await expect(getTeamLogo("Talleres Córdoba", "Argentina")).resolves.toBe(talleresCrest);
    await expect(getTeamLogo("Talleres de Córdoba", "Argentina")).resolves.toBe(talleresCrest);
    await expect(getTeamLogo("Talleres")).resolves.toBe(talleresCrest);
  });

  it("resolves the missing fixture crests to their SportsDB badges", async () => {
    const expected: Array<[string, string]> = [
      ["Hannover 96", "https://r2.thesportsdb.com/images/media/team/badge/tqpqqv1473454148.png"],
      ["St. Pauli", "https://r2.thesportsdb.com/images/media/team/badge/5qupxa1608237013.png"],
      ["Valencia", "https://r2.thesportsdb.com/images/media/team/badge/dm8l6o1655594864.png"],
      ["Las Palmas", "https://r2.thesportsdb.com/images/media/team/badge/mmhyb11616443601.png"],
      ["CD Castellon", "https://r2.thesportsdb.com/images/media/team/badge/ywibjw1733456820.png"],
      ["Boyacá Chicó", "https://r2.thesportsdb.com/images/media/team/badge/boe8tv1677602771.png"],
      ["Atlético Nacional", "https://r2.thesportsdb.com/images/media/team/badge/efl4o41576157720.png"],
      ["LDU Quito", "https://r2.thesportsdb.com/images/media/team/badge/5tf5ch1736404372.png"],
      ["Gimnasia Mendoza", "https://r2.thesportsdb.com/images/media/team/badge/h11mlf1677636958.png"],
      ["Deportivo Garcilaso", "https://r2.thesportsdb.com/images/media/team/badge/me11g41690449129.png"],
      ["Jaguares de Córdoba", "https://r2.thesportsdb.com/images/media/team/badge/7ypl1y1629122579.png"],
      ["Once Caldas", "https://r2.thesportsdb.com/images/media/team/badge/nuh9kd1778085916.png"],
      ["Alianza Lima", "https://r2.thesportsdb.com/images/media/team/badge/y5wov41580040189.png"],
      ["Atlético Grau", "https://r2.thesportsdb.com/images/media/team/badge/ksemw91678411736.png"],
      ["Inter San Carlos", "https://r2.thesportsdb.com/images/media/team/badge/9doqdz1781200489.png"],
      ["Alajuelense", "https://r2.thesportsdb.com/images/media/team/badge/zi9ft21707630526.png"],
    ];

    for (const [team, crest] of expected) {
      await expect(getTeamLogo(team)).resolves.toBe(crest);
    }
  });

  it("retries after a 429 and resolves the badge on the next attempt", async () => {
    const badge = "https://r2.thesportsdb.com/images/media/team/badge/test429.png";
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        return { ok: false, status: 429, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          teams: [{ strTeam: "Retry Test FC", strBadge: badge, strSport: "Soccer" }],
        }),
      };
    }) as unknown as typeof fetch;

    try {
      const logo = await getTeamLogo("Retry Test FC");
      expect(calls).toBeGreaterThanOrEqual(2);
      expect(logo).toBe(badge);
    } finally {
      if (originalFetch) globalThis.fetch = originalFetch;
      else delete (globalThis as { fetch?: typeof fetch }).fetch;
    }
  });

  it("does not cache a failed lookup forever (negative cache TTL)", async () => {
    const badge = "https://r2.thesportsdb.com/images/media/team/badge/testneg.png";
    let failMode = true;
    const originalFetch = globalThis.fetch;
    const originalNow = Date.now;
    let currentTime = originalNow();

    globalThis.fetch = jest.fn().mockImplementation(async () => {
      if (failMode) {
        return { ok: false, status: 429, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          teams: [{ strTeam: "Negative Cache FC", strBadge: badge, strSport: "Soccer" }],
        }),
      };
    }) as unknown as typeof fetch;

    Date.now = jest.fn(() => currentTime);

    try {
      const first = await getTeamLogo("Negative Cache FC");
      expect(first).toBe("");

      failMode = false;
      currentTime += 10 * 60 * 1000 + 1;

      const second = await getTeamLogo("Negative Cache FC");
      expect(second).toBe(badge);
    } finally {
      if (originalFetch) globalThis.fetch = originalFetch;
      else delete (globalThis as { fetch?: typeof fetch }).fetch;
      Date.now = originalNow;
    }
  }, 20000);

  it("peekTeamLogo resolves hardcoded teams synchronously and returns null for unknown", () => {
    expect(peekTeamLogo("Valencia")).toBe("https://r2.thesportsdb.com/images/media/team/badge/dm8l6o1655594864.png");
    expect(peekTeamLogo("Hannover 96")).toBe("https://r2.thesportsdb.com/images/media/team/badge/tqpqqv1473454148.png");
    expect(peekTeamLogo("Talleres Córdoba", "Argentina")).toBe("/talleres-cordoba.png");
    expect(peekTeamLogo("Some Totally Unknown FC 99999")).toBeNull();
  });
});

describe("matchPlLeague", () => {
  it("classifies Messi Cup fixtures without adding it to standings leagues", () => {
    expect(isMenFootballMatch("Messi Cup U16", "River Plate", "AFC Ajax")).toBe(true);
    expect(matchPlLeague("Messi Cup 2026 U16", "River Plate", "AFC Ajax")).toMatchObject({
      id: 9901,
      name: "Messi Cup",
      country: "Internacional",
      slug: "messi-cup",
    });
    expect(SUPPORTED_LEAGUES.some((league) => league.id === 9901)).toBe(false);
  });

  it("maps MLS naming variants to Major League Soccer", () => {
    expect(matchPlLeague("MLS", "Inter Miami", "Atlanta United")?.id).toBe(332);
    expect(matchPlLeague("Major League Soccer", "Inter Miami", "Atlanta United")?.id).toBe(332);
    for (const label of ["MLS 2026", "USA MLS", "USA - MLS 2026", "Major League Soccer 2026", "MLS 2026 Regular Season"]) {
      expect(matchPlLeague(label, "Inter Miami", "Atlanta United")?.id).toBe(332);
    }
    expect(matchPlLeague("MLS Next Pro", "NYRB II", "New England Revolution II")).toBeNull();
  });

  it("maps UEFA Nations League exactly", () => {
    const league = matchPlLeague("UEFA Nations League");
    expect(league).not.toBeNull();
    expect(league?.id).toBe(5);
    expect(league?.name).toBe("UEFA Nations League");
  });

  it("maps CONCACAF Nations League (Spanish agenda name)", () => {
    const league = matchPlLeague("Liga de Naciones de la CONCACAF");
    expect(league).not.toBeNull();
    expect(league?.id).toBe(6);
    expect(league?.name).toBe("CONCACAF Nations League");
    expect(league?.name).not.toBe("CONCACAF Champions Cup");
  });

  it("maps CONCACAF Nations League (English name)", () => {
    const league = matchPlLeague("CONCACAF Nations League");
    expect(league?.id).toBe(6);
  });

  it("maps CONCACAF Champions Cup to id 18, not Nations League", () => {
    expect(matchPlLeague("CONCACAF Champions Cup")?.id).toBe(18);
    expect(matchPlLeague("CONCACAF Champions League")?.id).toBe(18);
  });

  it("does not turn a generic Cup label into CONCACAF Champions Cup", () => {
    expect(matchPlLeague("Cup", "FC Krasnodar", "Houston Dynamo")).toBeNull();
  });

  it("does not map broad concacaf text to Champions Cup for Nations League names", () => {
    const league = matchPlLeague("Liga de Naciones de la CONCACAF");
    expect(league?.id).not.toBe(18);
  });

  it("still maps club leagues after national-team entries", () => {
    expect(matchPlLeague("Liga Profesional")?.id).toBe(128);
    expect(matchPlLeague("Copa Libertadores")?.id).toBe(13);
    expect(matchPlLeague("Champions League")?.id).toBe(2);
  });

  it("maps the requested domestic cups", () => {
    expect(matchPlLeague("Copa del Rey de España")?.id).toBe(143);
    expect(matchPlLeague("Copa Paraguay 2026")?.id).toBe(501);
    expect(matchPlLeague("Copa Uruguay 2026")?.id).toBe(930);
  });

  it("maps generic Serie A with Ecuadorian clubs to Liga Pro", () => {
    const league = matchPlLeague("Serie A", "Barcelona SC", "LDU Quito");
    expect(league).not.toBeNull();
    expect(league?.id).toBe(57);
    expect(league?.country).toBe("Ecuador");
    expect(league?.name).toBe("Liga Pro");
  });

  it("maps Serie A with Independiente del Valle vs Aucas to Liga Pro", () => {
    const league = matchPlLeague("Serie A", "Independiente del Valle", "Aucas");
    expect(league?.id).toBe(57);
    expect(league?.country).toBe("Ecuador");
  });

  it("keeps Italian Serie A clubs in Serie A", () => {
    const league = matchPlLeague("Serie A", "Napoli", "Frosinone");
    expect(league?.id).toBe(135);
    expect(league?.country).toBe("Italia");
  });

  it("does not classify Ecuadorian clubs as Bundesliga", () => {
    expect(matchPlLeague("Bundesliga", "Independiente del Valle", "Aucas")).toBeNull();
  });

  it("routes Chilean clubs out of Uruguay league labels", () => {
    expect(matchPlLeague("Liga AUF Uruguaya", "Cobresal", "Universidad de Concepción")?.id).toBe(265);
    expect(matchPlLeague("Liga AUF Uruguaya", "Huachipato", "O'Higgins")?.id).toBe(265);
    expect(matchPlLeague("Liga AUF Uruguaya", "Wanderers", "Boston River")?.id).toBe(268);
  });

  it("excludes Bolivian league fixtures mislabeled as Uruguay", () => {
    expect(matchPlLeague("Liga AUF Uruguaya", "Universitario de Vinto", "Real Oruro")).toBeNull();
    expect(matchPlLeague("Liga AUF Uruguaya", "Oriente Petrolero", "ABB")).toBeNull();
    expect(matchPlLeague("Copa Libertadores", "The Strongest", "River Plate")?.id).toBe(13);
  });

  it("ignores Panamanian Serie A matches from the fixture", () => {
    const league = matchPlLeague("Serie A", "Academia Costa del Este", "Potros del Este");
    expect(league).toBeNull();
  });

  it("still maps explicit Ecuador Serie A names to Liga Pro", () => {
    const league = matchPlLeague("Serie A Ecuador", "Barcelona SC", "LDU Quito");
    expect(league).not.toBeNull();
    expect(league?.id).toBe(57);
    expect(league?.country).toBe("Ecuador");
    expect(league?.name).toBe("Liga Pro");
  });

  it("rejects women's competitions across common language labels", () => {
    const womenLeagues = [
      "Liga Femenina",
      "Campeonato Brasileiro Feminino",
      "Women's Super League",
      "Serie A Femminile",
      "Bundesliga Frauen",
      "NWSL",
      "Liga F",
    ];
    expect(womenLeagues.filter(isFootballLeagueName)).toEqual([]);
  });

  it("rejects women's matches from gender markers in either team name", () => {
    expect(isMenFootballMatch("Liga Profesional", "Boca Juniors Women", "River Plate")).toBe(false);
    expect(isMenFootballMatch("Liga Profesional", "Boca Juniors", "River Plate Femenino")).toBe(false);
    expect(isMenFootballMatch("Amistosos", "Brazil W", "USA W")).toBe(false);
    expect(isMenFootballMatch("Liga Profesional", "Boca Juniors", "River Plate")).toBe(true);
  });
  it("rejects non-football sports such as NHL", () => {
    expect(isFootballLeagueName("Sports:")).toBe(false);
    expect(isFootballLeagueName("NHL")).toBe(false);
    expect(isFootballLeagueName("NBA")).toBe(false);
    expect(isFootballLeagueName("MLB")).toBe(false);
    expect(isFootballLeagueName("Champions League")).toBe(true);
    expect(matchPlLeague("NHL", "Detroit Red Wings", "New York Rangers")).toBeNull();
    expect(matchPlLeague("NBA", "Los Angeles Lakers", "Boston Celtics")).toBeNull();
    expect(matchPlLeague("MLB", "Yankees", "Red Sox")).toBeNull();
  });

  it("rejects Canadian Premier League instead of mapping it to English Premier League", () => {
    expect(matchPlLeague("Canadian Premier League", "Supra du Quebec", "Inter Toronto")).toBeNull();
    expect(matchPlLeague("Canadian Premier League", "Vancouver FC", "HFX Wanderers")).toBeNull();
    expect(matchPlLeague("CanPL", "Forge", "Cavalry")).toBeNull();
    expect(matchPlLeague("Premier League", "Arsenal", "Liverpool")?.id).toBe(39);
  });
});
