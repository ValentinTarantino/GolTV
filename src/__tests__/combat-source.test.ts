import { toCombatMatch } from "@/lib/combat-source";

describe("combat-source toCombatMatch", () => {
  const base = {
    id: 2710,
    title: "Amari Jones vs DeAundre Pettus",
    sport: "boxing",
    sport_name: "Boxing",
    starts_at: "2026-11-20T13:15:00Z",
    timestamp: 1795180500000,
    live: false,
    finished: false,
    home: { name: "Amari Jones" },
    away: { name: "DeAundre Pettus" },
    streams: [],
  };

  it("keeps boxing matches", () => {
    const m = toCombatMatch(base);
    expect(m).not.toBeNull();
    expect(m?.id).toBe(2710);
    expect(m?.sport).toBe("boxing");
    expect(m?.home).toBe("Amari Jones");
    expect(m?.away).toBe("DeAundre Pettus");
  });

  it("keeps mma matches", () => {
    const m = toCombatMatch({ ...base, sport: "mma", sport_name: "MMA" });
    expect(m?.sport).toBe("mma");
  });

  it("drops other sports", () => {
    expect(toCombatMatch({ ...base, sport: "football" })).toBeNull();
    expect(toCombatMatch({ ...base, sport: undefined })).toBeNull();
  });

  it("drops entries without id or title", () => {
    expect(toCombatMatch({ ...base, id: undefined })).toBeNull();
    expect(toCombatMatch({ ...base, title: "" })).toBeNull();
  });

  it("defaults missing names and flags", () => {
    const m = toCombatMatch({ id: 1, title: "A vs B", sport: "boxing" });
    expect(m?.live).toBe(false);
    expect(m?.finished).toBe(false);
    expect(m?.streams).toEqual([]);
    expect(m?.sportName).toBe("Boxing");
  });

  it("preserves streams", () => {
    const m = toCombatMatch({
      ...base,
      streams: [{ id: 1, embed_url: "https://example.com/e/1", name: "Server1" }],
    });
    expect(m?.streams).toHaveLength(1);
    expect(m?.streams[0].embed_url).toBe("https://example.com/e/1");
  });
});
