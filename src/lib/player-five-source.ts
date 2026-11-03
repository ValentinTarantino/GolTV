import { createHash } from "node:crypto";
import { matchTeamsPair } from "./team-matching";
import type { Channel } from "./types";

type Row = { evento?: string; competencia?: string; fecha?: string; canales?: { name?: string; iframe?: string; options?: { name?: string; iframe?: string }[] }[] };

export function parsePlayerFiveAgenda(data: unknown) {
  const events = (data as { events?: Row[] } | null)?.events;
  if (!Array.isArray(events)) return [];
  return events.flatMap((event) => {
    if (typeof event?.evento !== "string" || typeof event.fecha !== "string") return [];
    const competition = (event.competencia || event.evento.split(":")[0])
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!/^(?:Argentina\s*[-:]?\s*)?(?:Primera (?:B )?Nacional|B Nacional|Nacional B)(?:\s+(?:Argentina|\(Argentina\)|\d{4}))*$/i.test(competition)) return [];
    const teams = event.evento.replace(/^.*:\s*/, "").split(/\s+vs\.?\s+/i).map(team => team.trim());
    if (teams.length !== 2 || teams.some(team => !team)) return [];
    // The feed publishes Argentina wall-clock times without a timezone.
    const dateText = event.fecha.trim().replace(" ", "T");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?$/.test(dateText)) return [];
    const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(dateText) ? dateText : `${dateText}-03:00`);
    if (!Number.isFinite(date.getTime())) return [];
    const channels = parsePlayerFiveChannels({ events: [event] }, teams[0], teams[1]);
    if (!channels.length) return [];
    return [{ homeTeam: teams[0], awayTeam: teams[1], league: "Primera Nacional",
      dateISO: date.toISOString(),
      slug: `player-five-${createHash("sha256").update(`${teams.join("|")}|${date.toISOString()}`).digest("hex").slice(0, 16)}`,
      hasStreams: true }];
  });
}

export function parsePlayerFiveChannels(data: unknown, home: string, away: string): Channel[] {
  const events = (data as { events?: Row[] } | null)?.events;
  if (!Array.isArray(events)) return [];
  const channels: Channel[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    if (typeof event?.evento !== "string" || /basket|nba|tenis|tennis|voley|voleibol|futsal/i.test(event.evento)) continue;
    const teams = event.evento.replace(/^.*:\s*/, "").split(/\s+vs\.?\s+/i);
    if (teams.length !== 2 || !matchTeamsPair(teams[0], teams[1], home, away)) continue;
    if (!Array.isArray(event.canales)) continue;
    for (const channel of event.canales) {
      if (!channel || typeof channel !== "object") continue;
      const options = Array.isArray(channel.options) ? channel.options : [{ iframe: channel.iframe, name: "Opción 1" }];
      for (const option of options) {
        if (typeof option?.iframe !== "string") continue;
        try {
          const url = new URL(option.iframe);
          if (url.protocol !== "https:" || url.username || url.password || seen.has(url.href)) continue;
          seen.add(url.href);
          channels.push({ id: `player-five-${createHash("sha256").update(url.href).digest("hex").slice(0, 16)}`,
            name: `${channel.name || "Canal"} · ${option.name || "Opción"}`,
            url: url.href, kind: /\.m3u8$/i.test(url.pathname) ? "hls" : "iframe" });
        } catch { /* Ignore malformed source URLs. */ }
      }
    }
  }
  return channels;
}

let cached: { url: string; data: unknown; expires: number } | undefined;
async function fetchPlayerFiveData(): Promise<unknown> {
  const url = process.env.PLAYER_FIVE_AGENDA_URL?.trim();
  if (!url) return null;
  try {
    if (!cached || cached.url !== url || cached.expires <= Date.now()) {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) return [];
      cached = { url, data: await response.json(), expires: Date.now() + 60_000 };
    }
    return cached.data;
  } catch {
    console.warn("[player-five] Agenda unavailable");
    return [];
  }
}

export async function fetchPlayerFiveAgenda() {
  return parsePlayerFiveAgenda(await fetchPlayerFiveData());
}

export async function findPlayerFiveStreams(home: string, away: string): Promise<Channel[]> {
  if (!home || !away) return [];
  return parsePlayerFiveChannels(await fetchPlayerFiveData(), home, away);
}
