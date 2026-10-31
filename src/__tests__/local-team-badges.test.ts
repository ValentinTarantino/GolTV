/** @jest-environment node */
import { readFileSync } from "node:fs";
import path from "node:path";
import catalog from "@/data/team-badges.json";
import { getLocalTeamBadge } from "@/lib/local-team-badges";
import { getTeamLogo, peekTeamLogo } from "@/lib/team-logos";

describe("local club crests", () => {
  it("every registered alias resolves to a real local PNG without any network requests", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn().mockRejectedValue(new Error("offline"));
    globalThis.fetch = fetchMock;
    try {
      for (const entry of catalog) {
        const bytes = readFileSync(path.join(process.cwd(), "public", entry.file));
        expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        expect(bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(16);
        expect(bytes.readUInt32BE(20)).toBeGreaterThanOrEqual(16);
        for (const name of entry.names) {
          expect(getLocalTeamBadge(name, entry.country)).toBe(entry.file);
          expect(peekTeamLogo(name, entry.country)).toBe(entry.file);
          await expect(getTeamLogo(name, entry.country)).resolves.toBe(entry.file);
        }
      }
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it.each([
    ["Eibar", "España", 3752], ["Almería", "España", 6832], ["Málaga", "España", 99],
    ["Córdoba", "España", 8447], ["Albacete", "España", 2737], ["Sabadell", "España", 11487],
    ["Milan", "Italia", 103], ["Karlsruher SC", "Alemania", 4471], ["Heidenheim", "Alemania", 6418],
    ["Delfin", "Ecuador", 1011], ["Emelec", "Ecuador", 2668], ["Leones del Norte", "Ecuador", 131702],
    ["Charlotte", "Estados Unidos", 21300], ["Orlando City SC", "Estados Unidos", 12011],
    ["Cincinnati", "Estados Unidos", 18267], ["Philadelphia Union", "Estados Unidos", 10739],
    ["Columbus Crew", "Estados Unidos", 183], ["DC United", "Estados Unidos", 193],
    ["New York City", "Estados Unidos", 17606], ["CF Montréal", "Estados Unidos", 9720],
    ["St. Louis City", "Estados Unidos", 21812], ["San Diego", "Estados Unidos", 22529],
    ["Austin", "Estados Unidos", 20906], ["SJ Earthquakes", "Estados Unidos", 191],
    ["Real Salt Lake", "Estados Unidos", 4771], ["Colorado Rapids", "Estados Unidos", 184],
    ["Chicago Fire", "Estados Unidos", 182],
  ])("resolves screenshot team %s (%s)", async (team, country, id) => {
    const expected = `/badges/espn-${id}.png`;
    expect(peekTeamLogo(team, country)).toBe(expected);
    await expect(getTeamLogo(team, country)).resolves.toBe(expected);
  });

  it("requires country context for names shared by clubs and accepts country translations", () => {
    expect(getLocalTeamBadge("Barcelona", "España")).toBe("/badges/espn-83.png");
    expect(getLocalTeamBadge("Barcelona", "Ecuador")).toBe("/badges/espn-2686.png");
    expect(getLocalTeamBadge("Barcelona")).toBeNull();
    expect(getLocalTeamBadge("Barcelona", "Argentina")).toBeNull();
    expect(getLocalTeamBadge("Córdoba", "Argentina")).toBeNull();
    expect(getLocalTeamBadge("Eibar", "Spain")).toBe("/badges/espn-3752.png");
    expect(getLocalTeamBadge("Charlotte", "USA")).toBe("/badges/espn-21300.png");
    expect(getLocalTeamBadge("Milan", "Italy")).toBe("/badges/espn-103.png");
    expect(getLocalTeamBadge("Milan", "Europa")).toBe("/badges/espn-103.png");
    expect(getLocalTeamBadge("Barcelona", "Internacional")).toBeNull();
  });
});
