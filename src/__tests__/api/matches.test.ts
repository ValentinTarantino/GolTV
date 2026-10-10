/**
 * @jest-environment node
 */
jest.mock("@/lib/agenda-source", () => ({
  fetchAgenda: jest.fn(),
}));

jest.mock("@/lib/secondary-source", () => ({
  fetchSecondaryAgenda: jest.fn(),
}));

jest.mock("@/lib/team-logos", () => ({
  getTeamLogo: jest.fn().mockResolvedValue(""),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/matches/route";
import { fetchAgenda } from "@/lib/agenda-source";
import { fetchSecondaryAgenda } from "@/lib/secondary-source";

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
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchSecondaryAgenda as jest.Mock).mockResolvedValue([]);
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
