import { getCache, setCache } from "./cache";
import type { Channel } from "./types";

/**
 * Liveness probe for agenda events: kickoff time alone cannot tell a
 * transmitting session from a dead feed — providers keep listing events
 * whose signal already ended. Events in the live window get their HLS
 * playlists probed through the same sealed relay the player uses; only a
 * live answer keeps the "live" badge.
 */

const ALIVE_CACHE_TTL = 90_000;
const PROBE_TIMEOUT_MS = 6_000;

/** True when at least one of the channels' HLS playlists answers #EXTM3U. */
export async function channelsSignalAlive(channels: Channel[]): Promise<boolean> {
  const hls = channels.filter((c) => c.kind === "hls" || /\.m3u8/i.test(c.url));
  if (hls.length === 0) {
    // No channels means the provider never provisioned a signal; a list
    // without HLS cannot be probed, so it stays as-is.
    return channels.length === 0 ? false : true;
  }
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://goltv.stream").replace(/\/+$/, "");
  let alive = false;
  await Promise.all(
    hls.slice(0, 3).map(async (c) => {
      if (alive) return;
      const url = c.url.startsWith("http") ? c.url : `${base}${c.url}`;
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
          cache: "no-store",
        });
        if (res.ok && (await res.text()).includes("#EXTM3U")) alive = true;
      } catch {
        // dead signal — try the next channel
      }
    })
  );
  return alive;
}

/**
 * Cached variant: resolves the event's channels and probes them, memoized
 * per `cacheKey` so repeated agenda polls do not hammer the provider.
 * A probe/load failure returns true — never hide an event on our own error.
 */
export async function matchSignalAlive(
  cacheKey: string,
  loadChannels: () => Promise<Channel[]>,
  ttlMs = ALIVE_CACHE_TTL
): Promise<boolean> {
  const cached = await getCache<boolean>(cacheKey);
  if (cached !== null) return cached;
  try {
    const alive = await channelsSignalAlive(await loadChannels());
    await setCache(cacheKey, alive, ttlMs);
    return alive;
  } catch {
    return true;
  }
}
