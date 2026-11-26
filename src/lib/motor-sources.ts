import { getCache, setCache } from "./cache";
import type { MotorsportEvent } from "./motor-source";
import { findMotorsportStreams } from "./player-six-source";

/**
 * Resolves the session's broadcast to HLS channels the native player can
 * render — same sealed /api/hls pipeline (R2-backed) as every other sport.
 * An empty array means the provider has not provisioned the signal yet.
 */

export interface MotorsportSource {
  src: string;
  kind: "hls" | "iframe";
  quality?: string;
}

const SOURCE_CACHE_TTL = 45_000;
const MAX_SOURCES = 4;

export async function resolveMotorsportSources(match: MotorsportEvent): Promise<MotorsportSource[]> {
  const cacheKey = `motor:sources:v1:${match.id}`;
  const cached = await getCache<MotorsportSource[]>(cacheKey);
  if (cached) return cached;

  const channels = await findMotorsportStreams(match.id);
  const sources: MotorsportSource[] = channels
    .slice(0, MAX_SOURCES)
    .map((c) => ({ src: c.url, kind: c.kind ?? "hls", quality: "HD" }));

  await setCache(cacheKey, sources, SOURCE_CACHE_TTL);
  return sources;
}
