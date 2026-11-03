import { proxyPlayer4 } from "@/lib/player4-proxy";

// Same-origin reverse proxy for the PlayerFour embed. The matching header
// override lives in next.config.ts so the page stays frameable by /watch.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyPlayer4(path ?? [], new URL(request.url).search, request.headers);
}
