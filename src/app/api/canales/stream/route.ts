import { settleSegmentPopulates } from "@/lib/r2-segments";
import { isIPBanned } from "@/lib/chat";
import { touchRequestPresence } from "@/lib/presence";
import { BANNED_HEADER } from "@/lib/viewer-id";
import {
  expandDashTemplate,
  fetchUpstream,
  isCanalStreamHost,
  neutralizeDrmBoxes,
  openCanalToken,
  rewriteCanalManifest,
  rewriteCanalPlaylist,
} from "@/lib/streams";

export const dynamic = "force-dynamic";

/**
 * Anonymous relay for the "Canales" section.
 *
 * The upstream URL arrives sealed inside `?t=`. Manifests are rewritten so
 * every segment reference comes back through here as another sealed token,
 * which keeps the provider host and the CDN hosts out of the browser.
 */

const UPSTREAM_TIMEOUT_MS = 30_000;

const PASSTHROUGH_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

const MANIFEST_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

export async function GET(request: Request): Promise<Response> {
  if (await isIPBanned(getClientIP(request))) {
    return new Response("Access denied", {
      status: 403,
      headers: { [BANNED_HEADER]: "1" },
    });
  }

  const params = new URL(request.url).searchParams;
  touchRequestPresence(request, params.get("m"));

  const token = params.get("t") ?? "";
  const sealed = openCanalToken(token);
  if (!sealed) return new Response("Invalid stream reference", { status: 400 });

  const options = { encrypted: sealed.encrypted };

  // The player substitutes the DASH placeholders next to the sealed token.
  let target = expandDashTemplate(sealed.url, params);

  // Low latency HLS asks for the parts of a segment with its own query
  // parameters; they belong to the upstream request, not to the sealed token.
  const partParams = new URLSearchParams();
  for (const name of ["_HLS_msn", "_HLS_part", "_HLS_skip"]) {
    const value = params.get(name);
    if (value !== null) partParams.set(name, value);
  }
  if ([...partParams.keys()].length > 0) {
    const withParts = new URL(target);
    for (const [name, value] of partParams) withParts.searchParams.set(name, value);
    target = withParts.toString();
  }

  const upstream = new URL(target);
  if (!isCanalStreamHost(upstream)) {
    return new Response("Stream host not allowed", { status: 403 });
  }

  try {
    const headers: Record<string, string> = { Accept: "*/*" };
    const range = request.headers.get("range");
    if (range) headers.Range = range;

    const upstreamRes = await fetchUpstream(upstream, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!upstreamRes.ok) {
      return new Response("Stream unavailable", {
        status: upstreamRes.status === 404 ? 503 : upstreamRes.status,
      });
    }

    const contentType = upstreamRes.headers.get("content-type") ?? "";
    const finalUrl = upstreamRes.url ? new URL(upstreamRes.url) : upstream;
    const isPlaylist =
      upstream.pathname.toLowerCase().endsWith(".m3u8") || contentType.includes("mpegurl");
    const isManifest =
      upstream.pathname.toLowerCase().endsWith(".mpd") || contentType.includes("dash");

    // Several channels hide the playlist behind an `?url=` proxy whose own
    // address does not end in `.m3u8`; those proxies answer `text/html` (an
    // empty page when the channel is dead). The body decides.
    const looksTextual = !isManifest && contentType.includes("html");

    if (isPlaylist || looksTextual) {
      const body = await upstreamRes.text();
      const trimmed = body.trim().replace(/^\uFEFF/, "");
      // An empty or non playlist answer is a dead channel, not a valid one:
      // without this the player waits forever on a black frame.
      if (!trimmed.startsWith("#EXTM3U")) {
        return new Response("Stream unavailable", { status: 503 });
      }
      const rewritten = rewriteCanalPlaylist(body, finalUrl, options);
      // Wait for the populates of the segments just referenced so viewers
      // never hit an R2 object that is not stored yet.
      await settleSegmentPopulates();
      return new Response(rewritten, {
        status: 200,
        headers: {
          ...MANIFEST_HEADERS,
          "Content-Type": "application/vnd.apple.mpegurl",
        },
      });
    }

    if (isManifest) {
      const body = await upstreamRes.text();
      if (!body.trim()) return new Response("Stream unavailable", { status: 503 });
      return new Response(rewriteCanalManifest(body, finalUrl, options), {
        status: 200,
        headers: {
          ...MANIFEST_HEADERS,
          "Content-Type": "application/dash+xml",
        },
      });
    }

    const outHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    };
    for (const name of PASSTHROUGH_HEADERS) {
      const value = upstreamRes.headers.get(name);
      if (value) outHeaders[name] = value;
    }

    // The old feeds arrive in the clear but still carry the encryption boxes;
    // the browser would ask for a license that does not exist, so the boxes
    // are neutralized before the segment goes out. A channel that is really
    // encrypted keeps them: there the ClearKey does the decryption.
    const isInit = upstream.pathname.toLowerCase().includes("-init.");
    if (isInit && !sealed.encrypted) {
      const body = neutralizeDrmBoxes(Buffer.from(await upstreamRes.arrayBuffer()));
      return new Response(new Uint8Array(body), {
        status: upstreamRes.status,
        statusText: upstreamRes.statusText,
        headers: outHeaders,
      });
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: outHeaders,
    });
  } catch (error) {
    console.warn("[canales] relay failed:", error);
    return new Response("Stream unavailable", { status: 502 });
  }
}
