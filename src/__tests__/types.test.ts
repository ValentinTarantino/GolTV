import type { Match, Channel } from "@/lib/types";

const mockChannel: Channel = {
  id: "test-channel",
  name: "Test Channel",
  url: "https://example.com/stream.m3u8",
};

const mockMatch: Match = {
  id: 12345,
  league: {
    id: 128,
    name: "Liga Profesional",
    country: "Argentina",
    logo: "https://example.com/logo.png",
    flag: "🇦🇷",
    slug: "liga-argentina",
  },
  homeTeam: {
    id: 1,
    name: "Boca Juniors",
    logo: "https://example.com/boca.png",
  },
  awayTeam: {
    id: 2,
    name: "River Plate",
    logo: "https://example.com/river.png",
  },
  date: "2026-09-17T14:30:00+00:00",
  timestamp: Math.floor(Date.now() / 1000) + 3600,
  status: {
    short: "NS",
    long: "Not Started",
    elapsed: null,
  },
  score: {
    home: null,
    away: null,
  },
  channels: [mockChannel],
  broadcastChannels: ["TyC Sports", "ESPN"],
};

describe("Match type", () => {
  it("has required fields", () => {
    expect(mockMatch.id).toBeDefined();
    expect(mockMatch.league).toBeDefined();
    expect(mockMatch.homeTeam).toBeDefined();
    expect(mockMatch.awayTeam).toBeDefined();
    expect(mockMatch.date).toBeDefined();
    expect(mockMatch.timestamp).toBeDefined();
    expect(mockMatch.status).toBeDefined();
    expect(mockMatch.score).toBeDefined();
  });

  it("has league with required fields", () => {
    expect(mockMatch.league.id).toBeDefined();
    expect(mockMatch.league.name).toBeDefined();
    expect(mockMatch.league.country).toBeDefined();
    expect(mockMatch.league.slug).toBeDefined();
  });

  it("has teams with required fields", () => {
    expect(mockMatch.homeTeam.id).toBeDefined();
    expect(mockMatch.homeTeam.name).toBeDefined();
    expect(mockMatch.awayTeam.id).toBeDefined();
    expect(mockMatch.awayTeam.name).toBeDefined();
  });

  it("has status with required fields", () => {
    expect(mockMatch.status.short).toBeDefined();
    expect(mockMatch.status.long).toBeDefined();
  });
});

describe("Channel type", () => {
  it("has required fields", () => {
    expect(mockChannel.id).toBeDefined();
    expect(mockChannel.name).toBeDefined();
    expect(mockChannel.url).toBeDefined();
  });

  it("url is a valid string", () => {
    expect(typeof mockChannel.url).toBe("string");
    expect(mockChannel.url.length).toBeGreaterThan(0);
  });
});
