/**
 * @jest-environment node
 */
jest.mock("@/lib/standings", () => ({
  fetchLeagueStandings: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/standings/route";
import { fetchLeagueStandings } from "@/lib/standings";

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe("/api/standings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when league parameter is missing", async () => {
    const req = makeRequest("http://localhost/api/standings");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/leagueId|validation/i);
  });

  it("returns 400 when league is not a number", async () => {
    const req = makeRequest("http://localhost/api/standings?league=abc");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/invalid/i);
  });

  it("returns standings data for valid league", async () => {
    const mockData = {
      tabs: [
        {
          name: "Apertura",
          tables: [
            {
              name: "General",
              standings: [
                { rank: 1, team: { name: "Boca Juniors" }, played: 10, won: 8, drawn: 1, lost: 1, goalsFor: 20, goalsAgainst: 5, goalsDiff: 15, points: 25, trend: [1, 1, 2, 1, 0] },
              ],
            },
          ],
        },
      ],
      brackets: [],
    };
    (fetchLeagueStandings as jest.Mock).mockResolvedValue(mockData);

    const req = makeRequest("http://localhost/api/standings?leagueId=128");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.tabs).toHaveLength(1);
    expect(data.tabs[0].tables[0].standings[0].team.name).toBe("Boca Juniors");
  });

  it("returns empty structure when league has no data", async () => {
    (fetchLeagueStandings as jest.Mock).mockResolvedValue({ tabs: [], brackets: [] });

    const req = makeRequest("http://localhost/api/standings?leagueId=99999");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.tabs).toHaveLength(0);
    expect(data.brackets).toHaveLength(0);
  });

  it("keeps the winner when a knockout match is tied after 90 or 120 minutes", () => {
    const { normalizeBracketMatch } = jest.requireActual("@/lib/standings") as typeof import("@/lib/standings");

    const match = normalizeBracketMatch({
      teams: [{ name: "River Plate" }, { name: "Boca Juniors" }],
      scores: [1, 1],
      winner: 2,
      penalties: [4, 2],
      status: { short_name: "PEN" },
    });

    expect(match.homeScore).toBe("1");
    expect(match.awayScore).toBe("1");
    expect(match.winner).toBe("away");
    expect(match.penalties).toEqual({ home: 4, away: 2 });
    expect(match.decidedByPenalties).toBe(true);
  });

  it("parses Promiedos aggregate scores, 1-based winner fields and penalty status", () => {
    const { normalizeBracketMatch } = jest.requireActual("@/lib/standings") as typeof import("@/lib/standings");

    const match = normalizeBracketMatch({
      teams: [{ name: "Flamengo" }, { name: "Estudiantes de La Plata" }],
      scores: [0, 0],
      agg_scores: [0, 0],
      description: "Global 0 - 0",
      winner: 2,
      to_qualify: 2,
      status: { name: "Por penales", short_name: "Por penales", symbol_name: "Pen" },
    });

    expect(match.winner).toBe("away");
    expect(match.aggregateHomeScore).toBe("0");
    expect(match.aggregateAwayScore).toBe("0");
    expect(match.decidedByPenalties).toBe(true);
    expect(match.status).toContain("Por penales");
    expect(match.penalties).toBeNull();
  });

  it("shows the Fluminense advancement from the real Promiedos penalty-decider shape", () => {
    const { normalizeBracketMatch } = jest.requireActual("@/lib/standings") as typeof import("@/lib/standings");

    const match = normalizeBracketMatch({
      teams: [{ name: "Independiente Rivadavia" }, { name: "Fluminense" }],
      scores: [1, 1],
      agg_scores: [1, 1],
      description: "Global 1 - 1",
      winner: 2,
      to_qualify: 2,
      status: { enum: 3, name: "Por penales", short_name: "Por penales", symbol_name: "Pen" },
      game_time_status_to_display: "Por penales",
    });

    expect(match.winner).toBe("away");
    expect(match.decidedByPenalties).toBe(true);
    expect(match.aggregateHomeScore).toBe("1");
    expect(match.aggregateAwayScore).toBe("1");
  });

  it("recognizes the advancing team when winner is encoded as 1", () => {
    const { normalizeBracketMatch } = jest.requireActual("@/lib/standings") as typeof import("@/lib/standings");

    const match = normalizeBracketMatch({
      teams: [{ name: "Palmeiras" }, { name: "Fluminense" }],
      scores: [0, 1],
      agg_scores: [2, 2],
      winner: 1,
      to_qualify: 1,
      status: { name: "Por penales" },
    });

    expect(match.winner).toBe("home");
    expect(match.decidedByPenalties).toBe(true);
  });
});
