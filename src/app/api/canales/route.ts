import { listCanales } from "@/lib/streams";

export const dynamic = "force-dynamic";

/**
 * Channel list for the "Canales" section.
 *
 * The response is deliberately minimal — `{ id, label, group }`. The provider
 * host, the CDN tokens and the stream paths stay on the server.
 */
export async function GET(): Promise<Response> {
  const channels = await listCanales();

  // The source being unreachable is not the same as an empty lineup: a 503
  // lets the page show its error state instead of a blank section.
  if (channels === null) {
    return Response.json(
      { error: "Channels unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } }
    );
  }

  return Response.json(
    { channels },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
