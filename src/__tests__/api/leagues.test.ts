/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { GET } from "@/app/api/leagues/route";

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe("/api/leagues", () => {
  it("returns 200 with array of leagues", async () => {
    const req = makeRequest("http://localhost/api/leagues");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(data.leagues)).toBe(true);
  });

  it("each league has required fields", async () => {
    const req = makeRequest("http://localhost/api/leagues");
    const res = await GET(req);
    const data = await res.json();

    for (const league of data.leagues) {
      expect(league).toHaveProperty("id");
      expect(league).toHaveProperty("name");
      expect(league).toHaveProperty("country");
      expect(league).toHaveProperty("slug");
    }
  });
});
