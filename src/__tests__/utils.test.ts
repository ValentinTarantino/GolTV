import {
  isLive,
  isFinished,
  isUpcoming,
  isViewable,
  formatTime,
  getStatusLabel,
  getCountdown,
} from "@/lib/utils";

describe("isLive", () => {
  it("returns true for live statuses", () => {
    expect(isLive("1H")).toBe(true);
    expect(isLive("2H")).toBe(true);
    expect(isLive("HT")).toBe(true);
    expect(isLive("ET")).toBe(true);
    expect(isLive("P")).toBe(true);
  });

  it("returns false for non-live statuses", () => {
    expect(isLive("NS")).toBe(false);
    expect(isLive("FT")).toBe(false);
    expect(isLive("TBD")).toBe(false);
  });
});

describe("isFinished", () => {
  it("returns true for finished statuses", () => {
    expect(isFinished("FT")).toBe(true);
    expect(isFinished("AET")).toBe(true);
    expect(isFinished("PEN")).toBe(true);
  });

  it("returns false for non-finished statuses", () => {
    expect(isFinished("NS")).toBe(false);
    expect(isFinished("1H")).toBe(false);
  });
});

describe("isUpcoming", () => {
  it("returns true for upcoming statuses", () => {
    expect(isUpcoming("NS")).toBe(true);
    expect(isUpcoming("TBD")).toBe(true);
  });

  it("returns false for non-upcoming statuses", () => {
    expect(isUpcoming("1H")).toBe(false);
    expect(isUpcoming("FT")).toBe(false);
  });
});

describe("isViewable", () => {
  it("returns true for live matches", () => {
    expect(isViewable("1H", Date.now() / 1000 + 3600)).toBe(true);
  });

  it("returns true for NS match past its timestamp", () => {
    const pastTimestamp = Date.now() / 1000 - 3600;
    expect(isViewable("NS", pastTimestamp)).toBe(true);
  });

  it("returns false for NS match before its timestamp", () => {
    const futureTimestamp = Date.now() / 1000 + 3600;
    expect(isViewable("NS", futureTimestamp)).toBe(false);
  });

  it("returns false for finished matches", () => {
    expect(isViewable("FT", Date.now() / 1000 - 3600)).toBe(false);
  });
});

describe("formatTime", () => {
  it("formats ISO date string to time", () => {
    const result = formatTime("2026-09-17T14:30:00+00:00");
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

describe("getStatusLabel", () => {
  it("returns correct label for live statuses", () => {
    expect(getStatusLabel("1H", 45)).toBe("45'");
    expect(getStatusLabel("HT", null)).toBe("ET");
    expect(getStatusLabel("ET", 105)).toBe("105' (ET)");
  });

  it("returns correct label for finished", () => {
    expect(getStatusLabel("FT", null)).toBe("Final");
  });

  it("returns correct label for upcoming", () => {
    expect(getStatusLabel("NS", null)).toBe("");
  });

  it("returns special status labels", () => {
    expect(getStatusLabel("SUSP", null)).toBe("Susp.");
    expect(getStatusLabel("PST", null)).toBe("Posterg.");
    expect(getStatusLabel("CANC", null)).toBe("Canc.");
  });
});

describe("getCountdown", () => {
  it("returns Comenzando for past timestamps", () => {
    const past = Date.now() / 1000 - 100;
    expect(getCountdown(past)).toBe("Comenzando...");
  });

  it("returns hours and minutes for near future", () => {
    const future = Date.now() / 1000 + 7200;
    const result = getCountdown(future);
    expect(result).toMatch(/h/);
  });

  it("returns days for far future", () => {
    const future = Date.now() / 1000 + 172800;
    const result = getCountdown(future);
    expect(result).toMatch(/d/);
  });
});
