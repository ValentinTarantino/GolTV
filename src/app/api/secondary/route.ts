import { NextRequest, NextResponse } from "next/server";
import { resolveDeepPlayer, resolveSecondaryPlayer, secondaryHosts } from "@/lib/secondary-source";

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

/**
 * Tries to start playback inside the provider's own player: plays every
 * <video> it finds and clicks the usual big-play overlays. Retries for ~40s
 * because Clapcr/hls.js take a while to build the element. Synthetic clicks
 * cannot grant unmuted autoplay, so when the browser refuses, the provider's
 * own play button stays as the fallback — same as before.
 */
const AUTOPLAY_SCRIPT = `<script>(function(){var n=0;function go(){n++;try{var vs=document.getElementsByTagName('video');for(var i=0;i<vs.length;i++){var v=vs[i];if(v.paused){try{var p=v.play();if(p&&p.catch)p.catch(function(){});}catch(e){}}}}catch(e){}var sels=['.clappr-big-play-button','.clappr-play-button','.jw-icon-playback','.vjs-big-play-button','.plyr__control--overlaid','[class*="big-play"]','[class*="play-btn"]','button[class*="play"]','#play-btn','.play-btn'];for(var s=0;s<sels.length;s++){try{var els=document.querySelectorAll(sels[s]);for(var j=0;j<els.length;j++){els[j].dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));}}catch(e){}}if(n<40)setTimeout(go,1000);}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){setTimeout(go,700)});}else{setTimeout(go,700);}})();</script>`;

const PLAYER_MARKER = /<video\b|clappr|jwplayer|video\.js|hls\.js|flowplayer|player\.js|\.m3u8/i;
const MAX_PLAYER_DOC_BYTES = 1024 * 1024;

/** Fetches the resolved player document and returns it with autoplay injected. */
async function playerDocument(url: string, referer: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        Referer: referer,
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("text/html")) return null;
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_PLAYER_DOC_BYTES) return null;
    const html = await res.text();
    if (html.length > MAX_PLAYER_DOC_BYTES || !PLAYER_MARKER.test(html)) return null;

    let out = html
      // Anti-devtools externals would fight the visitor's own devtools.
      .replace(/<script\b[^>]*src=["'][^"']*(?:console-ban|disable-devtool)[^"']*["'][^>]*>\s*<\/script>/gi, "")
      .replace(/<script\b[^>]*src=["'][^"']*(?:console-ban|disable-devtool)[^"']*["'][^>]*>/gi, "");
    // <base> makes the provider's relative assets resolve against its origin.
    const base = `<base href="${escapeHtml(url)}">`;
    if (/<head[^>]*>/i.test(out)) {
      out = out.replace(/<head[^>]*>/i, (m) => `${m}${base}`);
    } else {
      out = base + out;
    }
    if (/<\/body>/i.test(out)) {
      out = out.replace(/<\/body>/i, `${AUTOPLAY_SCRIPT}</body>`);
    } else {
      out += AUTOPLAY_SCRIPT;
    }
    return out;
  } catch {
    return null;
  }
}

// The injected document is deterministic per player URL; caching it briefly
// makes switching between a match's sources feel instant.
const PLAYER_DOC_TTL = 60_000;
const playerDocCache = new Map<string, { html: string; expiresAt: number }>();

async function cachedPlayerDocument(url: string, referer: string): Promise<string | null> {
  const hit = playerDocCache.get(url);
  if (hit && Date.now() < hit.expiresAt) return hit.html;
  const html = await playerDocument(url, referer);
  if (html) playerDocCache.set(url, { html, expiresAt: Date.now() + PLAYER_DOC_TTL });
  return html;
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
  let resolvedUrl: string;
  if (!(hosts.has(page.hostname) || hosts.has(page.host))) {
    resolvedUrl = page.href;
  } else {
    // Wrapper-host pages still carry the scraper's shell: resolve the chain
    // down to the deepest player before framing anything.
    const player = await resolveSecondaryPlayer(page.href, hosts);
    if (!player) {
      // The provider lists the fixture but has not published a player for it
      // yet (or the chain broke). A dark panel beats a blank scraped page.
      return htmlResponse(waitingPanel(language), language);
    }
    resolvedUrl = player;
  }

  // Deep chain: follow every iframe hop to the real player document and serve
  // it same-origin, so the injected autoplay script can reach the <video>.
  // Falls back to the plain frame whenever any step fails.
  try {
    const deep = await resolveDeepPlayer(resolvedUrl);
    if (deep) {
      const doc = await cachedPlayerDocument(deep.url, deep.referer);
      if (doc) {
        return new NextResponse(doc, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        });
      }
    }
  } catch {
    /* fall through to the framed player */
  }

  return htmlResponse(playerFrame(resolvedUrl), language);
}
