/**
 * @jest-environment node
 */
jest.mock("@/lib/agenda-source", () => ({
  fetchAgenda: jest.fn(),
}));

jest.mock("@/lib/secondary-source", () => ({
  fetchSecondaryAgenda: jest.fn(),
}));

jest.mock("@/lib/event-source", () => ({
  fetchEventAgenda: jest.fn(),
}));

jest.mock("@/lib/team-logos", () => ({
  getTeamLogo: jest.fn().mockResolvedValue(""),
  peekTeamLogo: jest.fn().mockReturnValue(null),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/matches/route";
import { fetchAgenda } from "@/lib/agenda-source";
import { fetchSecondaryAgenda } from "@/lib/secondary-source";
import { fetchEventAgenda } from "@/lib/event-source";
import { peekTeamLogo } from "@/lib/team-logos";

function makeRequest(date?: string) {
  const url = date
    ? `http://localhost/api/matches?date=${date}`
    : "http://localhost/api/matches";
  return new NextRequest(url);
}

function todayISO() {
  return new Date().toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 10);
}

function flMatch(overrides: Partial<{ homeTeam: string; awayTeam: string; league: string; dateISO: string; slug: string; embeds: { id: string; name: string; embedIframe: string }[] }> = {}) {
  return {
    homeTeam: overrides.homeTeam ?? "Boca Juniors",
    awayTeam: overrides.awayTeam ?? "River Plate",
    league: overrides.league ?? "Liga Profesional",
    dateISO: overrides.dateISO ?? new Date().toISOString(),
    slug: overrides.slug ?? "boca-juniors-vs-river-plate",
    embeds: overrides.embeds ?? [{ id: "e1", name: "Canal 1", embedIframe: "https://example.com/embed/1" }],
  };
}

describe("/api/matches", () => {
  it("does not overwrite badges of names shared across countries", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({ homeTeam: "Barcelona", awayTeam: "Sevilla", league: "LaLiga", slug: "barcelona-es" }),
      flMatch({ homeTeam: "Barcelona", awayTeam: "Emelec", league: "Liga Pro", slug: "barcelona-ec" }),
    ]);
    (peekTeamLogo as jest.Mock).mockImplementation((name, country) => `/badges/${country}-${name}.png`);
    try {
      const { matches } = await (await GET(makeRequest())).json();
      expect(matches).toHaveLength(2);
      expect(matches.find((match: { league: { country: string } }) => match.league.country === "España").homeTeam.logo)
        .toBe("/badges/España-Barcelona.png");
      expect(matches.find((match: { league: { country: string } }) => match.league.country === "Ecuador").homeTeam.logo)
        .toBe("/badges/Ecuador-Barcelona.png");
    } finally {
      (peekTeamLogo as jest.Mock).mockReturnValue(null);
    }
  });
  it("rejects expired and invalid kickoffs from every source, preserving live and upcoming games", async () => {
    const now = Date.parse("2026-10-30T20:00:00-03:00");
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const entries = [
      flMatch({ dateISO: "2026-10-29T20:00:00-03:00" }),
      flMatch({ dateISO: "2026-10-30T17:00:00-03:00" }),
      flMatch({ dateISO: "invalid" }),
      flMatch({ homeTeam: "Racing", awayTeam: "Independiente", dateISO: "2026-10-30T19:00:00-03:00" }),
      flMatch({ homeTeam: "Talleres", awayTeam: "Belgrano", dateISO: "2026-10-30T21:00:00-03:00" }),
    ];
    try {
      for (const source of [fetchAgenda, fetchSecondaryAgenda, fetchEventAgenda]) {
        for (const mock of [fetchAgenda, fetchSecondaryAgenda, fetchEventAgenda]) {
          (mock as jest.Mock).mockResolvedValue([]);
        }
        (source as jest.Mock).mockResolvedValue(entries.map((entry) => ({
          ...entry, sources: [{ id: "1", name: "Canal" }],
        })));
        const response = await GET(makeRequest("2026-10-30"));
        const data = await response.json();
        expect(data.matches.map((match: { homeTeam: { name: string } }) => match.homeTeam.name))
          .toEqual(["Racing", "Talleres"]);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
      }
    } finally {
      clock.mockRestore();
    }
  });

  it("does not republish undated secondary events as today's fixtures", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([{
      ...flMatch(), dateInferred: true, sources: [{ id: "1", name: "Canal" }],
    }]);
    const response = await GET(makeRequest(todayISO()));
    expect((await response.json()).matches).toEqual([]);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (fetchAgenda as jest.Mock).mockResolvedValue([]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([]);
    (fetchEventAgenda as jest.Mock).mockResolvedValue([]);
  });

  it.each(["event-only", "all-sources"])("merges original agenda variants through the shared pipeline (%s)", async (mode) => {
    const pairs = [
      ["Primera División", "Racing", "Cerro Largo", "Primera División de Uruguay", "Racing de Montevideo", "Cerro Largo"],
      ["Primera División", "Peñarol", "Wanderers", "Primera División de Uruguay", "Peñarol", "Montevideo Wanderers"],
      ["Bundesliga", "Bayern München", "Borussia Dortmund", "Bundesliga", "Bayern Múnich", "Borussia Dortmund"],
      ["LaLiga", "Levante", "Atlético Madrid", "LaLiga", "Levante", "Atlético de Madrid"],
      ["Premier League", "Tottenham Hotspur", "Crystal Palace", "Premier League", "Tottenham", "Crystal Palace"],
      ["Premier League", "Manchester City", "Brighton &amp; Hove Albion", "Premier League", "Man City", "Brighton"],
      ["Liga Profesional", "Deportivo Riestra", "Talleres Córdoba", "Liga Profesional Argentina", "Deportivo Riestra", "Talleres de Córdoba"],
      ["Bundesliga", "Augsburg", "Freiburg", "Bundesliga", "Augsburgo", "Friburgo"],
      ["Bundesliga", "Borussia M'gladbach", "Paderborn", "Bundesliga", "Borussia Mönchengladbach", "SC Paderborn 07"],
      ["Premier League", "Coventry City", "Sunderland", "Premier League", "Coventry", "Sunderland"],
    ];
    const dateISO = new Date(Date.now() + 60 * 60_000).toISOString();
    const first = pairs.map(([league, homeTeam, awayTeam], i) =>
      flMatch({ league, homeTeam, awayTeam, dateISO, slug: `primary-${i}` }));
    const second = pairs.map(([, , , league, homeTeam, awayTeam], i) => ({
      league, homeTeam, awayTeam, dateISO, slug: `event-${i}`, sources: [{ id: "e1", name: "Channel" }],
    }));
    if (mode === "all-sources") {
      (fetchAgenda as jest.Mock).mockResolvedValue(first);
      (fetchSecondaryAgenda as jest.Mock).mockResolvedValue(second);
    }
    (fetchEventAgenda as jest.Mock).mockResolvedValue([
      ...first.map((entry) => ({ ...entry, sources: [{ id: "e2", name: "Channel" }] })), ...second,
    ]);
    const response = await GET(makeRequest());
    const matches = (await response.json()).matches;
    expect(matches).toHaveLength(pairs.length);
    expect(matches.map((match: { _eventSlug: string }) => match._eventSlug)).toEqual(first.map((entry) => entry.slug));
    expect(matches[5].awayTeam.name).toBe("Brighton & Hove Albion");
    if (mode === "all-sources") {
      expect(matches.every((match: { _eventSources?: unknown[] }) => match._eventSources?.length === 1)).toBe(true);
    }
  });

  it("combines distinct signals of duplicate primary records without mutating the source cache", async () => {
    const first = flMatch({ homeTeam: "Tottenham", awayTeam: "Crystal Palace", slug: "first" });
    const second = flMatch({ homeTeam: "Tottenham Hotspur", awayTeam: "Crystal Palace", slug: "second",
      embeds: [{ id: "e2", name: "Other channel", embedIframe: "https://example.com/embed/2" }],
    });
    (fetchAgenda as jest.Mock).mockResolvedValue([first, second, second]);
    const response = await GET(makeRequest());
    const { matches } = await response.json();
    expect(matches).toHaveLength(1);
    expect(matches[0]._eventSlug).toBe("first");
    expect(matches[0]._eventSources).toEqual([...first.embeds, ...second.embeds]);
    expect(first.embeds).toHaveLength(1);
  });

  it("returns matches with correct structure", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([flMatch()]);

    const req = makeRequest(todayISO());
    const res = await GET(req);
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.matches[0]).toHaveProperty("id");
    expect(data.matches[0]).toHaveProperty("league");
    expect(data.matches[0]).toHaveProperty("homeTeam");
    expect(data.matches[0]).toHaveProperty("awayTeam");
    expect(data.matches[0]).toHaveProperty("status");
    expect(data.matches[0]).toHaveProperty("score");
  });

  it("places Fiorentina vs Atalanta in Italian Serie A when a source adds a Liga Pro season label", async () => {
    const kickoff = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const date = new Date(kickoff)
      .toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
      .slice(0, 10);
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({
        homeTeam: "Fiorentina",
        awayTeam: "Atalanta",
        league: "Liga Pro Ecuador 2026",
        dateISO: kickoff,
        slug: "fiorentina-atalanta",
      }),
    ]);

    const res = await GET(makeRequest(date));
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].league).toMatchObject({ id: 135, country: "Italia", name: "Serie A" });
  });

  it("includes Messi Cup matches in the fixture", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({
        homeTeam: "River Plate",
        awayTeam: "AFC Ajax",
        league: "Messi Cup U16",
        dateISO: `${todayISO()}T16:30:00-03:00`,
        slug: "river-ajax-messi-cup",
      }),
    ]);

    const res = await GET(makeRequest(todayISO()));
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].league).toMatchObject({ id: 9901, name: "Messi Cup", slug: "messi-cup" });
  });

  it("separates Chilean and Bolivian fixtures mislabeled as Uruguay", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({ homeTeam: "Cobresal", awayTeam: "Univ. Concepción", league: "Primera División de Uruguay - Apertura", slug: "cobresal-concepcion" }),
      flMatch({ homeTeam: "Universitario de Vinto", awayTeam: "Real Oruro", league: "Primera División de Uruguay - Apertura", slug: "vinto-oruro" }),
      flMatch({ homeTeam: "Huachipato", awayTeam: "O'Higgins", league: "Liga AUF Uruguaya", slug: "huachipato-ohiggins" }),
      flMatch({ homeTeam: "Oriente Petrolero", awayTeam: "ABB", league: "Liga AUF Uruguaya", slug: "oriente-abb" }),
      flMatch({ homeTeam: "Wanderers", awayTeam: "Boston River", league: "Liga AUF Uruguaya", slug: "wanderers-boston-river" }),
    ]);

    const res = await GET(makeRequest(todayISO()));
    const data = await res.json();

    expect(data.matches.map((match: { homeTeam: { name: string }; league: { id: number } }) => [
      match.homeTeam.name,
      match.league.id,
    ])).toEqual([
      ["Cobresal", 265],
      ["Huachipato", 265],
      ["Wanderers", 268],
    ]);
  });
  it("excludes women's matches from both fixture sources", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({ league: "Liga Femenina", homeTeam: "Barcelona", awayTeam: "Real Madrid", slug: "barcelona-real-madrid-women" }),
      flMatch({ league: "Liga Profesional", homeTeam: "Boca Juniors Women", awayTeam: "River Plate", slug: "boca-river-women" }),
      flMatch({ league: "Liga Profesional", homeTeam: "Boca Juniors", awayTeam: "River Plate", slug: "boca-river-men" }),
      flMatch({ league: "Amistosos", homeTeam: "Brazil W", awayTeam: "USA W", slug: "brazil-usa-women" }),
    ]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([
      secMatch({ league: "Women's Super League", homeTeam: "Arsenal", awayTeam: "Chelsea", slug: "arsenal-chelsea-women" }),
      secMatch({ league: "Copa Argentina", homeTeam: "Platense Women", awayTeam: "Estudiantes LP", slug: "platense-estudiantes-women" }),
    ]);

    const res = await GET(makeRequest(todayISO()));
    const data = await res.json();

    expect(data.matches.map((match: { homeTeam: { name: string }; awayTeam: { name: string } }) => [
      match.homeTeam.name,
      match.awayTeam.name,
    ])).toEqual([["Boca Juniors", "River Plate"]]);
  });
  it("filters matches by today's date", async () => {
    const today = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({ dateISO: today }),
      flMatch({ dateISO: yesterday, homeTeam: "San Lorenzo" }),
    ]);

    const req = makeRequest(todayISO());
    const res = await GET(req);
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].homeTeam.name).toBe("Boca Juniors");
  });

  it("deduplicates matches with same teams", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({ slug: "boca-river-1" }),
      flMatch({ slug: "boca-river-2" }),
    ]);

    const req = makeRequest(todayISO());
    const res = await GET(req);
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
  });

  it("deduplicates fixtures when providers add or omit club abbreviations", async () => {
    const date = todayISO();
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({ homeTeam: "Los Chankas", awayTeam: "Cusco", dateISO: `${date}T15:00:00-03:00`, slug: "los-chankas-cusco" }),
      flMatch({ homeTeam: "Los Chankas", awayTeam: "Cusco FC", dateISO: `${date}T15:00:00-03:00`, slug: "los-chankas-cusco-fc" }),
      flMatch({ homeTeam: "UB Lebrijana", awayTeam: "Getafe", dateISO: `${date}T16:00:00-03:00`, slug: "ub-lebrijana-getafe" }),
      flMatch({ homeTeam: "Lebrijana", awayTeam: "Getafe", dateISO: `${date}T16:00:00-03:00`, slug: "lebrijana-getafe" }),
    ]);

    const res = await GET(makeRequest(date));
    const data = await res.json();

    expect(data.matches).toHaveLength(2);
    expect(data.matches.map((match: { homeTeam: { name: string } }) => match.homeTeam.name)).toEqual([
      "Los Chankas",
      "UB Lebrijana",
    ]);
  });

  it("deduplicates spelling variants contributed by all three agenda sources", async () => {
    const date = todayISO();
    const kickoff = `${date}T15:00:00-03:00`;
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({ homeTeam: "Los Chankas", awayTeam: "Cusco", league: "Liga 1", dateISO: kickoff, slug: "chankas-cusco" }),
      flMatch({ homeTeam: "UB Lebrijana", awayTeam: "Getafe", league: "LaLiga", dateISO: `${date}T16:00:00-03:00`, slug: "ub-lebrijana-getafe" }),
    ]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([
      secMatch({ homeTeam: "Los Chankas", awayTeam: "Cusco FC", league: "Liga 1", dateISO: kickoff }),
      secMatch({ homeTeam: "Lebrijana", awayTeam: "Getafe", league: "LaLiga", dateISO: `${date}T16:00:00-03:00` }),
    ]);
    (fetchEventAgenda as jest.Mock).mockResolvedValue([
      {
        slug: "los-chankas-vs-cusco-fc",
        homeTeam: "Los Chankas",
        awayTeam: "Cusco FC",
        league: "Liga 1",
        dateISO: kickoff,
        sources: [{ id: "1", name: "Canal" }],
      },
      {
        slug: "lebrijana-vs-getafe",
        homeTeam: "Lebrijana",
        awayTeam: "Getafe",
        league: "LaLiga",
        dateISO: `${date}T16:00:00-03:00`,
        sources: [{ id: "2", name: "Canal" }],
      },
    ]);

    const res = await GET(makeRequest(date));
    const data = await res.json();

    expect(data.matches).toHaveLength(2);
    expect(data.matches.map((match: { homeTeam: { name: string } }) => match.homeTeam.name)).toEqual([
      "Los Chankas",
      "UB Lebrijana",
    ]);
  });

  it("deduplicates AE Prat and Prat while preserving the primary source entry", async () => {
    const date = todayISO();
    const kickoff = `${date}T17:00:00-03:00`;
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({ homeTeam: "AE Prat", awayTeam: "Athletic Club", league: "LaLiga", dateISO: kickoff, slug: "ae-prat-athletic" }),
    ]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([
      secMatch({ homeTeam: "Prat", awayTeam: "Athletic Club", league: "LaLiga", dateISO: kickoff }),
    ]);
    (fetchEventAgenda as jest.Mock).mockResolvedValue([
      {
        slug: "prat-vs-athletic-club",
        homeTeam: "Prat",
        awayTeam: "Athletic Club",
        league: "LaLiga",
        dateISO: kickoff,
        sources: [{ id: "1", name: "Canal" }],
      },
    ]);

    const res = await GET(makeRequest(date));
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].homeTeam.name).toBe("AE Prat");
    expect(data.matches[0]).toHaveProperty("_eventSources");
  });

  it("deduplicates the two Pelota Libre names for the same future Copa del Rey tie", async () => {
    const kickoffMs = Date.now() + 3 * 60 * 60 * 1000;
    const utcKickoff = new Date(kickoffMs).toISOString();
    const argentinaKickoff = `${new Date(kickoffMs - 3 * 60 * 60 * 1000).toISOString().slice(0, 19)}-03:00`;
    const date = new Date(utcKickoff)
      .toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
      .slice(0, 10);

    (fetchAgenda as jest.Mock).mockResolvedValue([]);
    (fetchEventAgenda as jest.Mock).mockResolvedValue([
      {
        slug: "auriense-vs-deportivo-la-coruna",
        homeTeam: "Auriense",
        awayTeam: "Deportivo La Coruña",
        league: "Copa del Rey",
        dateISO: argentinaKickoff,
        sources: [{ id: "1", name: "Canal" }],
      },
      {
        slug: "auriense-cented-academy-vs-deportivo",
        homeTeam: "Auriense Cented Academy",
        awayTeam: "Deportivo",
        league: "Copa del Rey",
        dateISO: utcKickoff,
        sources: [{ id: "2", name: "Canal" }],
      },
    ]);

    const res = await GET(makeRequest(date));
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].homeTeam.name).toBe("Auriense");
    expect(data.matches[0].awayTeam.name).toBe("Deportivo La Coruña");
  });

  it("deduplicates Inter listed under two names (Inter Milan vs Inter)", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({ homeTeam: "Inter Milan", awayTeam: "Parma", league: "Serie A", slug: "inter-milan-vs-parma" }),
      flMatch({ homeTeam: "Inter", awayTeam: "Parma", league: "Serie A", slug: "inter-vs-parma" }),
    ]);

    const req = makeRequest(todayISO());
    const res = await GET(req);
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].homeTeam.name).toBe("Inter Milan");
  });

  it("skips matches without embeds", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({ embeds: [] }),
    ]);

    const req = makeRequest(todayISO());
    const res = await GET(req);
    const data = await res.json();

    expect(data.matches).toHaveLength(0);
  });

  it("skips matches with unrecognized league", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({ league: "Superliga de Irlanda del Norte" }),
    ]);

    const req = makeRequest(todayISO());
    const res = await GET(req);
    const data = await res.json();

    expect(data.matches).toHaveLength(0);
  });

  it("keeps national-team matches (Nations League)", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({
        league: "UEFA Nations League",
        homeTeam: "Portugal",
        awayTeam: "Spain",
        slug: "portugal-spain-nl",
      }),
      flMatch({
        league: "Liga de Naciones de la CONCACAF",
        homeTeam: "Mexico",
        awayTeam: "United States",
        slug: "mexico-usa-nl",
      }),
    ]);

    const req = makeRequest(todayISO());
    const res = await GET(req);
    const data = await res.json();

    expect(data.matches).toHaveLength(2);
    const names = data.matches.map((m: { league: { name: string } }) => m.league.name);
    expect(names).toContain("UEFA Nations League");
    expect(names).toContain("CONCACAF Nations League");
    expect(names).not.toContain("CONCACAF Champions Cup");
  });

  it("returns empty array when agenda is empty", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([]);

    const req = makeRequest(todayISO());
    const res = await GET(req);
    const data = await res.json();

    expect(data.matches).toHaveLength(0);
  });

  it("sorts matches by timestamp ascending", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({ slug: "late-match", homeTeam: "Team A" }),
      flMatch({ slug: "early-match", homeTeam: "Team B" }),
    ]);

    const req = makeRequest(todayISO());
    const res = await GET(req);
    const data = await res.json();

    expect(data.matches.length).toBeGreaterThanOrEqual(2);
  });

  function secMatch(
    overrides: Partial<{
      homeTeam: string;
      awayTeam: string;
      league: string;
      dateISO: string;
      slug: string;
      sources: { id: string; name: string }[];
    }> = {}
  ) {
    return {
      homeTeam: overrides.homeTeam ?? "Platense",
      awayTeam: overrides.awayTeam ?? "Estudiantes LP",
      league: overrides.league ?? "Copa Argentina",
      dateISO: overrides.dateISO ?? new Date().toISOString(),
      slug: overrides.slug ?? "platense-vs-estudiantes-lp",
      sources: overrides.sources ?? [{ id: "QUJDRA==", name: "TyC Sports" }],
    };
  }

  it("secondary fixture adds matches the primary is missing", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([secMatch()]);

    const req = makeRequest(todayISO());
    const res = await GET(req);
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].homeTeam.name).toBe("Platense");
    expect(data.matches[0].league.name).toBe("Copa Argentina");
    expect(data.matches[0]).toHaveProperty("_eventSlug");
    expect(data.matches[0]).not.toHaveProperty("_eventSources");
  });

  it("primary wins: secondary duplicate is ignored", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({ homeTeam: "Platense", awayTeam: "Estudiantes LP", league: "Copa Argentina" }),
    ]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([
      secMatch({ homeTeam: "Platense", awayTeam: "Estudiantes LP" }),
    ]);

    const req = makeRequest(todayISO());
    const res = await GET(req);
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].homeTeam.name).toBe("Platense");
    expect(data.matches[0]).toHaveProperty("_eventSources");
  });

  it("adds MLS fixtures from the event agenda and keeps duplicate fixtures once", async () => {
    const date = todayISO();
    (fetchAgenda as jest.Mock).mockResolvedValue([]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([]);
    (fetchEventAgenda as jest.Mock).mockResolvedValue([
      {
        slug: "los-angeles-fc-vs-la-galaxy",
        homeTeam: "Los Angeles FC",
        awayTeam: "LA Galaxy",
        league: "MLS",
        dateISO: `${date}T22:00:00-03:00`,
        sources: [{ id: "8502", name: "Apple TV Español" }],
      },
    ]);

    const res = await GET(makeRequest(date));
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].league.id).toBe(332);
    expect(data.matches[0].homeTeam.name).toBe("Los Angeles FC");
    expect(data.matches[0]._eventSlug).toBe("los-angeles-fc-vs-la-galaxy");
  });

  it("keeps MLS fixtures from all agenda sources under the MLS league", async () => {
    const date = todayISO();
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({
        homeTeam: "New York RB",
        awayTeam: "New England",
        league: "MLS 2026",
        dateISO: `${date}T18:00:00-03:00`,
        slug: "new-york-rb-vs-new-england",
      }),
    ]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([
      secMatch({
        homeTeam: "LAFC",
        awayTeam: "LA Galaxy",
        league: "USA - Major League Soccer 2026",
        dateISO: `${date}T20:00:00-03:00`,
      }),
    ]);
    (fetchEventAgenda as jest.Mock).mockResolvedValue([
      {
        slug: "inter-miami-vs-atlanta-united",
        homeTeam: "Inter Miami",
        awayTeam: "Atlanta United",
        league: "MLS 2026 Regular Season",
        dateISO: `${date}T22:00:00-03:00`,
        sources: [{ id: "8502", name: "Apple TV Español" }],
      },
    ]);

    const res = await GET(makeRequest(date));
    const data = await res.json();

    expect(data.matches).toHaveLength(3);
    expect(data.matches.map((match: { league: { id: number } }) => match.league.id)).toEqual([332, 332, 332]);
  });

  it("primary agenda wins over the same event-agenda fixture", async () => {
    const date = todayISO();
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({
        homeTeam: "Los Angeles FC",
        awayTeam: "LA Galaxy",
        league: "MLS",
        dateISO: `${date}T22:00:00-03:00`,
      }),
    ]);
    (fetchEventAgenda as jest.Mock).mockResolvedValue([
      {
        slug: "los-angeles-fc-vs-la-galaxy",
        homeTeam: "LAFC",
        awayTeam: "LA Galaxy",
        league: "Major League Soccer",
        dateISO: `${date}T22:00:00-03:00`,
        sources: [{ id: "8502", name: "Apple TV Español" }],
      },
    ]);

    const res = await GET(makeRequest(date));
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.matches[0]).toHaveProperty("_eventSources");
  });

  it("dedups the same fixture listed on different days by different agendas", async () => {
    const now = Date.now();
    // Primary lists it 2h ago (in progress, well inside the 6h near-now window
    // and clear of the 4h FT threshold); the event agenda lists the same
    // fixture 20h later (a different Argentina date, well outside the 8h
    // cross-date window that the team-pair dedup uses).
    const primaryISO = new Date(now - 2 * 3600_000).toISOString();
    const eventISO = new Date(now + 20 * 3600_000).toISOString();
    const argDate = (d: string) =>
      new Date(d).toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 10);

    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({
        homeTeam: "Boca Juniors",
        awayTeam: "River Plate",
        dateISO: primaryISO,
        slug: "boca-juniors-vs-river-plate",
      }),
    ]);
    (fetchEventAgenda as jest.Mock).mockResolvedValue([
      {
        slug: "boca-juniors-vs-river-plate",
        homeTeam: "Boca Juniors",
        awayTeam: "River Plate",
        league: "Liga Profesional",
        dateISO: eventISO,
        sources: [{ id: "1", name: "Canal" }],
      },
    ]);

    const res = await GET(makeRequest(argDate(eventISO)));
    const data = await res.json();

    // The same fixture on two days must collapse to one card — the primary
    // entry, which carries the live streams (_eventSources).
    expect(data.matches).toHaveLength(1);
    expect(data.matches[0]).toHaveProperty("_eventSources");
  });

  it("deduplicates Bogotá and Medellín variants when feeds use different slugs", async () => {
    const now = Date.now();
    const primaryISO = new Date(now - 2 * 3600_000).toISOString();
    const eventISO = new Date(now + 22 * 3600_000).toISOString();
    const eventDate = new Date(eventISO)
      .toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
      .slice(0, 10);

    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({
        homeTeam: "Inter Bogotá",
        awayTeam: "Medellín",
        league: "Liga BetPlay",
        dateISO: primaryISO,
        slug: "inter-bogota-vs-medellin",
      }),
    ]);
    (fetchEventAgenda as jest.Mock).mockResolvedValue([
      {
        slug: "inter-de-bogota-vs-dim",
        homeTeam: "Inter de Bogotá",
        awayTeam: "DIM",
        league: "Liga BetPlay",
        dateISO: eventISO,
        sources: [{ id: "1", name: "Win Sports" }],
      },
    ]);

    const res = await GET(makeRequest(eventDate));
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].homeTeam.name).toBe("Inter Bogotá");
    expect(data.matches[0].awayTeam.name).toBe("Medellín");
    expect(data.matches[0]).toHaveProperty("_eventSources");
  });

  it("keeps next-day rematches with a different kickoff time", async () => {
    const now = Date.now();
    const primaryISO = new Date(now - 2 * 3600_000).toISOString();
    const rematchISO = new Date(now + 23 * 3600_000).toISOString();
    const rematchDate = new Date(rematchISO)
      .toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
      .slice(0, 10);

    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({ homeTeam: "Inter Bogotá", awayTeam: "Medellín", league: "Liga BetPlay", dateISO: primaryISO }),
    ]);
    (fetchEventAgenda as jest.Mock).mockResolvedValue([
      {
        slug: "inter-bogota-vs-medellin-rematch",
        homeTeam: "Inter Bogotá",
        awayTeam: "Medellín",
        league: "Liga BetPlay",
        dateISO: rematchISO,
        sources: [{ id: "2", name: "Win Sports" }],
      },
    ]);

    const res = await GET(makeRequest(rematchDate));
    const data = await res.json();

    expect(data.matches).toHaveLength(2);
  });

  it("excludes matches that already finished", async () => {
    const date = todayISO();
    const now = Date.now();
    const argISO = (d: Date) => d.toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires", hour12: false }).replace(" ", "T") + "-03:00";
    // A fixture that kicked off 6h ago (well past the 4h FT threshold), an
    // in-progress one, and an upcoming one.
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({ homeTeam: "Racing Club", awayTeam: "Independiente", dateISO: argISO(new Date(now - 6 * 3600_000)) }),
      flMatch({ homeTeam: "San Lorenzo", awayTeam: "Huracán", dateISO: argISO(new Date(now - 30 * 60_000)) }),
      flMatch({ homeTeam: "Vélez", awayTeam: "Lanús", dateISO: argISO(new Date(now + 2 * 3600_000)) }),
    ]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([
      secMatch({ homeTeam: "Talleres", awayTeam: "Belgrano", dateISO: argISO(new Date(now - 7 * 3600_000)) }),
    ]);
    (fetchEventAgenda as jest.Mock).mockResolvedValue([
      {
        slug: "newells-old-boys-vs-rosario-central",
        homeTeam: "Newell's Old Boys",
        awayTeam: "Rosario Central",
        league: "Liga Profesional",
        dateISO: argISO(new Date(now - 8 * 3600_000)),
        sources: [{ id: "9", name: "Canal" }],
      },
    ]);

    const res = await GET(makeRequest(date));
    const data = await res.json();

    const pairs = data.matches.map((m: { homeTeam: { name: string }; awayTeam: { name: string } }) => `${m.homeTeam.name} vs ${m.awayTeam.name}`);
    expect(pairs).not.toContain("Racing Club vs Independiente");
    expect(pairs).not.toContain("Talleres vs Belgrano");
    expect(pairs).not.toContain("Newell's Old Boys vs Rosario Central");
    // Live and upcoming fixtures stay.
    expect(pairs).toContain("San Lorenzo vs Huracán");
    expect(pairs).toContain("Vélez vs Lanús");
  });

  it("includes MLS and ignores the same fixture from the secondary agenda", async () => {
    const date = todayISO();
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({
        homeTeam: "Inter Miami",
        awayTeam: "Atlanta United",
        league: "Major League Soccer",
        dateISO: `${date}T23:30:00.000-03:00`,
      }),
    ]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([
      secMatch({
        homeTeam: "Atlanta United",
        awayTeam: "Inter Miami",
        league: "MLS",
        dateISO: `${date}T23:00:00.000-03:00`,
      }),
    ]);

    const res = await GET(makeRequest(date));
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].league.id).toBe(332);
    expect(data.matches[0]).toHaveProperty("_eventSources");
  });

  it("deduplicates the same Ecuador match across league labels and date formats", async () => {
    const date = todayISO();
    const primaryDate = `${date}T21:00:00.000Z`;
    const secondaryDate = `${date}T18:00:00.000-03:00`;
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({
        homeTeam: "Barcelona SC",
        awayTeam: "LDU Quito",
        league: "Serie A",
        dateISO: primaryDate,
      }),
    ]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([
      secMatch({
        homeTeam: "Barcelona SC",
        awayTeam: "LDU Quito",
        league: "Serie A Ecuador",
        dateISO: secondaryDate,
      }),
    ]);

    const res = await GET(makeRequest(date));
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].league.id).toBe(57);
    expect(data.matches[0]).toHaveProperty("_eventSources");
  });

  it("deduplicates club-name variants across all three agendas", async () => {
    const date = todayISO();
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({
        homeTeam: "Nacional",
        awayTeam: "Liverpool",
        league: "Liga AUF Uruguaya",
        dateISO: `${date}T19:30:00-03:00`,
        slug: "nacional-liverpool",
      }),
      flMatch({
        homeTeam: "Atlético Nacional",
        awayTeam: "Medellín",
        league: "Liga BetPlay",
        dateISO: `${date}T20:10:00-03:00`,
        slug: "atletico-nacional-medellin",
      }),
    ]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([
      secMatch({
        homeTeam: "Nacional",
        awayTeam: "Liverpool M.",
        league: "Primera División de Uruguay",
        dateISO: `${date}T19:30:00-03:00`,
      }),
      secMatch({
        homeTeam: "Independiente Medellín",
        awayTeam: "Atlético Nacional",
        league: "Liga BetPlay",
        dateISO: `${date}T20:10:00-03:00`,
      }),
    ]);
    (fetchEventAgenda as jest.Mock).mockResolvedValue([
      {
        slug: "nacional-liverpool-montevideo",
        homeTeam: "Club Nacional de Football",
        awayTeam: "Liverpool Montevideo",
        league: "Primera División",
        dateISO: `${date}T19:30:00-03:00`,
        sources: [{ id: "1", name: "Canal" }],
      },
      {
        slug: "atletico-nacional-independiente-medellin",
        homeTeam: "Atlético Nacional",
        awayTeam: "DIM",
        league: "Liga BetPlay",
        dateISO: `${date}T20:10:00-03:00`,
        sources: [{ id: "2", name: "Canal" }],
      },
    ]);

    const res = await GET(makeRequest(date));
    const data = await res.json();

    expect(data.matches).toHaveLength(2);
    expect(data.matches.map((match: { homeTeam: { name: string } }) => match.homeTeam.name)).toEqual([
      "Nacional",
      "Atlético Nacional",
    ]);
  });

  it("deduplicates Bogotá and Costa Rica club abbreviations across agenda sources", async () => {
    const date = todayISO();
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({
        homeTeam: "Alianza",
        awayTeam: "Inter Bogotá",
        league: "Liga BetPlay",
        dateISO: `${date}T18:05:00-03:00`,
      }),
      flMatch({
        homeTeam: "Alajuelense",
        awayTeam: "Pérez Zeledón",
        league: "Primera División",
        dateISO: `${date}T21:00:00-03:00`,
      }),
    ]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([
      secMatch({
        homeTeam: "Alianza Valledupar",
        awayTeam: "Internacional de Bogotá",
        league: "Primera División",
        dateISO: `${date}T18:05:00-03:00`,
      }),
      secMatch({
        homeTeam: "LD Alajuelense",
        awayTeam: "Pérez Zeledón",
        league: "Primera División",
        dateISO: `${date}T21:00:00-03:00`,
      }),
    ]);

    const res = await GET(makeRequest(date));
    const data = await res.json();

    expect(data.matches).toHaveLength(2);
    expect(data.matches[0].homeTeam.name).toBe("Alianza");
    expect(data.matches[1].homeTeam.name).toBe("Alajuelense");
  });

  it("keeps similarly named Alianza clubs distinct", async () => {
    const date = todayISO();
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({
        homeTeam: "Alianza",
        awayTeam: "Universitario",
        league: "Liga 1",
        dateISO: `${date}T18:05:00-03:00`,
      }),
      flMatch({
        homeTeam: "Alianza Valledupar",
        awayTeam: "Universitario",
        league: "Liga BetPlay",
        dateISO: `${date}T18:05:00-03:00`,
      }),
    ]);

    const res = await GET(makeRequest(date));
    const data = await res.json();

    expect(data.matches).toHaveLength(2);
  });

  it("deduplicates equivalent team aliases in Bundesliga fixtures", async () => {
    const date = todayISO();
    (fetchAgenda as jest.Mock).mockResolvedValue([
      flMatch({
        homeTeam: "Nürnberg",
        awayTeam: "Wolfsburg",
        league: "Bundesliga",
        slug: "nurnberg-wolfsburg-a",
        dateISO: `${date}T21:00:00.000Z`,
      }),
      flMatch({
        homeTeam: "1. FC Nürnberg",
        awayTeam: "VfL Wolfsburg",
        league: "Bundesliga",
        slug: "nurnberg-wolfsburg-b",
        dateISO: `${date}T18:00:00.000-03:00`,
      }),
    ]);

    const res = await GET(makeRequest(date));
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].league.id).toBe(78);
  });

  it("skips secondary matches with unrecognized league", async () => {
    (fetchAgenda as jest.Mock).mockResolvedValue([]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([
      secMatch({ league: "Superliga de Irlanda del Norte" }),
    ]);

    const req = makeRequest(todayISO());
    const res = await GET(req);
    const data = await res.json();

    expect(data.matches).toHaveLength(0);
  });

  it("skips secondary matches outside the requested date", async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    (fetchAgenda as jest.Mock).mockResolvedValue([]);
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([secMatch({ dateISO: yesterday })]);

    const req = makeRequest(todayISO());
    const res = await GET(req);
    const data = await res.json();

    expect(data.matches).toHaveLength(0);
  });
});
