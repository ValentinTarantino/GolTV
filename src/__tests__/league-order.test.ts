/** @jest-environment node */
import { leagueRanks, loadLeagueOrder, sanitizeLeagueOrder, saveLeagueOrder } from "@/lib/league-order";

jest.mock("@/lib/mongo", () => ({
  getDb: jest.fn().mockResolvedValue(null),
}));

describe("league order", () => {
  it("keeps only positive unique integer ids, in order", () => {
    expect(sanitizeLeagueOrder([332, 129, 332, 0, -5, 1.5, "78", "x", null, 39]))
      .toEqual([332, 129, 78, 39]);
  });

  it("returns no order for anything that is not an array", () => {
    expect(sanitizeLeagueOrder(undefined)).toEqual([]);
    expect(sanitizeLeagueOrder(null)).toEqual([]);
    expect(sanitizeLeagueOrder({ order: [1] })).toEqual([]);
    expect(sanitizeLeagueOrder("[1,2]")).toEqual([]);
  });

  it("caps the list so a bad payload cannot grow forever", () => {
    const huge = Array.from({ length: 500 }, (_, index) => index + 1);
    expect(sanitizeLeagueOrder(huge)).toHaveLength(200);
  });

  it("ranks listed leagues by position and unranked ones last", () => {
    const rankOf = leagueRanks([332, 129]);
    expect(rankOf(332)).toBe(0);
    expect(rankOf(129)).toBe(1);
    // Every unranked league shares the same tail rank, so they keep their
    // natural kickoff order among themselves.
    expect(rankOf(39)).toBe(Number.MAX_SAFE_INTEGER);
    expect(rankOf(999)).toBe(rankOf(39));
  });

  it("sorts by rank first and kickoff second", () => {
    const rankOf = leagueRanks([332, 129]);
    const fixtures = [
      { leagueId: 39, timestamp: 1 },
      { leagueId: 129, timestamp: 500 },
      { leagueId: 332, timestamp: 900 },
      { leagueId: 332, timestamp: 100 },
    ];
    const sorted = [...fixtures].sort(
      (a, b) => rankOf(a.leagueId) - rankOf(b.leagueId) || a.timestamp - b.timestamp
    );
    expect(sorted.map((fixture) => `${fixture.leagueId}@${fixture.timestamp}`))
      .toEqual(["332@100", "332@900", "129@500", "39@1"]);
  });

  it("saves and loads the order even without Mongo", async () => {
    const saved = await saveLeagueOrder([267, 265, 129]);
    expect(saved).toEqual({ order: [267, 265, 129], persisted: false });
    // Memory fallback makes the change visible to the same instance at once.
    await expect(loadLeagueOrder()).resolves.toEqual([267, 265, 129]);
  });

  it("treats an empty list as back to the natural order", async () => {
    await saveLeagueOrder([332, 129]);
    const saved = await saveLeagueOrder([]);
    expect(saved.order).toEqual([]);
    await expect(loadLeagueOrder(true)).resolves.toEqual([]);
  });
});
