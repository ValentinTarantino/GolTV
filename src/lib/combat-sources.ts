import { getCache, setCache } from "./cache";
import { COMBAT_RECENT_GRACE_MS, type CombatMatch } from "./combat-source";
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

/**
 * Last resolved sources per event, kept for the recent-finished grace
 * window. When the provider feed drops the card, stream resolution has no
 * event to work from — the stored `/api/hls` relay URLs keep playing as
 * long as the signal itself is alive (the relay re-resolves the signed
 * playlist on every poll).
 */
export async function getRecentCombatSources(id: number): Promise<CombatSource[]> {
  return (await getCache<CombatSource[]>(`combat:recent-src:${id}`)) ?? [];
}

export async function rememberCombatSources(id: number, sources: CombatSource[]): Promise<void> {
  if (sources.length === 0) return;
  await setCache(`combat:recent-src:${id}`, sources, COMBAT_RECENT_GRACE_MS + 60_000);
}
