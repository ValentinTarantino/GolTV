import { lpfRelayUrl, sealLpfUrl } from "@/lib/lpf-play";
import { resolveLpfMatchStream } from "@/lib/lpf-matches";

export const dynamic = "force-dynamic";

/**
 * Resolves one match of the section to its player.
 *
 * HLS playlists are handed over as a sealed relay token, so the provider host
 * never reaches the browser. Embedded players go through the framed player
 * route, which keeps the page in our origin.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const stream = await resolveLpfMatchStream(id);

  if (!stream) {
    return Response.json({ src: null, kind: null }, { status: 404 });
  }

  return Response.json(
    {
      src: stream.kind === "hls" ? lpfRelayUrl(stream.src) : `/api/lpf/player?t=${sealLpfUrl(stream.src)}`,
      kind: stream.kind,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
