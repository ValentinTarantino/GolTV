export const dynamic = "force-dynamic";

/**
 * Crests of the teams of the section.
 *
 * The provider serves one image per team id; the request goes through this
 * route so the CDN host never reaches the browser.
 */

const CREST_BASE = "https://cdn.ovbstdn.com/onexbet";
const FETCH_TIMEOUT_MS = 15_000;

export async function GET(request: Request): Promise<Response> {
  const pk = new URL(request.url).searchParams.get("pk") ?? "";

  if (!/^\d{1,10}$/.test(pk)) {
    return new Response("Invalid team reference", { status: 400 });
  }

  try {
    const upstream = await fetch(`${CREST_BASE}/pk${pk}.png?w=64&h=64&f=sd`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/132.0.0.0 Safari/537.36" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!upstream.ok) {
      return new Response("Crest unavailable", { status: 404 });
    }

    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/png",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new Response("Crest unavailable", { status: 502 });
  }
}
