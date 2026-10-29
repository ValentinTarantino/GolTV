/**
 * @jest-environment node
 */
import { createCipheriv, randomBytes } from "node:crypto";
import {
  decryptFutbolVideosBody,
  parseFutbolVideosMatches,
  findFutbolVideosStreams,
  __resetFutbolVideosCachesForTests,
} from "@/lib/futbolvideos-source";

const STD_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const CUSTOM_B64 = "MiljRIn9PX1o63wGBYTtFsKmEkSur-pC_U02cvzAdy5e8ZqLDgJ4OhVN7QbHxfWa";

const KEY_HEX = "bea5b79ffc81d51f86c123dce2426cd9d0a457b91199768dcb7950ff75e41c92";

/** Client-facing relay URL for an HLS channel (the CDN blocks the browser). */
const proxied = (upstream: string) => `/api/hls?u=${encodeURIComponent(upstream)}`;

// Reverses decryptFutbolVideosBody: encrypts plaintext into the `k1` + custom
// base64 format the source expects, so tests can round-trip deterministically.
function encryptToCustomFormat(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const buf = Buffer.concat([iv, ct, tag]);

  const std = buf.toString("base64").replace(/=+$/, "");
  let reversedMapped = "";
  for (const ch of std) {
    reversedMapped += CUSTOM_B64[STD_B64.indexOf(ch)];
  }
  const encoded = reversedMapped.split("").reverse().join("");
  return "k1" + encoded;
}

function makePayload(matchId = 1162): string {
  return JSON.stringify({
    generated_at: "2026-10-28T00:00:00+00:00",
    count: 2,
    matches: [
      {
        id: matchId,
        title: "Brasileirão: Santos vs Palmeiras",
        league: "Brasileirão",
        sport: "futbol",
        home: { name: "Santos" },
        away: { name: "Palmeiras" },
        streams: [
          {
            id: "g-1162-1",
            no: 1,
            name: "Premiere BR",
            language: "Español",
            hd: false,
            embed_url: "https://sportiskos.space/streamlat.html?id=n1162-abc",
            origin: "generated",
            real_url: "https://tvf90.com/1.php?stream=premiere1",
          },
          {
            id: "n1162-abc",
            no: 1,
            name: "Premiere BR",
            language: "Español",
            hd: false,
            embed_url: "https://tvf90.com/1.php?stream=premiere1",
            origin: "native",
            real_url: null,
          },
          {
            id: "g-1162-2",
            no: 2,
            name: "Premiere BR",
            language: "Español",
            hd: true,
            embed_url: "https://sportiskos.space/streamlat.html?id=n1162-def",
            origin: "generated",
            real_url: "https://tvf90.com/2.php?stream=premiere1",
          },
        ],
      },
      {
        id: 2000,
        sport: "basketball",
        home: { name: "Miami Heat" },
        away: { name: "Atlanta Hawks" },
        streams: [{ id: 1, embed_url: "https://example.com/bb", origin: "native" }],
      },
    ],
  });
}

describe("decryptFutbolVideosBody", () => {
  it("round-trips a payload through the custom base64 + AES-GCM format", () => {
    const plaintext = makePayload();
    const encrypted = encryptToCustomFormat(plaintext, KEY_HEX);
    expect(decryptFutbolVideosBody(encrypted, KEY_HEX)).toBe(plaintext);
  });

  it("throws on a payload without the k1 prefix", () => {
    expect(() => decryptFutbolVideosBody("nope", KEY_HEX)).toThrow(/prefix/);
  });

  it("throws on a payload with an invalid key length", () => {
    const encrypted = encryptToCustomFormat("{}", KEY_HEX);
    expect(() => decryptFutbolVideosBody(encrypted, "abcd")).toThrow(/key length/);
  });

  it("throws when the key does not match (auth tag failure)", () => {
    const encrypted = encryptToCustomFormat(makePayload(), KEY_HEX);
    const wrongKey = "0".repeat(64);
    expect(() => decryptFutbolVideosBody(encrypted, wrongKey)).toThrow();
  });
});

describe("parseFutbolVideosMatches", () => {
  it("keeps only football matches with both team names", () => {
    const matches = parseFutbolVideosMatches(makePayload());
    expect(matches).toHaveLength(1);
    expect(matches[0].home?.name).toBe("Santos");
    expect(matches[0].away?.name).toBe("Palmeiras");
  });

  it("returns [] on malformed JSON", () => {
    expect(parseFutbolVideosMatches("not json")).toEqual([]);
  });
});

describe("findFutbolVideosStreams", () => {
  const originalEnv = {
    url: process.env.FUTBOLVIDEOS_API_URL,
    key: process.env.FUTBOLVIDEOS_KEY,
  };
  const originalFetch = globalThis.fetch;
  const API = "https://cdn.strm-api.org/api/v1/latin/matches";

  const routeFetch = (routes: Record<string, string>) =>
    jest.fn().mockImplementation(async (url: string) => {
      const body = routes[url];
      if (body === undefined) return { ok: false, status: 404, text: async () => "" };
      return { ok: true, status: 200, text: async () => body };
    });

  beforeEach(async () => {
    process.env.FUTBOLVIDEOS_API_URL = API;
    process.env.FUTBOLVIDEOS_KEY = KEY_HEX;
    await __resetFutbolVideosCachesForTests();
  });

  afterEach(() => {
    if (originalEnv.url === undefined) delete process.env.FUTBOLVIDEOS_API_URL;
    else process.env.FUTBOLVIDEOS_API_URL = originalEnv.url;
    if (originalEnv.key === undefined) delete process.env.FUTBOLVIDEOS_KEY;
    else process.env.FUTBOLVIDEOS_KEY = originalEnv.key;

    if (originalFetch) globalThis.fetch = originalFetch;
    else delete (globalThis as { fetch?: typeof fetch }).fetch;
  });

  it("resolves each unique stream to an HLS channel plus a web fallback", async () => {
    const encrypted = encryptToCustomFormat(makePayload(), KEY_HEX);
    globalThis.fetch = routeFetch({
      [API]: encrypted,
      "https://tvf90.com/1.php?stream=premiere1": '<iframe src="/5.php?stream=premiere1"></iframe>',
      "https://tvf90.com/5.php?stream=premiere1":
        '<script>var s="https://cdn-a.example.com/premiere1/mono.m3u8?token=aaa"</script>',
      "https://tvf90.com/2.php?stream=premiere1":
        '<script>var s="https://cdn-b.example.com/premiere1hd/mono.m3u8?token=bbb"</script>',
    });

    const channels = await findFutbolVideosStreams("Santos", "Palmeiras");

    // 2 distinct streams → each yields HLS first, then the frameable web player.
    expect(channels).toHaveLength(4);
    expect(channels.map((c) => c.kind)).toEqual(["hls", "iframe", "hls", "iframe"]);
    expect(channels[0].url).toBe(proxied("https://cdn-a.example.com/premiere1/mono.m3u8?token=aaa"));
    expect(channels[1].url).toBe("https://tvf90.com/1.php?stream=premiere1");
    expect(channels[1].name).toMatch(/· Web$/);
    expect(channels[2].url).toBe(proxied("https://cdn-b.example.com/premiere1hd/mono.m3u8?token=bbb"));
    expect(channels[3].url).toBe("https://tvf90.com/2.php?stream=premiere1");
    expect(new Set(channels.map((c) => c.id)).size).toBe(4);
  });

  it("groups streams that resolve to the same playlist into one HLS + one web channel", async () => {
    const encrypted = encryptToCustomFormat(makePayload(), KEY_HEX);
    globalThis.fetch = routeFetch({
      [API]: encrypted,
      "https://tvf90.com/1.php?stream=premiere1": '<iframe src="/5.php?stream=premiere1"></iframe>',
      "https://tvf90.com/5.php?stream=premiere1":
        '<script>var s="https://a.example.com/premiere1/mono.m3u8?token=aaa"</script>',
      "https://tvf90.com/2.php?stream=premiere1":
        '<script>var s="https://b.example.com/premiere1/mono.m3u8?token=bbb"</script>',
    });

    const channels = await findFutbolVideosStreams("Santos", "Palmeiras");

    // Same playlist path → a single group with its HLS channel + web fallback.
    expect(channels).toHaveLength(2);
    expect(channels[0].kind).toBe("hls");
    expect(channels[0].url).toBe(proxied("https://a.example.com/premiere1/mono.m3u8?token=aaa"));
    expect(channels[1].kind).toBe("iframe");
    expect(channels[1].url).toBe("https://tvf90.com/1.php?stream=premiere1");
  });

  it("falls back to the frameable player page when no m3u8 is found", async () => {
    const encrypted = encryptToCustomFormat(makePayload(), KEY_HEX);
    globalThis.fetch = routeFetch({
      [API]: encrypted,
      "https://tvf90.com/1.php?stream=premiere1": "<html><body>no stream</body></html>",
      "https://tvf90.com/2.php?stream=premiere1": "<html><body>no stream</body></html>",
    });

    const channels = await findFutbolVideosStreams("Santos", "Palmeiras");

    expect(channels).toHaveLength(2);
    expect(channels.every((c) => c.kind === "iframe")).toBe(true);
    expect(channels[0].url).toBe("https://tvf90.com/1.php?stream=premiere1");
  });

  it("returns [] when no match pairs the teams", async () => {
    const encrypted = encryptToCustomFormat(makePayload(), KEY_HEX);
    globalThis.fetch = routeFetch({ [API]: encrypted });

    await expect(findFutbolVideosStreams("Boca", "River")).resolves.toEqual([]);
  });

  it("returns [] when env vars are missing", async () => {
    delete process.env.FUTBOLVIDEOS_API_URL;
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    await expect(findFutbolVideosStreams("Santos", "Palmeiras")).resolves.toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
