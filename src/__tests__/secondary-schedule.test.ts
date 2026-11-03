/** @jest-environment node */
import { confirmSecondaryMlsDates } from "@/lib/secondary-schedule";
import { parseSecondaryAgenda } from "@/lib/secondary-source";
import { getCache, setCache } from "@/lib/cache";

jest.mock("@/lib/cache", () => ({ getCache: jest.fn(), setCache: jest.fn() }));

const agenda = () => parseSecondaryAgenda(`<table><tr><td><b>MLS</b>:
  <a href="/bein.php">Inter Miami CF vs New England Revolution</a></td>
  <td><span class="t">7:00PM</span></td></tr></table>`, "https://agenda.test/index.php");
const competition = (state = "in", date = "2026-11-02T00:00Z") => ({
  date, status: { type: { state, completed: state === "post", name: "STATUS_" + state } },
  competitors: [
    { homeAway: "away", team: { displayName: "Inter Miami CF" } },
    { homeAway: "home", team: { displayName: "New England Revolution" } },
  ],
});

describe("MLS date confirmation for the secondary fixture", () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SECONDARY_MLS_SCHEDULE_URL;
  let fetchMock: jest.Mock;
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-11-01T22:00:00-03:00") });
    jest.mocked(getCache).mockResolvedValue(null);
    jest.mocked(setCache).mockResolvedValue();
    process.env.SECONDARY_MLS_SCHEDULE_URL = "https://schedule.test/scoreboard";
    fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ events: [{ competitions: [competition()] }] }) }));
    global.fetch = fetchMock;
  });
  afterEach(() => { jest.useRealTimers(); global.fetch = originalFetch; });
  afterAll(() => {
    if (originalUrl === undefined) delete process.env.SECONDARY_MLS_SCHEDULE_URL;
    else process.env.SECONDARY_MLS_SCHEDULE_URL = originalUrl;
  });

  it("confirms Miami's real kickoff and home/away order without mutating raw cached listings", async () => {
    const raw = agenda();
    const result = await confirmSecondaryMlsDates(raw);
    expect(result[0]).toMatchObject({
      homeTeam: "New England Revolution", awayTeam: "Inter Miami CF", league: "MLS",
      dateISO: "2026-11-02T00:00Z", dateInferred: false, fixtureStatus: "LIVE",
      sources: raw[0].sources, slug: raw[0].slug,
    });
    expect(raw[0].dateISO).toBe("");
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get("dates"))).toEqual(["20261031", "20261101"]);
  });

  it("uses the previous US calendar day after Argentina midnight", async () => {
    jest.setSystemTime(new Date("2026-11-02T00:30:00-03:00"));
    expect((await confirmSecondaryMlsDates(agenda()))[0].dateInferred).toBe(false);
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get("dates"))).toEqual(["20261101", "20261102"]);
  });

  it.each(["pre", "post"])("preserves a confirmed %s status instead of inventing a live match", async (state) => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ events: [{ competitions: [competition(state)] }] }) });
    expect((await confirmSecondaryMlsDates(agenda()))[0].fixtureStatus).toBe(state === "post" ? "FT" : "NS");
  });

  it("does not date a postponed match as playable", async () => {
    const item = competition("pre");
    item.status.type.name = "STATUS_POSTPONED";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ events: [{ competitions: [item] }] }) });
    expect((await confirmSecondaryMlsDates(agenda()))[0].fixtureStatus).toBe("PST");
  });

  it.each(["invalid", "2026-11-02T00:00", "2026-10-01T00:00Z"])("rejects invalid, unzoned or stale dates: %s", async (date) => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ events: [{ competitions: [competition("in", date)] }] }) });
    expect((await confirmSecondaryMlsDates(agenda()))[0].dateInferred).toBe(true);
  });

  it("does not confuse another Miami opponent or an ambiguous pair of rematches", async () => {
    const different = competition();
    different.competitors[0].team.displayName = "Orlando City SC";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ events: [{ competitions: [different] }] }) });
    expect((await confirmSecondaryMlsDates(agenda()))[0].dateInferred).toBe(true);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ events: [{ competitions: [competition(), competition("pre", "2026-11-02T10:00Z")] }] }) });
    expect((await confirmSecondaryMlsDates(agenda()))[0].dateInferred).toBe(true);
  });

  it("keeps channel lookup usable when the schedule fails or is unconfigured", async () => {
    fetchMock.mockRejectedValue(new Error("network failure"));
    expect(await confirmSecondaryMlsDates(agenda())).toEqual(agenda());
    delete process.env.SECONDARY_MLS_SCHEDULE_URL;
    fetchMock.mockClear();
    expect(await confirmSecondaryMlsDates(agenda())).toEqual(agenda());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never assigns MLS dates to another league", async () => {
    const raw = agenda().map((match) => ({ ...match, league: "Liga Profesional" }));
    expect(await confirmSecondaryMlsDates(raw)).toEqual(raw);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
