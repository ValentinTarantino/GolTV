/**
 * Shared playlist cache.
 *
 * Every viewer of the same channel polls the same upstream playlist every
 * few seconds. Caching the rewritten body for a couple of seconds collapses
 * those fetches into one upstream request per TTL window per channel —
 * Render answers the rest from memory instead of waiting on the provider.
 *
 * Only successful playlist/manifest bodies are stored; errors are never
 * cached. The TTL stays well under the ~4s live-playlist reload interval,
 * so viewers cannot tell the difference.
 */

const PLAYLIST_CACHE_TTL_MS = 2_000;
const MAX_ENTRIES = 500;

const playlistCache = new Map<string, { body: string; expiresAt: number }>();

export function getSharedPlaylist(key: string): string | null {
  const hit = playlistCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    playlistCache.delete(key);
    return null;
  }
  return hit.body;
}

export function clearPlaylistCache(): void {
  playlistCache.clear();
}

export function setSharedPlaylist(key: string, body: string): void {
  if (playlistCache.size >= MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, entry] of playlistCache) {
      if (entry.expiresAt <= now) playlistCache.delete(k);
    }
    if (playlistCache.size >= MAX_ENTRIES) playlistCache.clear();
  }
  playlistCache.set(key, { body, expiresAt: Date.now() + PLAYLIST_CACHE_TTL_MS });
}
