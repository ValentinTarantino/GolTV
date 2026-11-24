import { getCache, setCache } from "./cache";
import type { CombatMatch } from "./combat-source";
import { findFightingStreams } from "./player-six-source";

/**
 * Resolves the event's broadcast to HLS channels the native player can
 * render. An empty array means the provider has not provisioned the signal
 * yet — the caller shows that state instead of a frame that cannot load.
 */

export interface CombatSource {
  src: string;
  kind: "hls" | "iframe";
  quality?: string;
}

const SOURCE_CACHE_TTL = 45_000;
const MAX_SOURCES = 4;

export async function resolveCombatSources(match: CombatMatch): Promise<CombatSource[]> {
  const cacheKey = `combat:sources:v3:${match.id}`;
  const cached = await getCache<CombatSource[]>(cacheKey);
  if (cached) return cached;

  const channels = await findFightingStreams(match.id);
  const sources: CombatSource[] = channels
    .slice(0, MAX_SOURCES)
    .map((c) => ({ src: c.url, kind: c.kind ?? "hls", quality: "HD" }));

  await setCache(cacheKey, sources, SOURCE_CACHE_TTL);
  return sources;
}
