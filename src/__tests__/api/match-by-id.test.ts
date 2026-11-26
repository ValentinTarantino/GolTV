/**
 * @jest-environment node
 */
jest.mock("@/lib/agenda-fixture", () => ({
  hashSlug: jest.fn((slug: string) => {
    let hash = 0;
    for (let i = 0; i < slug.length; i++) {
      hash = ((hash << 5) - hash + slug.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }),
  findAgendaFixtureById: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/grid-source", () => ({
  findGridStreams: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/secondary-source", () => ({
  findSecondaryStreams: jest.fn().mockResolvedValue([]),
  fetchSecondaryAgenda: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/player-five-source", () => ({
  findPlayerFiveStreams: jest.fn().mockResolvedValue([]),
  fetchPlayerFiveAgenda: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/lpf-source", () => ({
  findLpfStreams: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/primary-player-source", () => ({
  findPrimaryStreams: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/player-six-source", () => ({
  findPlayerSixStreams: jest.fn().mockResolvedValue([]),
}));

import { GET } from "@/app/api/matches/[matchId]/route";
import { findAgendaFixtureById, hashSlug } from "@/lib/agenda-fixture";
import { findGridStreams } from "@/lib/grid-source";
import { findSecondaryStreams } from "@/lib/secondary-source";
import { findLpfStreams } from "@/lib/lpf-source";
import { findPrimaryStreams } from "@/lib/primary-player-source";
import { findPlayerFiveStreams } from "@/lib/player-five-source";
import { openLpfUrl } from "@/lib/sealed-url";

/** Decodes the upstream URL sealed inside an `/api/frame?t=` reference. */
function sealedTarget(url: string): string | null {
  const token = url.split("?t=")[1];
  return token ? openLpfUrl(token) : null;
}

function makeRequest(url: string) {
  return new Request(url);
}

describe("/api/matches/[matchId]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (findAgendaFixtureById as jest.Mock).mockResolvedValue(null);
  });

  it.each([true, false])("routes the new first option to its source (registered match: %s)", async () => {
    const channels = [{ id: "primary-test", name: "Señal 1", url: "https://example.com/player", kind: "iframe" }];
    (findPrimaryStreams as jest.Mock).mockResolvedValueOnce(channels);
    const response = await GET(makeRequest("http://localhost/api/matches/12345?player=6&home=Boca%20Juniors&away=River%20Plate"), { params: Promise.resolve({ matchId: "12345" }) });
    const data = await response.json();
    expect(data.match.channels).toHaveLength(1);
    expect(data.match.channels[0]).toMatchObject({
      id: "primary-test",
      name: "Señal 1",
      kind: "iframe",
    });
    // The provider page is sealed: the payload carries an opaque relay URL.
    expect(data.match.channels[0].url).toMatch(/^\/api\/(frame|proxy)\?t=/);
    expect(sealedTarget(data.match.channels[0].url)).toBe("https://example.com/player");
    expect(findPrimaryStreams).toHaveBeenCalledWith("Boca Juniors", "River Plate");
    expect(findSecondaryStreams).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid matchId", async () => {
    const req = makeRequest("http://localhost/api/matches/abc");
    const res = await GET(req, { params: Promise.resolve({ matchId: "abc" }) });
    expect(res.status).toBe(400);
  });

  it("builds a synthetic match from an agenda fixture id", async () => {
    (findAgendaFixtureById as jest.Mock).mockResolvedValue({
      homeTeam: "Boca Juniors",
      awayTeam: "River Plate",
      leagueName: "Liga Profesional",
      dateISO: new Date().toISOString(),
    });
    (findLpfStreams as jest.Mock).mockResolvedValue([]);

    const req = makeRequest("http://localhost/api/matches/12345");
    const res = await GET(req, { params: Promise.resolve({ matchId: "12345" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.match).toBeDefined();
    expect(data.match.id).toBe(12345);
    expect(data.match.homeTeam.name).toBe("Boca Juniors");
    expect(findAgendaFixtureById).toHaveBeenCalledWith(12345);
  });

  it("does not reuse player 3 channels when player 1 has no signal", async () => {
    (findAgendaFixtureById as jest.Mock).mockResolvedValue({
      homeTeam: "Boca Juniors",
      awayTeam: "River Plate",
      leagueName: "Liga Profesional",
      dateISO: new Date().toISOString(),
    });
    (findSecondaryStreams as jest.Mock).mockResolvedValue([]);

    const req = makeRequest("http://localhost/api/matches/12345?player=1");
    const res = await GET(req, { params: Promise.resolve({ matchId: "12345" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.match.channels).toEqual([]);
  });

  it("returns 404 when match not found and no fallback params", async () => {
    const req = makeRequest("http://localhost/api/matches/99999");
    const res = await GET(req, { params: Promise.resolve({ matchId: "99999" }) });
    expect(res.status).toBe(404);
  });

  it("creates synthetic match for player 3 with team params", async () => {
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

  it.each([true, false])("keeps all source options in Player 1 without a kickoff restriction", async () => {
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
    expect(data.match.channels).toHaveLength(channels.length);
    data.match.channels.forEach((channel: { id: string; url: string }, index: number) => {
      expect(channel.id).toBe(channels[index].id);
      expect(channel.url).toMatch(/^\/api\/(frame|proxy)\?t=/);
      expect(sealedTarget(channel.url)).toBe(channels[index].url);
    });
    expect(findPrimaryStreams).not.toHaveBeenCalled();
  });

  it("resolves board signals for player 3 matches", async () => {
    (findGridStreams as jest.Mock).mockResolvedValue([
      { id: "grid-abc123", name: "Señal 1", url: "/api/hls?t=token", kind: "hls" },
    ]);

    const req = makeRequest(
      "http://localhost/api/matches/99999?player=3&home=Platense&away=Estudiantes&league=Copa%20Argentina"
    );
    const res = await GET(req, {
      params: Promise.resolve({ matchId: "99999" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(findGridStreams).toHaveBeenCalledWith("Platense", "Estudiantes");
    expect(data.match.channels.length).toBeGreaterThan(0);
    expect(data.match.channels[0].kind).toBe("hls");
  });

  it("uses the LPF board source when player=2", async () => {
    (findLpfStreams as jest.Mock).mockResolvedValue([
      { id: "lpf-abc123", name: "Fuente 1", url: "/api/lpf/stream?t=token", kind: "hls" },
    ]);

    const req = makeRequest(
      "http://localhost/api/matches/99999?player=2&home=Boca&away=River&league=Liga"
    );
    const res = await GET(req, {
      params: Promise.resolve({ matchId: "99999" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(findLpfStreams).toHaveBeenCalledWith("Boca", "River");
    expect(data.match.channels[0].kind).toBe("hls");
    expect(data.match.channels[0].url).toContain("/api/lpf/stream");
  });

  it("uses the player six source when player=8", async () => {
    const { findPlayerSixStreams } = jest.requireMock("@/lib/player-six-source");
    (findPlayerSixStreams as jest.Mock).mockResolvedValue([
      { id: "p6-1", name: "Señal", url: "https://example.com/embed", kind: "iframe" },
    ]);

    const req = makeRequest(
      "http://localhost/api/matches/99999?player=8&home=Boca&away=River&league=Liga"
    );
    const res = await GET(req, {
      params: Promise.resolve({ matchId: "99999" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(findPlayerSixStreams).toHaveBeenCalledWith("Boca", "River");
  });

  it("uses the player five source when player=5", async () => {
    (findPlayerFiveStreams as jest.Mock).mockResolvedValue([
      { id: "p5-1", name: "Canal", url: "https://example.com/embed", kind: "iframe", provider: "player-five" },
    ]);

    const req = makeRequest(
      "http://localhost/api/matches/99999?player=5&home=Gimnasia&away=Tristan&league=Primera%20Nacional"
    );
    const res = await GET(req, {
      params: Promise.resolve({ matchId: "99999" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(findPlayerFiveStreams).toHaveBeenCalledWith("Gimnasia", "Tristan");
  });

  it("rejects removed player modes 4 and 7", async () => {
    const req4 = makeRequest(
      "http://localhost/api/matches/99999?player=4&home=Boca&away=River&league=Liga"
    );
    const res4 = await GET(req4, { params: Promise.resolve({ matchId: "99999" }) });
    // player=4 fails validation now
    expect(res4.status).toBe(400);

    const req7 = makeRequest(
      "http://localhost/api/matches/99999?player=7&home=Boca&away=River&league=Liga"
    );
    const res7 = await GET(req7, { params: Promise.resolve({ matchId: "99999" }) });
    expect(res7.status).toBe(400);
  });
});
