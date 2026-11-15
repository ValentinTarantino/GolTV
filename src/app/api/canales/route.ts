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

  return Response.json(
    { channels },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
