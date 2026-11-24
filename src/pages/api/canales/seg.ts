import type { NextApiRequest, NextApiResponse } from "next";
import {
  expandDashTemplate,
  fetchUpstream,
  isCanalStreamHost,
  neutralizeDrmBoxes,
  openCanalToken,
} from "@/lib/streams";

// CDN-cacheable segment relay for the "Canales" section. Playlist and manifest
// rewrites point media segments here so a CDN edge can serve repeat viewers
// without hitting the app server. Tokens are deterministic per time bucket
// (see sealCanalSegmentUrl), which makes the edge cache keys identical across
// viewers of the same channel.
//
// This lives in the Pages Router on purpose: App Router route handlers get a
// framework-injected `Vary: rsc, next-router-*` header that makes CDN edges
// refuse to cache the response.

const UPSTREAM_TIMEOUT_MS = 30_000;

const PASSTHROUGH_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

const SEGMENT_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=86400, immutable",
  Vary: "Accept-Encoding",
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end();
    return;
  }

  const rawToken = typeof req.query.t === "string" ? req.query.t : null;
  const sealed = rawToken ? openCanalToken(rawToken) : null;
  if (!sealed) {
    res.status(400).send("Invalid stream reference");
    return;
  }

  // The player substitutes the DASH placeholders next to the sealed token.
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(req.query)) {
    if (typeof value === "string") params.set(name, value);
  }
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

  let upstream: URL;
  try {
    upstream = new URL(target);
  } catch {
    res.status(400).send("Missing or invalid segment URL");
    return;
  }
  if (upstream.protocol !== "https:" || !isCanalStreamHost(upstream)) {
    res.status(403).send("Stream host not allowed");
    return;
  }

  try {
    const headers: Record<string, string> = { Accept: "*/*" };
    const range = req.headers.range;
    if (typeof range === "string") headers.Range = range;

    const upstreamRes = await fetchUpstream(upstream, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!upstreamRes.ok) {
      res.status(upstreamRes.status === 404 ? 503 : upstreamRes.status).send("Stream unavailable");
      return;
    }

    const contentType = upstreamRes.headers.get("content-type") ?? "";
    const isPlaylist =
      upstream.pathname.toLowerCase().endsWith(".m3u8") || contentType.includes("mpegurl");
    const isManifest =
      upstream.pathname.toLowerCase().endsWith(".mpd") || contentType.includes("dash");

    // Playlists and manifests must never be cached: they change on every
    // rewrite. If one lands here anyway it is relayed without cache headers.
    if (isPlaylist || isManifest) {
      upstreamRes.headers.forEach((value, key) => {
        if (!key.toLowerCase().startsWith("content-encoding")) {
          res.setHeader(key, value);
        }
      });
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      res.send(Buffer.from(await upstreamRes.arrayBuffer()));
      return;
    }

    const outHeaders: Record<string, string> = { ...SEGMENT_HEADERS };
    for (const name of PASSTHROUGH_HEADERS) {
      const value = upstreamRes.headers.get(name);
      if (value) outHeaders[name] = value;
    }

    // The old feeds arrive in the clear but still carry the encryption boxes;
    // the browser would ask for a license that does not exist, so the boxes
    // are neutralized before the segment goes out. A channel that is really
    // encrypted keeps them: there the ClearKey does the decryption.
    const isInit = upstream.pathname.toLowerCase().includes("-init.");
    if (req.method === "HEAD") {
      for (const [key, value] of Object.entries(outHeaders)) res.setHeader(key, value);
      res.status(upstreamRes.status).end();
      return;
    }

    const body = Buffer.from(await upstreamRes.arrayBuffer());
    const finalBody = isInit && !sealed.encrypted ? neutralizeDrmBoxes(body) : body;
    for (const [key, value] of Object.entries(outHeaders)) res.setHeader(key, value);
    res.status(upstreamRes.status).send(finalBody);
  } catch (error) {
    console.warn("[canales] segment relay failed:", error);
    res.status(502).send("Stream unavailable");
  }
}
