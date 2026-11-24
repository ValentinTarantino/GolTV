import type { NextApiRequest, NextApiResponse } from "next";
import { isEmbedPlayerPage } from "@/lib/embed-resolver";
import { isAllowedStreamUrl } from "@/lib/hls-proxy";
import { relaySegment } from "@/lib/hls-relay";
import { openLpfUrl } from "@/lib/sealed-url";
import { isIPBanned } from "@/lib/chat";

// CDN-cacheable segment relay. Playlist rewrites point media segments here so
// a CDN edge can serve repeat viewers without hitting the app server. Tokens
// are deterministic per time bucket (see sealLpfSegmentUrl), which is what
// makes the edge cache keys identical across viewers of the same match.
//
// This lives in the Pages Router on purpose: App Router route handlers get a
// framework-injected `Vary: rsc, next-router-*` header that makes CDN edges
// refuse to cache the response.

function getClientIP(req: NextApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (first) return first.split(",")[0].trim();
  const realIP = req.headers["x-real-ip"];
  if (typeof realIP === "string" && realIP) return realIP;
  const cfIP = req.headers["cf-connecting-ip"];
  if (typeof cfIP === "string" && cfIP) return cfIP;
  return "unknown";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end();
    return;
  }

  const clientIP = getClientIP(req);
  if (await isIPBanned(clientIP)) {
    res.status(403).send("Access denied");
    return;
  }

  const rawToken = typeof req.query.t === "string" ? req.query.t : null;
  const rawPlain = typeof req.query.u === "string" ? req.query.u : null;

  let target: string | null = null;
  if (rawToken) {
    try {
      target = openLpfUrl(rawToken);
    } catch {
      target = null;
    }
    if (!target) {
      res.status(400).send("Invalid or expired stream token");
      return;
    }
  } else {
    target = rawPlain;
  }

  let upstream: URL;
  try {
    upstream = new URL(target ?? "");
  } catch {
    res.status(400).send("Missing or invalid segment URL");
    return;
  }
  if (upstream.protocol !== "https:") {
    res.status(403).send("Segment URL not allowed");
    return;
  }
  if (isEmbedPlayerPage(upstream)) {
    res.status(400).send("Player pages are not segments");
    return;
  }
  if (!isAllowedStreamUrl(upstream)) {
    res.status(403).send("Stream host not allowed");
    return;
  }

  const rangeHeader = req.headers.range;
  const range = typeof rangeHeader === "string" ? rangeHeader : null;
  const upstreamRes = await relaySegment(upstream, range);

  upstreamRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.status(upstreamRes.status);

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const body = Buffer.from(await upstreamRes.arrayBuffer());
  res.send(body);
}
