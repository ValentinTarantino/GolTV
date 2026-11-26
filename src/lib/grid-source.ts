import { createHash } from "node:crypto";
import { getCache, setCache } from "./cache";
import { toHlsProxyUrl } from "./hls-proxy";
import { matchTeamsPair } from "./team-matching";
import type { Channel } from "./types";

function boardApi(): string {
  return (process.env.GRID_API_BASE?.trim() ?? "").replace(/\/+$/, "");
}

function mediaBase(): string {
  return (process.env.GRID_MEDIA_BASE?.trim() ?? "").replace(/\/+$/, "");
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BOARD_CACHE_TTL = 45_000;
const LIVE_PROBE_TTL = 20_000;
const MAX_CHANNELS = 6;
const PROBE_TIMEOUT_MS = 8_000;

/**
 * Signal id → media path on the file host. The board lists events with
 * provider signal ids; only the ids below resolve to a playable playlist —
 * per-event provider signals (captures, affiliates) are intentionally absent
 * because they need credentials this integration does not have.
 */
const SIGNAL_PATHS: Record<string, string> = {
  "dazn-25": "dliga",
  "dazn-50": "daznliga",
  "dazn-25-2": "dliga2",
  "dazn-50-2": "daznliga2",
  "dazn-1": "dazn-1",
  "dazn-2": "dazn-2",
  "dazn-f1": "dazn-f1",
  "dazn-redbull": "dazn-redbull",
  "dazn-rally": "dazn-rally",
  "dazn-unbeaten": "dazn-unbeaten",
  "dazn-primera": "dazn-primera",
  "movistar-liga": "mliga",
  "movistar-liga-2": "mliga2",
  "movistar-liga-3": "mliga3",
  "movistar-champions": "mligacamp",
  "movistar-champions-2": "mligacamp2",
  "movistar-champions-3": "mligacamp3",
  "movistar-champions-4": "mligacamp4",
  "movistar-champions-5": "mligacamp5",
  "movistar-champions-6": "mligacamp6",
  "movistar-champions-7": "mligacamp7",
  "movistar-champions-8": "mligacamp8",
  "movistar-champions-9": "mligacamp9",
  "movistar-champions-10": "mligacamp10",
  "movistar-champions-11": "mligacamp11",
  "movistar-champions-12": "mligacamp12",
  "movistar-champions-13": "mligacamp13",
  "movistar-champions-14": "mligacamp14",
  "movistar-champions-15": "mligacamp15",
  "movistar-champions-16": "mligacamp16",
  "movistar-champions-17": "mligacamp17",
  "movistar-champions-18": "mligacamp18",
  "movistar-champions-19": "mligacamp19",
  hypermotion: "hyper",
  "hypermotion-2": "hyper2",
  eurosport1: "eurosport1",
  eurosport2: "eurosport2",
  vamos: "vamos",
  vamos2: "vamos2",
  vamos3: "vamos3",
  mdeportes: "mdeportes",
  mdeportes2: "mdeportes2",
  mdeportes3: "mdeportes3",
  baloncesto: "baloncesto",
  baloncesto2: "baloncesto2",
  daznf1m: "daznf1m",
  motogp: "motogp",
  dazn1m: "dazn1m",
  dazn2m: "dazn2m",
  mplus: "mplus",
  la1: "la1",
  "iptv-daznf1": "iptv-daznf1",
  "iptv-2": "iptv-2",
  "iptv-3": "iptv-3",
  "iptv-4": "iptv-4",
  "iptv-5": "iptv-5",
};

type BoardBroadcast = {
  signalId?: string;
  availability?: string;
  priority?: number;
};

type BoardEvent = {
  home?: string;
  away?: string;
  sport?: string;
  broadcasts?: BoardBroadcast[];
};

type ProgrammingBoard = {
  canonicalEvents?: BoardEvent[];
};

async function fetchBoard(): Promise<ProgrammingBoard | null> {
  const cacheKey = "grid:board";
  const cached = await getCache<ProgrammingBoard>(cacheKey);
  if (cached) return cached;
  try {
    const res = await fetch(`${boardApi()}/api/programming/home`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const board = (await res.json()) as ProgrammingBoard;
    await setCache(cacheKey, board, BOARD_CACHE_TTL);
    return board;
  } catch {
    return null;
  }
}

function playlistUrl(path: string): string {
  return `${mediaBase()}/${path}/index.m3u8`;
}

/**
 * Playlists only exist on the file host while the signal is actually
 * broadcasting, so candidates are probed and dead ones dropped — a viewer
 * never gets a channel that answers 404.
 */
async function probeLive(url: string): Promise<boolean> {
  const cacheKey = `grid:live:${url}`;
  const cached = await getCache<boolean>(cacheKey);
  if (cached !== null) return cached;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });
    const live = res.ok && (await res.text()).includes("#EXTM3U");
    await setCache(cacheKey, live, LIVE_PROBE_TTL);
    return live;
  } catch {
    await setCache(cacheKey, false, LIVE_PROBE_TTL);
    return false;
  }
}

/**
 * The board's per-match player, as sealed HLS channels.
 *
 * The upstream publishes a daily programming grid where every fixture lists
 * the signals carrying it. Each signal resolves to a media-hosted HLS
 * playlist; only the signals live at request time are offered. Channel URLs
 * go through the same sealed relay every other HLS source uses, so provider
 * hosts and playlist internals never reach the browser.
 */
export async function findGridStreams(homeTeam: string, awayTeam: string): Promise<Channel[]> {
  if (!boardApi() || !mediaBase()) return [];
  const board = await fetchBoard();
  const events = board?.canonicalEvents;
  if (!events?.length) return [];

  const urls: string[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    if (!event.home || !event.away) continue;
    if (!matchTeamsPair(event.home, event.away, homeTeam, awayTeam)) continue;
    const broadcasts = [...(event.broadcasts ?? [])].sort(
      (a, b) => (a.priority ?? 0) - (b.priority ?? 0)
    );
    for (const broadcast of broadcasts) {
      if (broadcast.availability === "off" || !broadcast.signalId) continue;
      const path = SIGNAL_PATHS[broadcast.signalId];
      if (!path) continue;
      const url = playlistUrl(path);
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
  }
  if (!urls.length) return [];

  const live = await Promise.all(urls.slice(0, MAX_CHANNELS * 2).map(probeLive));
  const channels: Channel[] = [];
  for (let i = 0; i < urls.length && channels.length < MAX_CHANNELS; i++) {
    if (!live[i]) continue;
    const url = urls[i];
    channels.push({
      id: `grid-${createHash("sha256").update(url).digest("hex").slice(0, 16)}`,
      name: `Señal ${channels.length + 1}`,
      url: toHlsProxyUrl(url),
      kind: "hls",
    });
  }
  return channels;
}
