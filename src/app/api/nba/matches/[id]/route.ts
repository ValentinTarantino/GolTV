import { findBasketballStreams } from "@/lib/player-six-source";
import { getCache, setCache } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface StreamSource {
  src: string;
  kind: "hls" | "iframe";
  quality?: string;
}

const SOURCE_CACHE_TTL = 45_000;
const MAX_SOURCES = 4;

/**
 * Resolves one basketball match to the provider's own players. HLS playlists
 * arrive already sealed behind /api/hls; empty means the broadcast has not
 * been provisioned yet and the page keeps polling.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const matchId = Number.parseInt(id, 10);
  if (!Number.isFinite(matchId)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  const cacheKey = `nba:sources:${matchId}`;
  let sources = await getCache<StreamSource[]>(cacheKey);
  if (!sources) {
    const channels = await findBasketballStreams(matchId);
    sources = channels.slice(0, MAX_SOURCES).map((c) => ({
      src: c.url,
      kind: c.kind ?? "hls",
      quality: "HD",
    }));
    await setCache(cacheKey, sources, SOURCE_CACHE_TTL);
  }

  const valid = sources.filter((s) => s.src);
  return Response.json(
    {
      src: valid[0]?.src ?? null,
      kind: valid[0]?.kind ?? null,
      sources: valid,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
