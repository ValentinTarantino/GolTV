/**
 * @jest-environment node
 */
import { parseSecondaryAgenda, findSecondaryStreams } from "@/lib/secondary-source";
import { deleteCache } from "@/lib/cache";

const HTML = `
<ul class="menu">
<center><div><b>Agenda - Jueves 1 de Octubre 2026</b></div></center>
<li class="AR"><a href="#">
Copa Argentina: Platense vs Estudiantes LP
<span class="t">01:15</span></a>
<ul>
<li class="subitem1"><a href="/eventos.html?r=QUJDRA==" target="_blank">TyC Sports<span>Calidad 720p</span></a></li>
</ul>
</li>
<li class="AR"><a href="#">
Liga Profesional: Independiente vs Instituto
<span class="t">23:15</span></a>
<ul>
<li class="subitem1"><a href="/eventos.html?r=RUNBRAA=" target="_blank">ESPN Premium<span>Calidad 720p</span></a></li>
<li class="subitem1"><a href="/eventos.html?r=VE5UQ==" target="_blank">TNT Sports<span>Calidad 720p</span></a></li>
</ul>
</li>
<li class="AR"><a href="#">Texto sin partido<span class="t">10:00</span></a><ul></ul></li>
<center><div><b>Agenda - Sábado 3 de Octubre 2026</b></div></center>
<li class="AR"><a href="#">
Liga Profesional: Boca Juniors vs Union Santa Fe
<span class="t">04:30</span></a>
<ul>
<li class="subitem1"><a href="/eventos.html?r=RElT" target="_blank">Disney+<span>Calidad 720p</span></a></li>
</ul>
</li>
</ul>
`;

describe("parseSecondaryAgenda", () => {
  it("parses matches, leagues, teams and sources", () => {
    const matches = parseSecondaryAgenda(HTML);

    expect(matches).toHaveLength(3);

    expect(matches[0]).toMatchObject({
      homeTeam: "Platense",
      awayTeam: "Estudiantes LP",
      league: "Copa Argentina",
      sources: [{ id: "QUJDRA==", name: "TyC Sports" }],
    });

    expect(matches[1]).toMatchObject({
      homeTeam: "Independiente",
      awayTeam: "Instituto",
      league: "Liga Profesional",
    });
    expect(matches[1].sources).toHaveLength(2);
    expect(matches[1].sources[1]).toEqual({ id: "VE5UQ==", name: "TNT Sports" });
  });

  it("converts shown times to Argentine time (UTC+1 clock -> ARS)", () => {
    const matches = parseSecondaryAgenda(HTML);

    // 01:15 shown under Oct 1 => (1 - 4) mod 24 = 21:15 on Oct 1 (AR)
    expect(matches[0].dateISO).toBe("2026-10-01T21:15:00-03:00");
    // 23:15 shown under Oct 1 => 19:15 on Oct 1
    expect(matches[1].dateISO).toBe("2026-10-01T19:15:00-03:00");
    // 04:30 shown under Oct 3 => 00:30 on Oct 3
    expect(matches[2].dateISO).toBe("2026-10-03T00:30:00-03:00");
  });

  it("switches day headers and skips items without a team pairing", () => {
    const matches = parseSecondaryAgenda(HTML);

    // "Texto sin partido" (no "vs") is skipped; Boca appears under the second header
    expect(matches.map((m) => m.homeTeam)).toEqual(["Platense", "Independiente", "Boca Juniors"]);
    expect(matches[2].dateISO.startsWith("2026-10-03")).toBe(true);
  });

  it("generates a stable slug from the teams", () => {
    const matches = parseSecondaryAgenda(HTML);
    expect(matches[0].slug).toBe("platense-vs-estudiantes-lp");
  });

  it("returns an empty list for unrelated HTML", () => {
    expect(parseSecondaryAgenda("<html><body>Nothing here</body></html>")).toEqual([]);
  });
});

describe("findSecondaryStreams", () => {
  const directUrl = "https://streamx.test/global1.php?channel=1";
  const validR = Buffer.from(directUrl).toString("base64");
  const undecodableR = Buffer.from("not-a-url").toString("base64");

  const agendaHtml = `
<b>Agenda - Viernes 2 de Octubre 2026</b>
<li class="AR"><a href="#">
Copa Argentina: Platense vs Estudiantes LP
<span class="t">21:15</span></a>
<ul>
<li class="subitem1"><a href="/eventos.html?r=${validR}" target="_blank">TyC Sports<span>Calidad 720p</span></a></li>
<li class="subitem1"><a href="/eventos.html?r=${undecodableR}" target="_blank">Otra Senal<span>Calidad 720p</span></a></li>
</ul>
</li>`;

  beforeAll(() => {
    process.env.SECONDARY_AGENDA_URL = "https://fixtures.test/agenda.html";
    process.env.SECONDARY_EVENT_BASE = "https://fixtures.test/eventos.html";
  });

  afterAll(() => {
    delete process.env.SECONDARY_AGENDA_URL;
    delete process.env.SECONDARY_EVENT_BASE;
  });

  beforeEach(async () => {
    await deleteCache("secondary:agenda");
    (globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => agendaHtml,
    });
  });

  afterAll(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it("embeds the bare player URL decoded from r (no wrapper chrome)", async () => {
    const channels = await findSecondaryStreams("Platense", "Estudiantes LP");

    expect(channels).toHaveLength(2);
    expect(channels[0]).toEqual({
      id: "secondary-1",
      name: "TyC Sports",
      url: directUrl,
      kind: "iframe",
    });
  });

  it("falls back to the wrapper URL when r does not decode to an http(s) URL", async () => {
    const channels = await findSecondaryStreams("Platense", "Estudiantes LP");

    expect(channels[1].url).toBe(`https://fixtures.test/eventos.html?r=${undecodableR}`);
  });

  it("returns an empty list when no team matches", async () => {
    const channels = await findSecondaryStreams("Boca Juniors", "River Plate");
    expect(channels).toEqual([]);
  });
});
