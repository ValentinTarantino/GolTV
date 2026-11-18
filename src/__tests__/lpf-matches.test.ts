/**
 * @jest-environment node
 */
import {
  competitionFromUri,
  extractAngulismoPlayers,
  isPrimeraNacionalEvent,
} from "@/lib/lpf-matches";

describe("lpf matches source", () => {
  describe("competitionFromUri", () => {
    it("reads the tournament the provider encodes in its path", () => {
      expect(
        competitionFromUri("/ru/live/Football/119243-Spain-Copa-del-Rey/772080218-Alcoyano-Mallorca")
      ).toBe("Spain. Copa del Rey");
    });

    it("falls back to the plain name when there is no country", () => {
      expect(competitionFromUri("/live/Football/77-Friendly/1-A-B")).toBe("Friendly");
    });

    it("returns null when the path has no tournament", () => {
      expect(competitionFromUri(undefined)).toBeNull();
      expect(competitionFromUri("/live/Football/")).toBeNull();
    });
  });

  describe("isPrimeraNacionalEvent", () => {
    it("accepts the Primera Nacional of the agenda", () => {
      expect(
        isPrimeraNacionalEvent({
          evento: "Primera Nacional: Almirante Brown vs San Telmo",
          competencia: "Primera Nacional",
        })
      ).toBe(true);
    });

    it("accepts the competition field of the aggregator", () => {
      expect(
        isPrimeraNacionalEvent({
          title: "Almirante Brown vs San Telmo",
          category: "Primera Nacional",
        })
      ).toBe(true);
    });

    it("rejects the other competitions", () => {
      expect(isPrimeraNacionalEvent({ evento: "UEFA Nations League: Islandia vsės Latest", competencia: "UEFA Nations League" })).toBe(false);
      expect(isPrimeraNacionalEvent({ evento: "Liga 1: UTC Cajamarca vs Los Chankas", competencia: "Liga 1 (Perú)" })).toBe(false);
      expect(isPrimeraNacionalEvent({ evento: "ATP: Alcaraz vs Tiafoe", competencia: "ATP WTA" })).toBe(false);
    });
  });

  describe("extractAngulismoPlayers", () => {
    it("reads the options of the agenda", () => {
      const players = extractAngulismoPlayers({
        evento: "Primera Nacional: A vs B",
        canales: [
          {
            name: "ESPN 2",
            options: [
              { name: "Opción 1", iframe: "https://tvlibre.st/html/fl/?get=abc" },
              { name: "Opción 2", iframe: "https://stream-xhd.com/live1.php?stream=espn2" },
            ],
          },
        ],
      });

      expect(players).toHaveLength(2);
      expect(players[0].name).toContain("ESPN 2");
      expect(players[0].iframe).toBe("https://tvlibre.st/html/fl/?get=abc");
    });

    it("reads the link of the aggregator", () => {
      const players = extractAngulismoPlayers({
        title: "A vs B",
        category: "Primera Nacional",
        canales: [{ name: "Canal", link: "https://la20hd.com/vivo/canales.php?stream=x" }],
      });

      expect(players).toHaveLength(1);
      expect(players[0].iframe).toBe("https://la20hd.com/vivo/canales.php?stream=x");
    });

    it("returns nothing when the event has no channels", () => {
      expect(extractAngulismoPlayers({ evento: "Primera Nacional: A vs B" })).toEqual([]);
    });
  });
});
