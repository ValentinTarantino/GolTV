import {
  combatFramePrefix,
  fetchFrameAsset,
  isFrameMediaPath,
  rewriteFramePlaylist,
  rewriteFrameText,
} from "@/lib/combat-frame";

export const dynamic = "force-dynamic";

/**
 * Same-origin proxy for the kora player pages used by boxing/MMA embeds.
 * Path shape: /api/combat/frame/<player-host>/<upstream-path>. Framing
 * headers are stripped and player endpoints are rewritten under the prefix
 * so the embedded player keeps working from our origin.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const segments = (path ?? []).filter(Boolean);
  const host = segments[0] ?? "";
  const rest = segments.slice(1);
  if (!host || rest.length === 0 || !combatFramePrefix(host)) {
    return new Response("Not found", { status: 404 });
  }
  if (rest.some((seg) => seg === ".." || seg.includes(".."))) {
    return new Response("Not found", { status: 404 });
  }

  const search = new URL(request.url).search;
  const upstreamPath = `/${rest.join("/")}${search}`;
  const upstream = await fetchFrameAsset(host, upstreamPath);
  if (!upstream) return new Response("Upstream unavailable", { status: 502 });
  if (!upstream.ok) return new Response(null, { status: upstream.status });

  const contentType = upstream.headers.get("content-type") ?? "";
  const type = contentType.toLowerCase();
  const isPlaylist =
    type.includes("mpegurl") ||
    type.includes("apple") ||
    isFrameMediaPath(rest.join("/")) && type.includes("text");
  const isText =
    type.includes("html") ||
    type.includes("javascript") ||
    type.includes("json") ||
    type.includes("text/plain") ||
    isPlaylist;

  const outHeaders: Record<string, string> = {
    "Content-Type": contentType || "application/octet-stream",
    "Cache-Control": "no-store",
  };

  if (!isText) {
    return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
  }

  const body = await upstream.text();
  const rewritten = isPlaylist
    ? rewriteFramePlaylist(body, host)
    : type.includes("json")
      ? body
      : rewriteFrameText(body, host);
  return new Response(rewritten, { status: upstream.status, headers: outHeaders });
}
