import { setHomeRelayUrl } from "@/lib/lpf-home-relay";

export const dynamic = "force-dynamic";

/**
 * Registration endpoint for the home relay: the tunnel script posts its
 * current public URL here on startup so the deployment can reach the
 * residential-IP egress.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.LPF_HOME_SECRET?.trim() ?? "";
  if (!secret) return new Response("Not configured", { status: 503 });

  let body: { url?: string; secret?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (body.secret !== secret) return new Response("Unauthorized", { status: 401 });

  let url: URL;
  try {
    url = new URL(body.url ?? "");
  } catch {
    return new Response("Bad url", { status: 400 });
  }
  if (url.protocol !== "https:") return new Response("Bad url", { status: 400 });

  await setHomeRelayUrl(url.toString());
  return Response.json({ ok: true });
}
