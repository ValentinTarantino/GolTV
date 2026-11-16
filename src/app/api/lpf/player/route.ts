import { isLpfStreamHost, openLpfUrl } from "@/lib/lpf-play";

export const dynamic = "force-dynamic";

/**
 * Framed player for the embedded channels of the section.
 *
 * The provider page arrives sealed inside `?t=`, so the browser only ever
 * loads this route and never the address of the player.
 */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const target = openLpfUrl(token);
  if (!target) return new Response("Invalid player reference", { status: 400 });

  // Only the hosts of the section may be framed through this route.
  let allowed = false;
  try {
    allowed = isLpfStreamHost(new URL(target));
  } catch {
    allowed = false;
  }
  if (!allowed) {
    console.warn(`[lpf] player host rejected: ${new URL(target).hostname}`);
    return new Response("Player host not allowed", { status: 403 });
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Reproductor</title>
<style>
  html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden}
  iframe{border:0;width:100%;height:100%;display:block}
</style>
</head>
<body>
<iframe src="${target.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
