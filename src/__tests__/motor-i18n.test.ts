import { displayMotorsportText } from "@/i18n/dictionaries";

describe("displayMotorsportText", () => {
  it("translates session terms and countries to Spanish", () => {
    expect(displayMotorsportText("Qatar Grand Prix (Qatar) - Practice 1", "es")).toBe(
      "Qatar Gran Premio (QATAR) - Práctica 1"
    );
    expect(displayMotorsportText("Valencia (Spain) - Practice 2", "es")).toBe(
      "Valencia (ESPAÑA) - Práctica 2"
    );
    expect(displayMotorsportText("Adelaide 500 (Australia) - Qualification 1", "es")).toBe(
      "Adelaide 500 (AUSTRALIA) - Clasificación 1"
    );
    expect(displayMotorsportText("Lusail (Qatar) - Practice 1", "es")).toBe(
      "Lusail (QATAR) - Práctica 1"
    );
  });

  it("translates league names", () => {
    expect(displayMotorsportText("Supercars Championship", "es")).toBe("Campeonato Supercars");
    expect(displayMotorsportText("Idemitsu Super Turbo Thailand 2026 Race 5", "es")).toBe(
      "Idemitsu Super Turbo TAILANDIA 2026 Carrera 5"
    );
    expect(displayMotorsportText("2026 FIM MotoMini World Final", "es")).toBe(
      "2026 FIM MotoMini Final Mundial"
    );
  });

  it("leaves English untouched and passes non-Spanish through", () => {
    expect(displayMotorsportText("Qatar Grand Prix (Qatar) - Practice 1", "en")).toBe(
      "Qatar Grand Prix (Qatar) - Practice 1"
    );
    expect(displayMotorsportText("Formula 1", "es")).toBe("Formula 1");
    expect(displayMotorsportText("MotoGP", "es")).toBe("MotoGP");
  });
});
