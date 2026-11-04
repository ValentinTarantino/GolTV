/** @jest-environment node */
import { createCipheriv } from "node:crypto";
import { decodePrimaryFeed, parsePrimaryChannels, findPrimaryStreams } from "@/lib/primary-player-source";

const plain = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const alphabet = [...plain].reverse().join("");
const key = Buffer.alloc(32, 7).toString("base64");

it("decodes authenticated public feed payloads and rejects invalid configuration or ciphertext", () => {
  const data = { matches: [] };
  const iv = Buffer.alloc(12, 2);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  const bytes = Buffer.concat([iv, cipher.update(JSON.stringify(data)), cipher.final(), cipher.getAuthTag()]);
  const encode = (value: Buffer) => "k1" + [...value.toString("base64url")].map(c => alphabet[plain.indexOf(c)]).reverse().join("");
  expect(decodePrimaryFeed(encode(bytes), key, alphabet, plain)).toEqual(data);
  expect(decodePrimaryFeed(JSON.stringify(data), "", "", "")).toEqual(data);
  expect(() => decodePrimaryFeed(encode(bytes), "bad", alphabet, plain)).toThrow();
  bytes[bytes.length - 1] ^= 1;
  expect(() => decodePrimaryFeed(encode(bytes), key, alphabet, plain)).toThrow();
});

it("preserves each feed embed URL, origin alternative, and repeated option", () => {
  const match = { sport: "futbol", league: "Champions League", home: { name: "Villarreal" }, away: { name: "PSG" }, streams: [
    { name: "ESPN 5", origin: "generated", embed_url: "https://wrapper.example/wrapper", real_url: "https://example.com/1.php" },
    { name: "ESPN 5", origin: "native", embed_url: "https://example.com/1.php" },
    { name: "ESPN 5 | OP2", embed_url: "https://example.com/2.php" },
    { name: "Disney+", embed_url: "https://example.com/live.m3u8?token=test" },
    { name: "Repeated URL", embed_url: "https://example.com/2.php" },
    { name: "Generated option without real fallback", origin: "generated", embed_url: "https://wrapper.example/blocked" },
    { real_url: "https://example.com/metadata-only" },
    { embed_url: "javascript:alert(1)" }, { embed_url: "https://user:pass@example.com/" },
  ] };
  const result = parsePrimaryChannels({ matches: [null, { ...match, sport: "basketball" }, match] }, "Villarreal", "PSG");
  expect(result.map(c => c.name)).toEqual([
    "ESPN 5", "ESPN 5", "ESPN 5 | OP2", "Disney+", "Repeated URL", "Generated option without real fallback",
  ]);
  expect(result.map(c => c.kind)).toEqual(["iframe", "iframe", "iframe", "hls", "iframe", "iframe"]);
  expect(result[0].url).toBe("https://wrapper.example/wrapper");
  expect(result[1].url).toBe("https://example.com/1.php");
  expect(new Set(result.map(c => c.id)).size).toBe(result.length);
  expect(result.every(c => c.iframeReferrerPolicy === undefined)).toBe(true);
  expect(parsePrimaryChannels({ matches: [match] }, "Boca", "River")).toEqual([]);
  expect(parsePrimaryChannels(null, "A", "B")).toEqual([]);
});

it("fails closed when unconfigured", async () => {
  const previous = process.env.PRIMARY_PLAYER_AGENDA_URL;
  delete process.env.PRIMARY_PLAYER_AGENDA_URL;
  try { expect(await findPrimaryStreams("Villarreal", "PSG")).toEqual([]); }
  finally {
    if (previous !== undefined) process.env.PRIMARY_PLAYER_AGENDA_URL = previous;
  }
});
