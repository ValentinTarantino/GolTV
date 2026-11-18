import { lpfRelayUrl, sealLpfUrl } from "@/lib/lpf-play";
import { resolveLpfMatchStream } from "@/lib/lpf-matches";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type StreamKind = "hls" | "iframe";

/** Turns a provider player into something the browser may load. */
function toClientSource(source: {
  src: string;
  kind: StreamKind;
  quality?: string;
}): { src: string; kind: StreamKind; quality?: string } {
  return {
    src: source.kind === "hls" ? lpfRelayUrl(source.src) : `/api/lpf/player?t=${sealLpfUrl(source.src)}`,
    kind: source.kind,
    ...(source.quality ? { quality: source.quality } : {}),
  };
}

/**
 * Resolves one match of the section to its player.
 *
 * HLS playlists are handed over as a sealed relay token, so the provider host
 * never reaches the browser. Embedded players go through the framed player
 * route, which keeps the page in our origin.
 *
 * A match usually publishes more than one player: `sources` carries all of
 * them (already sealed) so the page can offer "Fuente 1", "Fuente 2"…
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const stream = await resolveLpfMatchStream(id);

  if (!stream) {
    return Response.json({ src: null, kind: null, sources: [] }, { status: 404 });
  }

  const players = stream.sources?.length
    ? stream.sources
    : [{ src: stream.src, kind: stream.kind }];
  const sources = players.map(toClientSource);

  return Response.json(
    {
      src: sources[0].src,
      kind: sources[0].kind,
      sources,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
