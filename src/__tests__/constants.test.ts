import {
  SUPPORTED_LEAGUES,
  getChannelsForCountry,
  getBroadcastChannels,
  CHANNEL_SETS,
} from "@/lib/constants";
import { isAllowedStreamLeague } from "@/lib/streaming";

describe("SUPPORTED_LEAGUES", () => {
  it("contains Liga Profesional Argentina", () => {
    const liga = SUPPORTED_LEAGUES.find((l) => l.id === 128);
    expect(liga).toBeDefined();
    expect(liga?.name).toBe("Liga Profesional");
    expect(liga?.country).toBe("Argentina");
  });

  it("uses display names for Chile and Uruguay", () => {
    expect(SUPPORTED_LEAGUES.find((l) => l.id === 265)?.name).toBe("Liga de Primera");
    expect(SUPPORTED_LEAGUES.find((l) => l.id === 268)?.name).toBe("Liga AUF Uruguaya");
  });

  it("contains Libertadores, Champions and Premier", () => {
    expect(SUPPORTED_LEAGUES.some((l) => l.id === 13)).toBe(true);
    expect(SUPPORTED_LEAGUES.some((l) => l.id === 2)).toBe(true);
    expect(SUPPORTED_LEAGUES.some((l) => l.id === 39)).toBe(true);
  });

  it("excludes Liga MX and Colombia", () => {
    expect(SUPPORTED_LEAGUES.some((l) => l.id === 262)).toBe(false);
    expect(SUPPORTED_LEAGUES.some((l) => l.id === 239)).toBe(false);
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

  it("returns Chilean and Uruguayan channels", () => {
    expect(getChannelsForCountry("Chile").length).toBeGreaterThan(0);
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
    expect(isAllowedStreamLeague("Liga de Primera")).toBe(true);
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
