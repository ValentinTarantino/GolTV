import { canalRelayUrl, resolveCanalById } from "@/lib/streams";
import { publicFrameUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";

/**
 * Resolves one opaque channel id to a playable source.
 *
 * The upstream URL is sealed before it leaves the server, so the browser
 * only ever sees a relay reference.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const resolved = await resolveCanalById(id);

  if (!resolved) {
    return Response.json({ src: null, kind: null, clearKey: null }, { status: 404 });
  }

  try {
    return Response.json(
      {
        // An iframe channel is the third party page itself; it goes out as an
        // opaque /api/frame (or /api/proxy) reference so the provider host
        // never appears in the payload. Everything else goes out sealed.
        src:
          resolved.kind === "iframe"
            ? publicFrameUrl(resolved.url)
            : canalRelayUrl(resolved.url, { encrypted: resolved.clearKey !== null }),
        kind: resolved.kind,
        clearKey: resolved.clearKey,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch {
    // No relay secret: refusing is the only safe answer, sealing with a
    // public key would hand out forgeable tokens.
    return Response.json({ src: null, kind: null, clearKey: null }, { status: 503 });
  }
}
