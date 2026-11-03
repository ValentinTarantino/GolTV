/** @jest-environment node */
import { parsePlayerFiveChannels } from "@/lib/player-five-source";

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
