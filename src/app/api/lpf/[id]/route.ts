import { resolveLpfStream, sealLpfUrl } from "@/lib/lpf-play";

export const dynamic = "force-dynamic";

const NOT_FOUND_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" };

/**
 * Resolves one LPF Play channel to a sealed relay URL.
 *
 * The real playlist URL is encrypted into the token, so the provider host is
 * never visible in the page, the network panel or the JSON response.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const stream = await resolveLpfStream(id);
  if (!stream) {
    return Response.json({ error: "unavailable" }, { status: 404, headers: NOT_FOUND_HEADERS });
  }

  return Response.json(
    { src: `/api/lpf/stream?t=${sealLpfUrl(stream)}` },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}
