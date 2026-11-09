/** @jest-environment node */
import { NextRequest } from "next/server";
import { GET } from "@/app/api/secondary/route";
import { getCache, setCache } from "@/lib/cache";

jest.mock("@/lib/cache", () => ({ getCache: jest.fn(), setCache: jest.fn() }));

const AGENDA = "https://agenda.test/index.php";
const CHANNEL = "https://agenda.test/espn-deportes.php";

function request(page: string, language: "es" | "en" = "es") {
  return new NextRequest(`http://localhost/api/secondary?u=${encodeURIComponent(page)}&lang=${language}`);
}

describe("/api/secondary bare frame", () => {
  const originalFetch = global.fetch;
  const originalAgenda = process.env.SECONDARY_AGENDA_URL;
  const originalHosts = process.env.SECONDARY_PLAYER_WRAPPER_HOSTS;
  const pages = new Map<string, string>();
  const values = new Map<string, unknown>();

  beforeEach(() => {
    pages.clear();
    values.clear();
    jest.mocked(getCache).mockImplementation(async (key) => (values.get(key) as never) ?? null);
    jest.mocked(setCache).mockImplementation(async (key, value) => { values.set(key, value); });
    process.env.SECONDARY_AGENDA_URL = AGENDA;
    process.env.SECONDARY_PLAYER_WRAPPER_HOSTS = "wrapper.test";
    pages.set(CHANNEL, '<iframe allowfullscreen src="https://wrapper.test/channel1"></iframe>');
    pages.set("https://wrapper.test/channel1", '<iframe allowfullscreen src="https://player.test/stream/75"></iframe>');
    global.fetch = jest.fn(async (url: string) => ({
      ok: pages.has(url),
      status: pages.has(url) ? 200 : 404,
      text: async () => pages.get(url) ?? "",
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalAgenda === undefined) delete process.env.SECONDARY_AGENDA_URL;
    else process.env.SECONDARY_AGENDA_URL = originalAgenda;
    if (originalHosts === undefined) delete process.env.SECONDARY_PLAYER_WRAPPER_HOSTS;
    else process.env.SECONDARY_PLAYER_WRAPPER_HOSTS = originalHosts;
  });

  it("refuses hosts outside the agenda and wrapper allowlist", async () => {
    const foreign = await GET(request("https://attacker.example/player.php"));
    expect(foreign.status).toBe(403);

    const insecure = await GET(request("http://agenda.test/player.php"));
    expect(insecure.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("frames only the deepest player on a black document", async () => {
    const res = await GET(request(CHANNEL));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain('<iframe src="https://player.test/stream/75"');
    expect(body).toContain("background: #000");
    // The scraped wrapper chain must never be rendered to the visitor.
    expect(body).not.toContain("wrapper.test");
    expect(body).not.toContain("agenda.test/espn-deportes.php");
  });

  it("answers a dark waiting panel when no player is published yet", async () => {
    pages.set(CHANNEL, "<html><body><div class='post-body'></div></body></html>");
    const res = await GET(request(CHANNEL));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain("Esperando señal");
    expect(body).not.toContain("<iframe");
  });

  it("renders one English waiting phrase when requested", async () => {
    pages.set(CHANNEL, "<html><body><div class='post-body'></div></body></html>");
    const res = await GET(request(CHANNEL, "en"));
    const body = await res.text();

    expect(body).toContain('<html lang="en">');
    expect(body).toContain("Waiting for signal");
    expect(body).not.toContain("Esperando");
    expect(body).toContain('class="signal-loader"');
    expect(body.match(/class="signal-bar"/g)).toHaveLength(5);
    expect(body).toContain("prefers-reduced-motion: reduce");
  });

  it("treats an unreachable wrapper as unpublished instead of forwarding it", async () => {
    pages.delete(CHANNEL);
    const res = await GET(request(CHANNEL));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain("Esperando señal");
    expect(global.fetch).toHaveBeenCalledWith(CHANNEL, expect.objectContaining({ redirect: "error" }));
  });
});
