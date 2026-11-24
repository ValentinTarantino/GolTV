import { isEmbedPlayerPage } from "@/lib/embed-resolver";
import { isIPBanned } from "@/lib/chat";
import {
  relayEmbedPage,
  relayUpstream,
} from "@/lib/hls-relay";
import { isAllowedStreamUrl } from "@/lib/hls-proxy";
import { openLpfUrl } from "@/lib/sealed-url";

function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;
  const cfIP = request.headers.get("cf-connecting-ip");
  if (cfIP) return cfIP;
  return "unknown";
}

// Server-side HLS relay for the allowlisted providers in src/lib/hls-proxy.ts.
//
// Three entry points:
//   ?u=<absolute playlist or segment URL>  → straight relay (host allowlist)
//   ?e=<frame-restricted player page URL>  → resolve the page's signed playlist
//                                            and hand back a rewritten manifest
//   ?t=<sealed token>                      → same as ?u= but the upstream URL is
//                                            encrypted (see src/lib/sealed-url.ts)
//
// Media segments rewritten inside playlists point at /api/hls/seg instead,
// which serves them with CDN-cacheable headers.

export async function GET(request: Request): Promise<Response> {
  const clientIP = getClientIP(request);
  if (await isIPBanned(clientIP)) {
    return new Response("Access denied", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const rawEmbed = params.get("e");
  if (rawEmbed) return relayEmbedPage(rawEmbed);

  // Sealed token form: the upstream URL never reaches the browser.
  const rawToken = params.get("t");
  if (rawToken) {
    let target: string | null = null;
    try {
      target = openLpfUrl(rawToken);
    } catch {
      target = null;
    }
    if (!target) {
      return new Response("Invalid or expired stream token", { status: 400 });
    }
    let tokenUrl: URL;
    try {
      tokenUrl = new URL(target);
    } catch {
      return new Response("Invalid stream token", { status: 400 });
    }
    if (tokenUrl.protocol === "https:" && isEmbedPlayerPage(tokenUrl)) {
      return relayEmbedPage(target);
    }
    if (!isAllowedStreamUrl(tokenUrl)) {
      return new Response("Stream host not allowed", { status: 403 });
    }
    return relayUpstream(tokenUrl, request.headers.get("range"));
  }

  const rawTarget = params.get("u");

  let upstream: URL;
  try {
    upstream = new URL(rawTarget ?? "");
  } catch {
    return new Response("Missing or invalid stream URL", { status: 400 });
  }
  if (!isAllowedStreamUrl(upstream)) {
    return new Response("Stream host not allowed", { status: 403 });
  }

  return relayUpstream(upstream, request.headers.get("range"));
}
