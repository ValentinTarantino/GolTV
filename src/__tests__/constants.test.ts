import {
  SUPPORTED_LEAGUES,
  getChannelsForCountry,
  getBroadcastChannels,
  CHANNEL_SETS,
} from "@/lib/constants";

describe("SUPPORTED_LEAGUES", () => {
  it("contains Liga Profesional Argentina", () => {
    const liga = SUPPORTED_LEAGUES.find((l) => l.id === 128);
    expect(liga).toBeDefined();
    expect(liga?.name).toBe("Liga Profesional");
    expect(liga?.country).toBe("Argentina");
  });

  it("contains Champions League", () => {
    const champions = SUPPORTED_LEAGUES.find((l) => l.id === 2);
    expect(champions).toBeDefined();
    expect(champions?.name).toBe("Champions League");
  });

  it("contains Premier League", () => {
    const premier = SUPPORTED_LEAGUES.find((l) => l.id === 39);
    expect(premier).toBeDefined();
    expect(premier?.name).toBe("Premier League");
  });

  it("has unique IDs", () => {
    const ids = SUPPORTED_LEAGUES.map((l) => l.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
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
    expect(channels[0]).toHaveProperty("name");
    expect(channels[0]).toHaveProperty("url");
  });

  it("returns Brazilian channels", () => {
    const channels = getChannelsForCountry("Brasil");
    expect(channels.length).toBeGreaterThan(0);
  });

  it("returns default channels for unknown country", () => {
    const channels = getChannelsForCountry("PaisDesconocido");
    expect(channels).toEqual(CHANNEL_SETS.default);
  });
});

describe("getBroadcastChannels", () => {
  it("returns channels for Liga Profesional", () => {
    const channels = getBroadcastChannels(128);
    expect(channels).toContain("TyC Sports");
    expect(channels).toContain("ESPN");
  });

  it("returns default channels for unknown league", () => {
    const channels = getBroadcastChannels(999999);
    expect(channels).toEqual(["TyC Sports", "ESPN", "Fox Sports"]);
  });

  it("returns channels for Premier League", () => {
    const channels = getBroadcastChannels(39);
    expect(channels.length).toBeGreaterThan(0);
  });
});
