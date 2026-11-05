/**
 * @jest-environment node
 */
jest.mock("@/lib/api-football", () => ({
  getMatchById: jest.fn(),
}));

jest.mock("@/lib/streaming", () => ({
  getStreamsForMatch: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/agenda-source", () => ({
  getAgendaStream: jest.fn(),
  findAgendaStreams: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/event-source", () => ({
  findEventStreams: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/secondary-source", () => ({
  findSecondaryStreams: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/player-two-source", () => ({
  findPlayerTwoStreams: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/primary-player-source", () => ({
  findPrimaryStreams: jest.fn().mockResolvedValue([]),
}));

import { GET } from "@/app/api/matches/[matchId]/route";
import { getMatchById } from "@/lib/api-football";
import { getStreamsForMatch } from "@/lib/streaming";
import { findAgendaStreams } from "@/lib/agenda-source";
import { findEventStreams } from "@/lib/event-source";
import { findSecondaryStreams } from "@/lib/secondary-source";
import { findPlayerTwoStreams } from "@/lib/player-two-source";
import { findPrimaryStreams } from "@/lib/primary-player-source";
import type { Match } from "@/lib/types";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 12345,
    league: { id: 128, name: "Liga Profesional", country: "Argentina", logo: "", flag: "", slug: "liga-profesional" },
    homeTeam: { id: 1, name: "Boca Juniors", logo: "" },
    awayTeam: { id: 2, name: "River Plate", logo: "" },
    date: new Date().toISOString(),
    timestamp: Math.floor(Date.now() / 1000),
    status: { short: "NS", long: "Próximamente", elapsed: null },
    score: { home: null, away: null },
    channels: [],
    broadcastChannels: [],
    ...overrides,
  };
}

function makeRequest(url: string) {
  return new Request(url);
}

describe("/api/matches/[matchId]", () => {
  it.each([true, false])("routes the new first option to its source (registered match: %s)", async (registered) => {
    (getMatchById as jest.Mock).mockResolvedValue(registered ? makeMatch() : null);
    const channels = [{ id: "primary-test", name: "Señal 1", url: "https://example.com/player", kind: "iframe" }];
    (findPrimaryStreams as jest.Mock).mockResolvedValueOnce(channels);
    const response = await GET(makeRequest("http://localhost/api/matches/12345?player=6&home=Boca%20Juniors&away=River%20Plate"), { params: Promise.resolve({ matchId: "12345" }) });
    const data = await response.json();
    expect(data.match.channels).toEqual(channels);
    expect(findPrimaryStreams).toHaveBeenCalledWith("Boca Juniors", "River Plate");
    expect(findSecondaryStreams).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 for invalid matchId", async () => {
    const req = makeRequest("http://localhost/api/matches/abc");
    const res = await GET(req, { params: Promise.resolve({ matchId: "abc" }) });
    expect(res.status).toBe(400);
  });

  it("returns match with correct structure", async () => {
    (getMatchById as jest.Mock).mockResolvedValue(makeMatch());

    const req = makeRequest("http://localhost/api/matches/12345");
    const res = await GET(req, { params: Promise.resolve({ matchId: "12345" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.match).toBeDefined();
    expect(data.match.id).toBe(12345);
    expect(data.match.homeTeam.name).toBe("Boca Juniors");
  });

  it("adds channels for live matches", async () => {
    const liveMatch = makeMatch({ status: { short: "1H", long: "En Juego", elapsed: 30 } });
    (getMatchById as jest.Mock).mockResolvedValue(liveMatch);
    (getStreamsForMatch as jest.Mock).mockResolvedValue([
      { id: "ch1", name: "Canal 1", url: "http://stream.m3u8" },
    ]);

    const req = makeRequest("http://localhost/api/matches/12345?player=3");
    const res = await GET(req, { params: Promise.resolve({ matchId: "12345" }) });
    const data = await res.json();

    expect(data.match.channels.length).toBeGreaterThan(0);
  });

  it("returns 404 when match not found and no fallback params", async () => {
    (getMatchById as jest.Mock).mockResolvedValue(null);

    const req = makeRequest("http://localhost/api/matches/99999");
    const res = await GET(req, { params: Promise.resolve({ matchId: "99999" }) });
    expect(res.status).toBe(404);
  });

  it("creates synthetic match with event source fallback", async () => {
    (getMatchById as jest.Mock).mockResolvedValue(null);

    const sources = JSON.stringify([{ id: "s1", name: "Test", embedIframe: "https://example.com/embed" }]);
      const req = makeRequest(
        `http://localhost/api/matches/99999?player=3&eventSlug=test-slug&eventSources=${encodeURIComponent(sources)}&home=Boca&away=River&league=Liga`
      );
    const res = await GET(req, {
      params: Promise.resolve({ matchId: "99999" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.match).toBeDefined();
    expect(data.match.homeTeam.name).toBe("Boca");
  });

  it("creates synthetic match with streamId fallback", async () => {
    (getMatchById as jest.Mock).mockResolvedValue(null);
    (getStreamsForMatch as jest.Mock).mockResolvedValue([]);

    const req = makeRequest(
      "http://localhost/api/matches/99999?player=3&streamId=abc123&home=Boca&away=River&league=Liga"
    );
    const res = await GET(req, {
      params: Promise.resolve({ matchId: "99999" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.match).toBeDefined();
    expect(data.match.homeTeam.name).toBe("Boca");
    expect(getStreamsForMatch).toHaveBeenCalledWith("Boca", "River", "abc123");
  });

  it("uses the event source when player=4", async () => {
    (getMatchById as jest.Mock).mockResolvedValue(null);
    (findEventStreams as jest.Mock).mockResolvedValue([
      { id: "pl1", name: "PL Stream", url: "http://pl.stream" },
    ]);

    const req = makeRequest(
      "http://localhost/api/matches/99999?player=4&home=Boca&away=River&league=Liga"
    );
    const res = await GET(req, {
      params: Promise.resolve({ matchId: "99999" }),
    });

    expect(res.status).toBe(200);
    expect(findEventStreams).toHaveBeenCalledWith("Boca", "River");
  });

  it.each([true, false])("keeps all source options in Player 1 without a kickoff restriction (registered match: %s)", async (registered) => {
    (getMatchById as jest.Mock).mockResolvedValue(registered ? makeMatch({
      homeTeam: { id: 0, name: "Platense", logo: "" },
      awayTeam: { id: 0, name: "Estudiantes", logo: "" },
      date: new Date(Date.now() + 3600000).toISOString(),
      timestamp: Math.floor(Date.now() / 1000) + 3600,
    }) : null);
    const channels = [
      { id: "secondary-1", name: "TyC Sports", url: "https://example.com/eventos.html?r=ABC", kind: "iframe" },
      { id: "secondary-2", name: "TyC Sports", url: "https://example.com/eventos.html?r=ABC", kind: "iframe" },
      { id: "secondary-3", name: "Other option", url: "https://example.com/offline-page", kind: "iframe" },
    ];
    (findSecondaryStreams as jest.Mock).mockResolvedValue(channels);

    const req = makeRequest(
      "http://localhost/api/matches/99999?player=1&home=Platense&away=Estudiantes&league=Copa%20Argentina"
    );
    const res = await GET(req, {
      params: Promise.resolve({ matchId: "99999" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(findSecondaryStreams).toHaveBeenCalledWith("Platense", "Estudiantes");
    expect(data.match.channels).toEqual(channels);
    expect(findPrimaryStreams).not.toHaveBeenCalled();
  });

  it("does not reuse player 3 channels when player 1 has no signal", async () => {
    (getMatchById as jest.Mock).mockResolvedValue(makeMatch({
      channels: [{ id: "fl-old", name: "Player 3", url: "https://example.com/player-three" }],
    }));
    (findSecondaryStreams as jest.Mock).mockResolvedValue([]);

    const req = makeRequest("http://localhost/api/matches/12345?player=1");
    const res = await GET(req, { params: Promise.resolve({ matchId: "12345" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.match.channels).toEqual([]);
  });

  it("resolves primary-agenda channels for secondary-only matches (player=3)", async () => {
    (getMatchById as jest.Mock).mockResolvedValue(null);
    (findAgendaStreams as jest.Mock).mockResolvedValue([
      { id: "a1", name: "Canal", url: "https://example.com/embed" },
    ]);

    const req = makeRequest(
      "http://localhost/api/matches/99999?player=3&home=Platense&away=Estudiantes&league=Copa%20Argentina"
    );
    const res = await GET(req, {
      params: Promise.resolve({ matchId: "99999" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(findAgendaStreams).toHaveBeenCalledWith("Platense", "Estudiantes");
    expect(data.match.channels.length).toBeGreaterThan(0);
  });

  it("uses the player-two source when player=2", async () => {
    (getMatchById as jest.Mock).mockResolvedValue(null);
    (findPlayerTwoStreams as jest.Mock).mockResolvedValue([
      { id: "player-two-12345", name: "PlayerTwo", url: "https://player.test/es/player.html?mdata=MTIzNDVfMQ==&ilang=es", kind: "iframe" },
    ]);

    const req = makeRequest(
      "http://localhost/api/matches/99999?player=2&home=Boca&away=River&league=Liga"
    );
    const res = await GET(req, {
      params: Promise.resolve({ matchId: "99999" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(findPlayerTwoStreams).toHaveBeenCalledWith("Boca", "River");
    expect(data.match.channels[0].kind).toBe("iframe");
    expect(data.match.channels[0].url).toContain("player.html?mdata=");
  });
});
