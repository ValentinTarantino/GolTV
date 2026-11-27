import { getCache, setCache } from "./cache";
import type { CombatMatch } from "./combat-source";
import { findPrimaryEventStreams } from "./primary-player-source";
import { publicFrameUrl } from "./public-url";

/**
 * Resolves the event's broadcast to HLS channels the native player can
 * render — the same pipeline Reproductor 1 uses for football (feed embed
 * pages resolved to playlists). An empty array means the provider has not
 * provisioned the signal yet — the caller shows that state instead of a
 * frame that cannot load.
 */

export interface CombatSource {
  src: string;
  kind: "hls" | "iframe";
  quality?: string;
}

const SOURCE_CACHE_TTL = 45_000;
const MAX_SOURCES = 4;

export async function resolveCombatSources(match: CombatMatch): Promise<CombatSource[]> {
  const cacheKey = `combat:sources:v4:${match.id}`;
  const cached = await getCache<CombatSource[]>(cacheKey);
  if (cached) return cached;

  const channels = await findPrimaryEventStreams(match.id, "gsc");
  const sources: CombatSource[] = channels
    .slice(0, MAX_SOURCES)
    .map((c) => ({
      // Iframe channels carry the raw player-page URL: seal it behind
      // /api/proxy (kora-plus family is in HTML_PROXY_HOSTS) so the page
      // loads without the provider's frame-ancestors refusal — the same
      // evasion Reproductor 1 relies on.
      src: c.kind === "iframe" ? publicFrameUrl(c.url) : c.url,
      kind: c.kind ?? "hls",
      quality: "HD",
    }));

  await setCache(cacheKey, sources, SOURCE_CACHE_TTL);
  return sources;
}
