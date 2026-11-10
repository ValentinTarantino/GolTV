import { NextRequest, NextResponse } from "next/server";
import { resolveSecondaryPlayer, secondaryHosts } from "@/lib/secondary-source";

// Bare frame for Player 1 signals.
//
// Player 1 publishes *scraped* channel pages: a PHP wrapper that frames a
// blogspot post, which frames the actual player. Rendered as-is the visitor
// sees the scraper's white page shell (header links, empty post body, ads)
// around a stream that may not even be published yet. This route resolves the
// chain server-side and answers with a black document that frames only the
// deepest player URL, or a dark "waiting" panel when the provider has not
// published one — so the white scrape chrome never reaches the page.

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PAGE_STYLE = `
    html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
    iframe { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; background: #000; }
    .wait {
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 14px; padding: 24px;
      background: #000; color: #8b8f98; text-align: center;
      font: 600 13px/1.5 system-ui, -apple-system, Segoe UI, sans-serif;
      letter-spacing: 0.04em; text-transform: uppercase;
    }
    .signal-loader {
      display: flex; align-items: center; justify-content: center; gap: 5px;
      height: 32px; color: #b6f21a;
    }
    .signal-bar {
      width: 5px; height: 12px; border-radius: 3px; background: currentColor;
      transform-origin: center; animation: signal-wave 800ms ease-in-out infinite alternate;
    }
    .signal-bar:nth-child(2), .signal-bar:nth-child(4) { height: 22px; animation-delay: 120ms; }
    .signal-bar:nth-child(3) { height: 30px; animation-delay: 240ms; }
    .signal-bar:nth-child(5) { animation-delay: 360ms; }
    @keyframes signal-wave {
      from { opacity: 0.35; transform: scaleY(0.45); }
      to { opacity: 1; transform: scaleY(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .signal-bar { animation: none; opacity: 0.85; }
    }
`;

function document(body: string, language: "es" | "en"): string {
  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${PAGE_STYLE}</style>
</head>
<body>${body}</body>
</html>`;
}

function playerFrame(url: string): string {
  return `<iframe src="${escapeHtml(url)}" referrerpolicy="no-referrer"
    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
    allowfullscreen></iframe>`;
}

function waitingPanel(language: "es" | "en"): string {
  const message = language === "en" ? "Waiting for signal" : "Esperando se\u00f1al";
  const bars = Array.from({ length: 5 }, () => '<span class="signal-bar"></span>').join("");
  return `<div class="wait"><span class="signal-loader" aria-hidden="true">${bars}</span><span>${message}</span></div>`;
}

function htmlResponse(body: string, language: "es" | "en"): NextResponse {
  return new NextResponse(document(body, language), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

/** Public https only: no loopback, private IPs or bare intranet names. */
function isPublicHttps(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname;
  if (!host.includes(".") || host.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  return true;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const raw = params.get("u") ?? "";
  const language = params.get("lang") === "en" ? "en" : "es";

  let page: URL;
  try {
    page = new URL(raw);
  } catch {
    return new NextResponse("Invalid channel page", { status: 400 });
  }

  if (!isPublicHttps(page)) return new NextResponse("Channel host not allowed", { status: 403 });

  // Most channel URLs reach us already resolved to the bare player (the match
  // list resolves them server-side). Those only need a black document around
  // the frame — nothing is fetched here, so this is not a forwarder.
  const hosts = secondaryHosts();
  if (!(hosts.has(page.hostname) || hosts.has(page.host))) {
    return htmlResponse(playerFrame(page.href), language);
  }

  // Wrapper-host pages still carry the scraper's shell: resolve the chain down
  // to the deepest player before framing anything.
  const player = await resolveSecondaryPlayer(page.href, hosts);
  if (player) return htmlResponse(playerFrame(player), language);

  // The provider lists the fixture but has not published a player for it yet
  // (or the chain broke). A dark panel beats a blank scraped page.
  return htmlResponse(waitingPanel(language), language);
}
