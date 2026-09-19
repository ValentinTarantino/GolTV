import {
  stableStreamMatchId,
  teamsMatch,
  matchTeamsPair,
  unwrapNestedStreamUrl,
  isValidHlsManifest,
} from "@/lib/streaming";

describe("stableStreamMatchId", () => {
  it("returns a deterministic id in the synthetic range", () => {
    const a = stableStreamMatchId("abc-123");
    const b = stableStreamMatchId("abc-123");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(800_000_000);
    expect(a).toBeLessThan(900_000_000);
  });

  it("produces different ids for different stream ids", () => {
    expect(stableStreamMatchId("match-1")).not.toBe(stableStreamMatchId("match-2"));
  });
});

describe("unwrapNestedStreamUrl", () => {
  it("unwraps football-live-stream wrapper urls", () => {
    const nested = "https://cdn.example.com/live/index.m3u8";
    const wrapped = `https://football-live-stream.online/?url=${encodeURIComponent(nested)}`;
    expect(unwrapNestedStreamUrl(wrapped)).toBe(nested);
  });
});

describe("isValidHlsManifest", () => {
  it("accepts real HLS manifests", () => {
    expect(isValidHlsManifest("#EXTM3U\n#EXTINF:4,\nseg.ts\n")).toBe(true);
  });

  it("rejects HTML and 403-wrapped garbage", () => {
    expect(isValidHlsManifest("<!DOCTYPE html><html>403</html>")).toBe(false);
    expect(
      isValidHlsManifest(
        "https://football-live-stream.online/?url=https%3A%2F%2Fx%2F%253C!DOCTYPE"
      )
    ).toBe(false);
  });
});

describe("teamsMatch", () => {
  it("matches exact and accent-insensitive names", () => {
    expect(teamsMatch("Atlético Madrid", "Atletico Madrid")).toBe(true);
    expect(teamsMatch("Boca Juniors", "Boca Juniors")).toBe(true);
  });

  it("does not match on weak stopwords alone", () => {
    expect(teamsMatch("Real Madrid", "Real Sociedad")).toBe(false);
    expect(teamsMatch("Manchester United", "Newcastle United")).toBe(false);
  });

  it("matches when significant tokens align", () => {
    expect(teamsMatch("CA River Plate", "River Plate")).toBe(true);
    expect(teamsMatch("Club Atlético Independiente", "Independiente")).toBe(true);
  });
});

describe("matchTeamsPair", () => {
  it("matches home/away and swapped sides", () => {
    expect(
      matchTeamsPair("Boca Juniors", "River Plate", "Boca Juniors", "River Plate")
    ).toBe(true);
    expect(
      matchTeamsPair("Boca Juniors", "River Plate", "River Plate", "Boca Juniors")
    ).toBe(true);
  });

  it("rejects mismatched pairs", () => {
    expect(
      matchTeamsPair("Boca Juniors", "River Plate", "Racing Club", "San Lorenzo")
    ).toBe(false);
  });
});
