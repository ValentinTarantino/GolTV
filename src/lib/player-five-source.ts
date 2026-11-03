import { createHash } from "node:crypto";
import { matchTeamsPair } from "./team-matching";
import type { Channel } from "./types";

type Row = { evento?: string; fecha?: string; canales?: { name?: string; iframe?: string; options?: { name?: string; iframe?: string }[] }[] };

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
export async function findPlayerFiveStreams(home: string, away: string): Promise<Channel[]> {
  const url = process.env.PLAYER_FIVE_AGENDA_URL?.trim();
  if (!url || !home || !away) return [];
  try {
    if (!cached || cached.url !== url || cached.expires <= Date.now()) {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) return [];
      cached = { url, data: await response.json(), expires: Date.now() + 60_000 };
    }
    return parsePlayerFiveChannels(cached.data, home, away);
  } catch {
    console.warn("[player-five] Agenda unavailable");
    return [];
  }
}
