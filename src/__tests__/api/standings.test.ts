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
    expect(data.error).toMatch(/missing/i);
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

    const req = makeRequest("http://localhost/api/standings?league=128");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.tabs).toHaveLength(1);
    expect(data.tabs[0].tables[0].standings[0].team.name).toBe("Boca Juniors");
  });

  it("returns empty structure when league has no data", async () => {
    (fetchLeagueStandings as jest.Mock).mockResolvedValue({ tabs: [], brackets: [] });

    const req = makeRequest("http://localhost/api/standings?league=99999");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.tabs).toHaveLength(0);
    expect(data.brackets).toHaveLength(0);
  });
});
