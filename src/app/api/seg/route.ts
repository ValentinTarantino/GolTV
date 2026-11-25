import { isEmbedPlayerPage } from "@/lib/embed-resolver";
import { relaySegment } from "@/lib/hls-relay";
import { isAllowedStreamUrl } from "@/lib/hls-proxy";
import { isLpfStreamHost } from "@/lib/lpf-play";
import { triggerSegmentPopulate } from "@/lib/r2-segments";
import { openLpfUrl } from "@/lib/sealed-url";
import { isIPBanned } from "@/lib/chat";
import { touchRequestPresence } from "@/lib/presence";
import { BANNED_HEADER } from "@/lib/viewer-id";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

/**
 * Segment fallback for the R2 pipeline.
 *
 * Playlist rewrites emit R2 URLs only for segments whose populate succeeded;
 * failed or still-pending populates point here instead of a 404. This route
 * fetches the segment from the upstream on the spot — with immutable cache
 * headers so the Cloudflare edge deduplicates repeat viewers — and retriggers
 * the populate so the object lands in R2 for next time.
 *
 * Unlike the worker relay this spends no Worker quota: Render requests are
 * unlimited and edge-cached segments never reach the origin twice.
 */
export async function GET(request: Request): Promise<Response> {
  const clientIP = getClientIP(request);
  if (await isIPBanned(clientIP)) {
    return new Response("Access denied", {
      status: 403,
      headers: { [BANNED_HEADER]: "1" },
    });
  }

  const params = new URL(request.url).searchParams;
  touchRequestPresence(request, params.get("m"));

  const rawToken = params.get("t") ?? "";
  let target: string | null = null;
  try {
    target = openLpfUrl(rawToken);
  } catch {
    target = null;
  }
  if (!target) return new Response("Invalid or expired stream token", { status: 400 });

  let upstream: URL;
  try {
    upstream = new URL(target);
  } catch {
    return new Response("Invalid stream token", { status: 400 });
  }
  if (upstream.protocol !== "https:") {
    return new Response("Segment URL not allowed", { status: 403 });
  }
  if (isEmbedPlayerPage(upstream)) {
    return new Response("Player pages are not segments", { status: 400 });
  }
  // Only media segments belong here: playlists are tiny, must stay fresh and
  // are already served no-store by their own relay routes.
  if (/\.m3u8($|[?#])/i.test(upstream.pathname)) {
    return new Response("Not a segment", { status: 400 });
  }
  if (!isAllowedStreamUrl(upstream) && !isLpfStreamHost(upstream)) {
    return new Response("Stream host not allowed", { status: 403 });
  }

  // Keep the populate warm: once the upstream recovers the object lands in
  // R2 and later playlist polls go back to the CDN URL.
  triggerSegmentPopulate("lpf", rawToken);

  return relaySegment(upstream, request.headers.get("range"));
}
