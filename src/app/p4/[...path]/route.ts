import { proxyPlayer4 } from "@/lib/player4-proxy";

// Same-origin reverse proxy for the PlayerFour embed. The matching header
// override lives in next.config.ts so the page stays frameable by /watch.
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? null
      : await request.arrayBuffer();
  return proxyPlayer4(
    path ?? [],
    new URL(request.url).search,
    request.headers,
    request.method,
    body
  );
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
