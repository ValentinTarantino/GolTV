import { listLpfChannels } from "@/lib/lpf-play";

export const dynamic = "force-dynamic";

/**
 * LPF Play channel list.
 *
 * Response shape is deliberately minimal — `{ id, label, number }`. The source
 * blog, the post URLs and the provider host stay on the server.
 */
export async function GET(): Promise<Response> {
  const channels = await listLpfChannels();

  return Response.json(
    { channels },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
      },
    }
  );
}
