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

import { GET } from "@/app/api/matches/[matchId]/route";
import { getMatchById } from "@/lib/api-football";
import { getStreamsForMatch } from "@/lib/streaming";
import { findAgendaStreams } from "@/lib/agenda-source";
import { findEventStreams } from "@/lib/event-source";
import { findSecondaryStreams } from "@/lib/secondary-source";
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

    const req = makeRequest("http://localhost/api/matches/12345");
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
        `http://localhost/api/matches/99999?eventSlug=test-slug&eventSources=${encodeURIComponent(sources)}&home=Boca&away=River&league=Liga`
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
      "http://localhost/api/matches/99999?streamId=abc123&home=Boca&away=River&league=Liga"
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

  it("uses the event source when player=2", async () => {
    (getMatchById as jest.Mock).mockResolvedValue(null);
    (findEventStreams as jest.Mock).mockResolvedValue([
      { id: "pl1", name: "PL Stream", url: "http://pl.stream" },
    ]);

    const req = makeRequest(
      "http://localhost/api/matches/99999?player=2&home=Boca&away=River&league=Liga"
    );
    const res = await GET(req, {
      params: Promise.resolve({ matchId: "99999" }),
    });

    expect(res.status).toBe(200);
    expect(findEventStreams).toHaveBeenCalledWith("Boca", "River");
  });

  it("uses the secondary source when player=3", async () => {
    (getMatchById as jest.Mock).mockResolvedValue(null);
    (findSecondaryStreams as jest.Mock).mockResolvedValue([
      { id: "secondary-1", name: "TyC Sports", url: "https://example.com/eventos.html?r=ABC", kind: "iframe" },
    ]);

    const req = makeRequest(
      "http://localhost/api/matches/99999?player=3&home=Platense&away=Estudiantes&league=Copa%20Argentina"
    );
    const res = await GET(req, {
      params: Promise.resolve({ matchId: "99999" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(findSecondaryStreams).toHaveBeenCalledWith("Platense", "Estudiantes");
    expect(data.match.channels[0].kind).toBe("iframe");
  });

  it("resolves primary-agenda channels for secondary-only matches (player=1)", async () => {
    (getMatchById as jest.Mock).mockResolvedValue(null);
    (findAgendaStreams as jest.Mock).mockResolvedValue([
      { id: "a1", name: "Canal", url: "https://example.com/embed" },
    ]);

    const req = makeRequest(
      "http://localhost/api/matches/99999?home=Platense&away=Estudiantes&league=Copa%20Argentina"
    );
    const res = await GET(req, {
      params: Promise.resolve({ matchId: "99999" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(findAgendaStreams).toHaveBeenCalledWith("Platense", "Estudiantes");
    expect(data.match.channels.length).toBeGreaterThan(0);
  });
});
