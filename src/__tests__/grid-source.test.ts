/**
 * @jest-environment node
 */
import { findGridStreams } from "@/lib/grid-source";
import { deleteCache } from "@/lib/cache";

beforeAll(() => {
  process.env.GRID_API_BASE = "https://tribuna.lol";
  process.env.GRID_MEDIA_BASE = "https://files.tribuna.lol";
});

const BOARD = {
  canonicalEvents: [
    {
      home: "Ajax",
      away: "FC Thun",
      sport: "football",
      broadcasts: [
        { signalId: "movistar-champions-3", availability: "scheduled", priority: 0 },
        { signalId: "vidio-event-36251", availability: "verified-at-publication", priority: 0 },
        { signalId: "movistar-champions-4", availability: "off", priority: 1 },
      ],
    },
    {
      home: "Other",
      away: "Match",
      sport: "football",
      broadcasts: [{ signalId: "mplus", availability: "scheduled" }],
    },
  ],
};

function mockFetch(livePaths: string[]) {
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/programming/home")) {
      return new Response(JSON.stringify(BOARD), { status: 200 });
    }
    const live = livePaths.some((p) => url.includes(`/${p}/index.m3u8`));
    return new Response(live ? "#EXTM3U\n#EXT-X-VERSION:6" : "not found", {
      status: live ? 200 : 404,
    });
  });
}

describe("findGridStreams", () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    await deleteCache("grid:board");
    await deleteCache("grid:live:https://files.tribuna.lol/mligacamp3/index.m3u8");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("returns sealed HLS channels only for live playlists", async () => {
    global.fetch = mockFetch(["mligacamp3"]) as unknown as typeof fetch;
    const channels = await findGridStreams("Ajax", "Thun");

    expect(channels).toHaveLength(1);
    expect(channels[0].kind).toBe("hls");
    expect(channels[0].name).toBe("Señal 1");
    expect(channels[0].id).toMatch(/^grid-[0-9a-f]{16}$/);
    expect(channels[0].url).toMatch(/^\/api\/hls\?t=/);
    // Per-event provider signals and 'off' broadcasts never produce channels.
    expect(channels[0].url).not.toContain("vidio");
  });

  it("returns empty when no event matches", async () => {
    global.fetch = mockFetch(["mligacamp3"]) as unknown as typeof fetch;
    expect(await findGridStreams("Platense", "Estudiantes")).toEqual([]);
  });

  it("returns empty when the board is unreachable", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    expect(await findGridStreams("Ajax", "Thun")).toEqual([]);
  });
});
