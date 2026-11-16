/**
 * Client-side resolution of sportplus playlists.
 *
 * The provider's API only shares the `ls` stream URLs with residential
 * networks: datacenter IPs (serverless functions, public proxies) get the
 * match data with the playlists stripped, and the stream CDN refuses
 * datacenter traffic as well. The visitor's browser has a residential IP
 * and the API answers CORS requests from any origin, so the playlist is
 * resolved here and played directly — the relay server can not reach the
 * CDN from Vercel.
 */

const SPORTPLUS_API = "https://apisplus.live/v3.1";
const SPORTPLUS_SITE = "https://es.sportplus.watch";

const VIEW_HEADERS = { Referer: `${SPORTPLUS_SITE}/football/` };

/** First `.m3u8` of an `ls` array. */
function playlistFromLs(ls: unknown): string | null {
  if (!Array.isArray(ls)) return null;
  for (const candidate of ls) {
    if (typeof candidate === "string" && /^https:\/\/[^"'\s]+\.m3u8(\?|$)/i.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Playlist of one sportplus match, asked from the browser. */
export async function sportplusPlaylistClient(tournamentId: string, matchId: string): Promise<string | null> {
  try {
    const url =
      `${SPORTPLUS_API}/matches/view?id=${encodeURIComponent(matchId)}` +
      `&sport_id=football&tournament_id=${encodeURIComponent(tournamentId)}&lang=es&lcfg=es&fw=3.1`;
    const res = await fetch(url, { headers: VIEW_HEADERS });
    if (!res.ok) return null;
    const data = (await res.json()) as { item?: { ls?: unknown } };
    return playlistFromLs(data.item?.ls);
  } catch {
    return null;
  }
}

/**
 * Playlist of any live football match on the provider — used by the demo
 * entry when the section's own agenda has nothing playable.
 */
export async function liveFootballPlaylistClient(): Promise<string | null> {
  try {
    const res = await fetch(
      `${SPORTPLUS_API}/matches/index?sport_id=football&lang=es&lcfg=es&fw=3.1&offset=0`,
      { headers: VIEW_HEADERS }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: Array<{ id?: number; tournament_id?: number; status?: string }>;
    };
    const live = (Array.isArray(data.items) ? data.items : [])
      .filter((item) => item.status === "live" && item.id && item.tournament_id !== undefined)
      .slice(0, 10);
    const playlists = await Promise.all(
      live.map((item) => sportplusPlaylistClient(String(item.tournament_id), String(item.id)))
    );
    return playlists.find((playlist): playlist is string => playlist !== null) ?? null;
  } catch {
    return null;
  }
}
