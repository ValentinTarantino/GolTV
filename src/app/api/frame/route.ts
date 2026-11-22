import { openLpfUrl } from "@/lib/sealed-url";

export const dynamic = "force-dynamic";

/**
 * Opaque iframe endpoint for third-party player pages.
 *
 * Channel URLs leave the API sealed inside `?t=` (AES-256-GCM, same scheme as
 * the stream relays), so provider hostnames never appear in payloads or page
 * source. The browser follows the redirect and loads the player directly —
 * no media bytes travel through this server.
 */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  let target: string | null = null;
  try {
    target = token ? openLpfUrl(token) : null;
  } catch {
    target = null;
  }
  if (!target) {
    return new Response("Invalid or expired frame token", { status: 400 });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": "no-store",
    },
  });
}
