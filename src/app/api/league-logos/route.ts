import { LEAGUE_LOGOS } from "@/lib/constants";
import { proxyImageUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";

/**
 * League badge URLs for the client.
 *
 * `LEAGUE_LOGOS` points at third-party CDNs; this endpoint hands out the
 * sealed `/api/img?t=` form so provider hosts never appear in the bundle or
 * the markup.
 */
export async function GET(): Promise<Response> {
  const logos: Record<string, string> = {};
  for (const [id, url] of Object.entries(LEAGUE_LOGOS)) {
    logos[id] = proxyImageUrl(url);
  }
  return Response.json(
    { logos },
    { headers: { "Cache-Control": "no-store" } }
  );
}
