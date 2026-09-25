/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
jest.mock("@/lib/api-football", () => ({
  getApiFootballUsage: jest.fn().mockReturnValue({ keys: [], totalUsed: 0, totalLimit: 140 }),
}));

jest.mock("@/lib/agenda-source", () => ({
  getAgendaUsage: jest.fn().mockReturnValue({ used: 0, limit: 200, date: "2026-09-22" }),
}));

jest.mock("@/lib/streaming", () => ({
  getStreamUsage: jest.fn().mockReturnValue({ used: 0, limit: 35, date: "2026-09-22" }),
}));

jest.mock("@/lib/cache", () => ({
  getMemoryCacheStats: jest.fn().mockReturnValue({ entries: 0, locks: 0 }),
}));

import { GET } from "@/app/api/health/route";

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe("/api/health", () => {
  it("returns 200 with timestamp", async () => {
    const req = makeRequest("http://localhost/api/health");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.timestamp).toBeDefined();
    expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
  });

  it("includes all three API sections", async () => {
    const req = makeRequest("http://localhost/api/health");
    const res = await GET(req);
    const data = await res.json();

    expect(data.apis).toBeDefined();
    expect(data.apis.apiFootball).toBeDefined();
    expect(data.apis.agendaSource).toBeDefined();
    expect(data.apis.rapidApi).toBeDefined();
  });

  it("each API section has description", async () => {
    const req = makeRequest("http://localhost/api/health");
    const res = await GET(req);
    const data = await res.json();

    expect(data.apis.apiFootball.description).toContain("API-Football");
    expect(data.apis.agendaSource.description).toContain("Agenda");
    expect(data.apis.rapidApi.description).toContain("RapidAPI");
  });
});
