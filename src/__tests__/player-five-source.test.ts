/** @jest-environment node */
import { parsePlayerFiveChannels, parsePlayerFiveAgenda } from "@/lib/player-five-source";

it("imports only Primera Nacional fixtures with playable options and Argentina dates", () => {
  const event = { evento: "Primera Nacional: Quilmes vs. Chacarita", fecha: "2026-11-03 23:30:00",
    canales: [{ name: "Canal", iframe: "https://example.com/player" }] };
  const result = parsePlayerFiveAgenda({ events: [event,
    { ...event, evento: "Liga Profesional: Boca vs. River" },
    { ...event, competencia: "Primera B Metropolitana" },
    { ...event, competencia: "Primera Nacional Femenina" },
    { ...event, fecha: "invalid" }, { ...event, canales: [] }, null] });
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ homeTeam: "Quilmes", awayTeam: "Chacarita", league: "Primera Nacional", dateISO: "2026-11-04T02:30:00.000Z" });
  for (const competencia of ["B Nacional", "Primera B Nacional", "Nacional B", "Primera Nacional Argentina"]) {
    expect(parsePlayerFiveAgenda({ events: [{ ...event, competencia }] })).toHaveLength(1);
  }
  expect(parsePlayerFiveAgenda(null)).toEqual([]);
});

it("returns each matched event option, without unrelated global channels", () => {
  const data = { events: [{ evento: "Serie A: Sassuolo vs. Fiorentina", canales: [
    { name: "ESPN", options: [
      { name: "HD", iframe: "https://example.com/embed" },
      { name: "HLS", iframe: "https://example.com/live.m3u8" },
      { name: "Duplicate", iframe: "https://example.com/embed" },
      { name: "Bad", iframe: "javascript:alert(1)" },
    ] },
  ] }], channels: [{ name: "Unrelated", iframe: "https://example.com/other" }] };
  const result = parsePlayerFiveChannels(data, "Sassuolo", "Fiorentina");
  expect(result.map(c => c.name)).toEqual(["ESPN · HD", "ESPN · HLS"]);
  expect(result.map(c => c.kind)).toEqual(["iframe", "hls"]);
  expect(parsePlayerFiveChannels(data, "Boca Juniors", "River Plate")).toEqual([]);
});

it("handles absent or malformed agenda data", () => {
  expect(parsePlayerFiveChannels(null, "A", "B")).toEqual([]);
  expect(parsePlayerFiveChannels({ events: [null, { evento: "NBA: A vs B", canales: [] }] }, "A", "B")).toEqual([]);
});
