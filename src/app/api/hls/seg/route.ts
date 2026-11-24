import { isIPBanned } from "@/lib/chat";
import { isEmbedPlayerPage } from "@/lib/embed-resolver";
import { isAllowedStreamUrl } from "@/lib/hls-proxy";
import { relaySegment } from "@/lib/hls-relay";
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

// CDN-cacheable segment relay. Playlist rewrites point media segments here so
// a CDN edge can serve repeat viewers without hitting the app server. Tokens
// are deterministic per time bucket (see sealLpfSegmentUrl), which is what
// makes the edge cache keys identical across viewers of the same match.

export async function GET(request: Request): Promise<Response> {
  const clientIP = getClientIP(request);
  if (await isIPBanned(clientIP)) {
    return new Response("Access denied", { status: 403 });
  }

  const params = new URL(request.url).searchParams;

  let target: string | null = null;
  const rawToken = params.get("t");
  if (rawToken) {
    try {
      target = openLpfUrl(rawToken);
    } catch {
      target = null;
    }
    if (!target) {
      return new Response("Invalid or expired stream token", { status: 400 });
    }
  } else {
    target = params.get("u");
  }

  let upstream: URL;
  try {
    upstream = new URL(target ?? "");
  } catch {
    return new Response("Missing or invalid segment URL", { status: 400 });
  }
  if (upstream.protocol !== "https:") {
    return new Response("Segment URL not allowed", { status: 403 });
  }
  if (isEmbedPlayerPage(upstream)) {
    return new Response("Player pages are not segments", { status: 400 });
  }
  if (!isAllowedStreamUrl(upstream)) {
    return new Response("Stream host not allowed", { status: 403 });
  }

  return relaySegment(upstream, request);
}
