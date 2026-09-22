/**
 * @jest-environment node
 */
jest.mock("@/lib/api-football", () => ({
  getApiFootballUsage: jest.fn().mockReturnValue({ keys: [], totalUsed: 0, totalLimit: 140 }),
}));

jest.mock("@/lib/futbollibre", () => ({
  getFLUsage: jest.fn().mockReturnValue({ used: 0, limit: 200, date: "2026-09-22" }),
}));

jest.mock("@/lib/streaming", () => ({
  getStreamUsage: jest.fn().mockReturnValue({ used: 0, limit: 35, date: "2026-09-22" }),
}));

import { GET } from "@/app/api/health/route";

describe("/api/health", () => {
  it("returns 200 with timestamp", async () => {
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.timestamp).toBeDefined();
    expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
  });

  it("includes all three API sections", async () => {
    const res = await GET();
    const data = await res.json();

    expect(data.apis).toBeDefined();
    expect(data.apis.apiFootball).toBeDefined();
    expect(data.apis.futbolLibre).toBeDefined();
    expect(data.apis.rapidApi).toBeDefined();
  });

  it("each API section has description", async () => {
    const res = await GET();
    const data = await res.json();

    expect(data.apis.apiFootball.description).toContain("API-Football");
    expect(data.apis.futbolLibre.description).toContain("FutbolLibre");
    expect(data.apis.rapidApi.description).toContain("RapidAPI");
  });
});
