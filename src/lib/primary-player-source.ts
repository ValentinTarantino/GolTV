import { createDecipheriv, createHash } from "node:crypto";
import { matchTeamsPair } from "./team-matching";
import { isMenFootballMatch } from "./constants";
import type { Channel } from "./types";

type FeedMatch = {
  sport?: string; league?: string; starts_at?: string;
  home?: { name?: string }; away?: { name?: string };
  streams?: { name?: string; origin?: string; embed_url?: string; real_url?: string | null }[];
};

/** Decode the public feed format; configuration stays on the server. */
export function decodePrimaryFeed(raw: string, key: string, alphabet: string, plain: string): unknown {
  const text = raw.trim();
  if (!text.startsWith("k1")) return JSON.parse(text);
  if (alphabet.length !== 64 || new Set(alphabet).size !== 64 || plain.length !== 64) throw new Error("Invalid feed configuration");
  const mapped = Array.from(text.slice(2)).reverse().map(char => {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid feed payload");
    return plain[index];
  }).join("");
  const bytes = Buffer.from(mapped, "base64url");
  const secret = Buffer.from(key, "base64");
  if (secret.length !== 32 || bytes.length < 28) throw new Error("Invalid feed payload");
  const decipher = createDecipheriv("aes-256-gcm", secret, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(-16));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString("utf8"));
}

export function parsePrimaryChannels(data: unknown, home: string, away: string): Channel[] {
  const matches = (data as { matches?: FeedMatch[] } | null)?.matches;
  if (!Array.isArray(matches)) return [];
  const channels: Channel[] = [];
  for (const match of matches) {
    if (!match || match.sport !== "futbol" || typeof match.home?.name !== "string" || typeof match.away?.name !== "string") continue;
    if (!isMenFootballMatch(match.league ?? "", match.home.name, match.away.name)) continue;
    if (!matchTeamsPair(match.home.name, match.away.name, home, away)) continue;
    if (!Array.isArray(match.streams)) continue;
    for (const stream of match.streams) {
      // Prefer a published media playlist when one is available. An HLS URL
      // avoids the provider's frame policy and can be played by HlsPlayer.
      // Otherwise retain the published embed page as the only safe fallback.
      // Keep every feed entry, including repeated URLs and names.
      const direct = typeof stream?.real_url === "string" && /\.m3u8(?:[?#]|$)/i.test(stream.real_url)
        ? stream.real_url
        : undefined;
      const candidate = direct || stream?.embed_url || (stream?.origin === "generated" ? stream.real_url : undefined);
      if (typeof candidate !== "string") continue;
      try {
        const url = new URL(candidate);
        if (url.protocol !== "https:" || url.username || url.password) continue;
        const name = typeof stream.name === "string" ? stream.name.trim() : "";
        const kind = /\.m3u8$/i.test(url.pathname) ? "hls" : "iframe";
        channels.push({
          id: `primary-${createHash("sha256").update(url.href).digest("hex").slice(0, 16)}-${channels.length + 1}`,
          name: name || `Señal ${channels.length + 1}`,
          url: url.href, kind,
          ...(kind === "iframe" ? { provider: "primary-feed" as const } : {}),
        });
      } catch { /* Ignore malformed entries without losing other signals. */ }
    }
  }
  return channels;
}

let cached: { config: string; data: unknown; expires: number } | undefined;
let pending: { config: string; promise: Promise<unknown> } | undefined;

export async function findPrimaryStreams(home: string, away: string): Promise<Channel[]> {
  const url = process.env.PRIMARY_PLAYER_AGENDA_URL?.trim();
  if (!url || !home || !away) return [];
  const key = process.env.PRIMARY_PLAYER_DATA_KEY ?? "";
  const alphabet = process.env.PRIMARY_PLAYER_DATA_ALPHABET ?? "";
  const plain = process.env.PRIMARY_PLAYER_PLAIN_ALPHABET ?? "";
  const config = createHash("sha256").update(JSON.stringify([url, key, alphabet, plain])).digest("hex");
  try {
    if (!cached || cached.config !== config || cached.expires <= Date.now()) {
      if (!pending || pending.config !== config) {
        const promise = (async () => {
          const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
          if (!response.ok) throw new Error("Feed unavailable");
          const data = decodePrimaryFeed(await response.text(), key, alphabet, plain);
          cached = { config, data, expires: Date.now() + 60_000 };
          return data;
        })();
        pending = { config, promise };
      }
      const current = pending;
      try { return parsePrimaryChannels(await current.promise, home, away); }
      finally { if (pending === current) pending = undefined; }
    }
    return parsePrimaryChannels(cached.data, home, away);
  } catch {
    console.warn("[primary-player] Source unavailable");
    return [];
  }
}
