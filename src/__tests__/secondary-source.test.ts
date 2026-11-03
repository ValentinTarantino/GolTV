/** @jest-environment node */
import { extractSecondaryPlayer, fetchSecondaryAgenda, findSecondaryStreams, parseSecondaryAgenda } from "@/lib/secondary-source";
import { getCache, setCache } from "@/lib/cache";

jest.mock("@/lib/cache", () => ({ getCache: jest.fn(), setCache: jest.fn() }));

const BASE = "https://agenda.test/index.php";
const row = (teams: string, path = "/canal-1.php", league = "Futbol Argentina") =>
  `<tr><td><b>${league}</b>:<a href="${path}">${teams}</a><ml/td><td><span class="t">4:30PM</span></td></tr>`;
const HTML = `<table>
  ${row("Belgrano vs Barracas Central")}
  ${row("Belgrano vs Barracas Central", "https://promo.test/?gtm_latency=1")}
  ${row("Belgrano vs Barracas Central", "/canal-2.php")}
  ${row("Belgrano vs Barracas Central")}
  ${row("Elche vs Valencia", "/directv.php", "LaLiga EA Sports")}
  ${row("Lakers vs Jazz", "/nba.php", "NBA")}
  ${row("Dallas Cowboys vs Arizona Cardinals", "/nfl.php", "NFL")}
  ${row("Gran Premio México Carrera", "/formula.php", "Fórmula 1")}
  ${row("Boca vs River", "/women.php", "Liga Femenina")}
</table>`;

describe("parseSecondaryAgenda", () => {
  it("reads the malformed table, merges signals and ignores promos/non-football", () => {
    const matches = parseSecondaryAgenda(HTML, BASE);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      homeTeam: "Belgrano", awayTeam: "Barracas Central", league: "Futbol Argentina",
      slug: "belgrano-vs-barracas-central", dateInferred: true, dateISO: "",
      sources: [
        { id: "https://agenda.test/canal-1.php", name: "canal 1" },
        { id: "https://agenda.test/canal-2.php", name: "canal 2" },
      ],
    });
    expect(matches[1].league).toBe("LaLiga");
  });

  it("decodes team entities and resolves absolute URLs with query parameters", () => {
    const matches = parseSecondaryAgenda("<table>" + row("Lan&uacute;s vs Gimnasia Mendoza",
      "https://agenda.test/player.php?one=1&amp;two=2") + "</table>", BASE);
    expect(matches[0].homeTeam).toBe("Lanús");
    expect(matches[0].sources[0].id).toBe("https://agenda.test/player.php?one=1&two=2");
  });

  it.each(["javascript:alert(1)", "http://agenda.test/a.php", "https://other.test/a.php", "/index.php", "#", "https://user:pass@agenda.test/a.php"])(
    "rejects non-channel link %s", (link) => {
      expect(parseSecondaryAgenda("<table>" + row("Boca vs River", link) + "</table>", BASE)).toEqual([]);
    });

  it("requires an HTTPS source and never fabricates today's fixture date", () => {
    expect(parseSecondaryAgenda(HTML, "")).toEqual([]);
    expect(parseSecondaryAgenda("<html>No matches</html>", BASE)).toEqual([]);
    expect(parseSecondaryAgenda(HTML, BASE).every((match) => match.dateInferred && !match.dateISO)).toBe(true);
  });
});

describe("extractSecondaryPlayer", () => {
  it("selects the fullscreen content frame, excluding hidden and tracking frames", () => {
    const html = `<iframe id="navbar-iframe" src="https://tracking.test/"></iframe>
      <div hidden><iframe allowfullscreen src="https://ads.test/hidden"></iframe></div>
      <iframe width="1" height="1" src="https://ads.test/pixel"></iframe>
      <div style="visibility:hidden"><iframe src="https://ads.test/hidden2"></iframe></div>
      <div class="post-body"><iframe allowfullscreen src="//player.test/stream/75?a=1&amp;b=2"></iframe></div>`;
    expect(extractSecondaryPlayer(html, BASE)).toBe("https://player.test/stream/75?a=1&b=2");
  });

  it("resolves relative lazy frames and rejects executable or mixed-content URLs", () => {
    expect(extractSecondaryPlayer('<iframe data-src="/embed/1"></iframe>', BASE)).toBe("https://agenda.test/embed/1");
    expect(extractSecondaryPlayer('<iframe src="javascript:alert(1)"></iframe><iframe src="http://player.test/"></iframe>', BASE)).toBeNull();
    expect(extractSecondaryPlayer("<script>window.location='https://ads.test'</script>", BASE)).toBeNull();
  });
});

describe("Player 3 integration", () => {
  const originalFetch = global.fetch;
  const originalAgenda = process.env.SECONDARY_AGENDA_URL;
  const originalHosts = process.env.SECONDARY_PLAYER_WRAPPER_HOSTS;
  const values = new Map<string, unknown>();
  const pages = new Map<string, string>();
  const frame = (url: string) => `<iframe allowfullscreen src="${url}"></iframe>`;
  let fetchMock: jest.Mock;
  let warning: jest.SpyInstance;

  beforeEach(() => {
    values.clear();
    pages.clear();
    jest.mocked(getCache).mockImplementation(async (key) => values.get(key) as never ?? null);
    jest.mocked(setCache).mockImplementation(async (key, value) => { values.set(key, value); });
    process.env.SECONDARY_AGENDA_URL = BASE;
    process.env.SECONDARY_PLAYER_WRAPPER_HOSTS = "wrapper.test";
    pages.set(BASE, HTML);
    pages.set("https://agenda.test/canal-1.php", frame("https://wrapper.test/channel1"));
    pages.set("https://agenda.test/canal-2.php", frame("https://wrapper.test/channel2"));
    pages.set("https://wrapper.test/channel1", frame("https://player.test/stream/75"));
    pages.set("https://wrapper.test/channel2", frame("https://player.test/stream/76"));
    fetchMock = jest.fn(async (url: string) => ({
      ok: pages.has(url), status: pages.has(url) ? 200 : 503, text: async () => pages.get(url) ?? "",
    }));
    global.fetch = fetchMock;
    warning = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => { warning.mockRestore(); });
  afterAll(() => {
    global.fetch = originalFetch;
    if (originalAgenda === undefined) delete process.env.SECONDARY_AGENDA_URL;
    else process.env.SECONDARY_AGENDA_URL = originalAgenda;
    if (originalHosts === undefined) delete process.env.SECONDARY_PLAYER_WRAPPER_HOSTS;
    else process.env.SECONDARY_PLAYER_WRAPPER_HOSTS = originalHosts;
  });

  it("follows both wrapper layers and returns only bare player iframes", async () => {
    const channels = await findSecondaryStreams("Barracas Central", "Belgrano");
    expect(channels.map((channel) => [channel.name, channel.kind, channel.url])).toEqual([
      ["canal 1", "iframe", "https://player.test/stream/75"],
      ["canal 2", "iframe", "https://player.test/stream/76"],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("player.test"), expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(BASE, expect.objectContaining({ cache: "no-store", redirect: "error" }));
  });

  it("caches successful resolutions and coalesces concurrent lookups", async () => {
    const [first, second] = await Promise.all([
      findSecondaryStreams("Belgrano", "Barracas Central"),
      findSecondaryStreams("Belgrano", "Barracas Central"),
    ]);
    expect(first).toHaveLength(2);
    expect(second).toEqual(first);
    expect(await findSecondaryStreams("Belgrano", "Barracas Central")).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("deduplicates different channel pages that resolve to the same player", async () => {
    pages.set("https://wrapper.test/channel2", frame("https://player.test/stream/75"));
    expect(await findSecondaryStreams("Belgrano", "Barracas Central")).toHaveLength(1);
  });

  it("isolates a failing signal and retries it without caching failure", async () => {
    pages.delete("https://wrapper.test/channel1");
    expect(await findSecondaryStreams("Belgrano", "Barracas Central")).toHaveLength(1);
    pages.set("https://wrapper.test/channel1", frame("https://player.test/stream/75"));
    expect(await findSecondaryStreams("Belgrano", "Barracas Central")).toHaveLength(2);
  });

  it("handles network failure without losing successful signals", async () => {
    const implementation = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, init) => url.endsWith("/channel1")
      ? Promise.reject(new Error("timeout")) : implementation(url, init));
    expect(await findSecondaryStreams("Belgrano", "Barracas Central")).toHaveLength(1);
  });

  it("does not return wrapper chrome if a player is missing or cyclic", async () => {
    pages.set("https://wrapper.test/channel1", "<p>Unavailable</p>");
    pages.set("https://wrapper.test/channel2", frame("https://agenda.test/canal-2.php"));
    expect(await findSecondaryStreams("Belgrano", "Barracas Central")).toEqual([]);
  });

  it("returns no unrelated channels for a fixture absent from the agenda", async () => {
    expect(await findSecondaryStreams("Boca", "River")).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not fall back to any hardcoded provider when config is missing", async () => {
    delete process.env.SECONDARY_AGENDA_URL;
    expect(await fetchSecondaryAgenda()).toEqual([]);
    expect(await findSecondaryStreams("Belgrano", "Barracas Central")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries failed or empty agendas and scopes caches by configured URL", async () => {
    pages.delete(BASE);
    expect(await fetchSecondaryAgenda()).toEqual([]);
    pages.set(BASE, "<html>Challenge</html>");
    expect(await fetchSecondaryAgenda()).toEqual([]);
    pages.set(BASE, HTML);
    expect(await fetchSecondaryAgenda()).toHaveLength(2);
    process.env.SECONDARY_AGENDA_URL = "https://other-agenda.test/index.php";
    expect(await fetchSecondaryAgenda()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
