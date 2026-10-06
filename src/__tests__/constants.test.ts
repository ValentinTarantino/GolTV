import {
  SUPPORTED_LEAGUES,
  getChannelsForCountry,
  getBroadcastChannels,
  CHANNEL_SETS,
  matchPlLeague,
  isFootballLeagueName,
} from "@/lib/constants";
import { getTeamLogo } from "@/lib/team-logos";
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
});

describe("matchPlLeague", () => {
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

  it("does not map broad concacaf text to Champions Cup for Nations League names", () => {
    const league = matchPlLeague("Liga de Naciones de la CONCACAF");
    expect(league?.id).not.toBe(18);
  });

  it("still maps club leagues after national-team entries", () => {
    expect(matchPlLeague("Liga Profesional")?.id).toBe(128);
    expect(matchPlLeague("Copa Libertadores")?.id).toBe(13);
    expect(matchPlLeague("Champions League")?.id).toBe(2);
  });

  it("maps generic Serie A to Italy, even when Ecuadorian teams are present", () => {
    const league = matchPlLeague("Serie A", "Barcelona SC", "LDU Quito");
    expect(league).not.toBeNull();
    expect(league?.id).toBe(135);
    expect(league?.country).toBe("Italia");
    expect(league?.name).toBe("Serie A");
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
});
