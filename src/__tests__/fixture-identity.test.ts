/** @jest-environment node */
import { canonicalTeamForDedup, fixtureTeamPair } from "@/lib/fixture-identity";
import { TEAM_DISPLAY_NAMES } from "@/lib/constants";
import { cleanAgendaText } from "@/lib/agenda-text";
import { parseStrapiAgenda } from "@/lib/agenda-source";
import { parseAgendaHTML } from "@/lib/event-source";

describe("fixture identity", () => {
  it.each(Object.entries(TEAM_DISPLAY_NAMES))("uses the same identity for display variants %s / %s", (full, short) => {
    expect(canonicalTeamForDedup(full, 0)).toBe(canonicalTeamForDedup(short, 0));
  });

  it.each([
    [268, "Racing", "Racing de Montevideo"],
    [268, "Wanderers", "Montevideo Wanderers"],
    [930, "Racing Club de Montevideo", "Racing"],
    [78, "Bayern München", "Bayern Múnich"],
    [128, "Talleres Córdoba", "Talleres de Córdoba"],
    [143, "A.E. Prat", "Prat"],
    [39, "Brighton &amp;amp; Hove Albion", "Brighton"],
  ])("canonicalizes provider names in league %s: %s / %s", (league, first, second) => {
    expect(canonicalTeamForDedup(first, league)).toBe(canonicalTeamForDedup(second, league));
  });

  it.each([
    [140, "Real Sociedad", "Real Sociedad II"],
    [140, "Celta de Vigo", "Celta de Vigo II"],
    [39, "Manchester City", "Manchester United"],
    [265, "Santiago Wanderers", "Montevideo Wanderers"],
    [128, "Racing Club", "Racing de Montevideo"],
    [39, "Arsenal", "Arsenal Academy"],
  ])("preserves distinct teams in league %s: %s / %s", (league, first, second) => {
    expect(canonicalTeamForDedup(first, league)).not.toBe(canonicalTeamForDedup(second, league));
  });

  it("handles reversed home/away ordering without depending on a source slug", () => {
    expect(fixtureTeamPair("Tottenham Hotspur", "Crystal Palace", 39))
      .toBe(fixtureTeamPair("Crystal Palace", "Tottenham", 39));
  });
});

describe("agenda text ingestion", () => {
  it("decodes named, numeric, repeated entities and whitespace", () => {
    expect(cleanAgendaText("  Atl&eacute;tico&nbsp; de  Madrid &#38; Brighton &amp;amp; Hove "))
      .toBe("Atlético de Madrid & Brighton & Hove");
  });

  it("decodes both original provider formats before classification and badge lookup", () => {
    const primary = parseStrapiAgenda([{
      id: 1, diary_description: "Premier League: Manchester City vs Brighton &amp; Hove Albion",
      date_diary: "2026-10-31", diary_hour: "10:00:00",
    }]);
    const event = parseAgendaHTML(`<div class="source-agenda-event" data-source-instant="2026-10-31T15:00:00Z">
      <span class="source-agenda-eventtext"><strong><span class="source-agenda-competition">Premier League:</span>
      Manchester City vs Brighton &amp;amp; Hove Albion</strong></span>
      </div><div class="channels-title">Channels</div>`);
    expect(primary[0].awayTeam).toBe("Brighton & Hove Albion");
    expect(event[0].awayTeam).toBe(primary[0].awayTeam);
    expect(new Date(event[0].dateISO).getTime()).toBe(new Date(primary[0].dateISO).getTime());
  });
});
