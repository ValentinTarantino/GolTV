/**
 * goltv-seg-relay — standalone segment relay for goltv.stream.
 *
 * Serves ONLY the CDN-cacheable media paths (`/api/hls/seg`, `/api/canales/seg`).
 * Everything else falls through to the app server, which owns pages,
 * playlists, manifests, chat and APIs.
 *
 * Ported 1:1 from the Next.js relay routes + libs so tokens sealed by the app
 * (LPF_PROXY_SECRET / CANALES_PROXY_SECRET) open identically here.
 */

import { Buffer } from "node:buffer";
import { createDecipheriv, createHash } from "node:crypto";

const UPSTREAM_TIMEOUT_MS = 30_000;

const PASSTHROUGH_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
};

const SEGMENT_HEADERS = {
  ...CORS_HEADERS,
  "Cache-Control": "public, max-age=86400, immutable",
  Vary: "Accept-Encoding",
};

const NO_STORE_HEADERS = {
  ...CORS_HEADERS,
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

function sha256Key(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

type GcmDecipher = ReturnType<typeof createDecipheriv> & {
  setAuthTag(tag: Buffer): void;
  setAAD(buffer: Buffer): void;
};

function httpsUrl(value: string, base?: string): URL | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** SSRF guard — same rules as src/lib/url-guard.ts. */
function isBlockedNetworkTarget(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) return true;
  if (host === "metadata.google.internal") return true;
  if (!host.includes(".") && !host.includes(":")) return true;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }

  if (host.includes(":")) {
    if (host === "::1" || host === "::") return true;
    if (host.startsWith("fe80") || host.startsWith("fc") || host.startsWith("fd")) return true;
    const mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isBlockedNetworkTarget(new URL(`http://${mapped[1]}/`));
  }
  return false;
}

function withPassthrough(upstreamRes: Response, extra: Record<string, string>): Headers {
  const headers = new Headers(extra);
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstreamRes.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

/* ------------------------------------------------------------------ *
 * LPF (partidos) — mirrors sealed-url.ts openLpfUrl + hls-relay relaySegment
 * ------------------------------------------------------------------ */

const LPF_AAD = Buffer.from("goltv-lpf-relay");

function lpfKey(env: Env): Buffer {
  const secret = env.LPF_PROXY_SECRET?.trim();
  if (!secret) throw new Error("LPF_PROXY_SECRET is not configured");
  return sha256Key(secret);
}

function openLpfUrl(token: string, env: Env): string | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 12 + 17) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(raw.length - 16);
    const cipherText = raw.subarray(12, raw.length - 16);

    const decipher = createDecipheriv("aes-256-gcm", lpfKey(env), iv) as GcmDecipher;
    decipher.setAAD(LPF_AAD);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8");

    const parsed = JSON.parse(plain) as { u?: unknown; e?: unknown };
    if (typeof parsed.u !== "string" || typeof parsed.e !== "number") return null;
    if (parsed.e < Date.now()) return null;
    return httpsUrl(parsed.u)?.toString() ?? null;
  } catch {
    return null;
  }
}

const LPF_ALLOWED_SUFFIXES = [".ftlly.com", ".futlivehd.com", ".ebaclofen.org"];
const LPF_ALLOWED_PREFIXES = ["fhlsport"];

function isAllowedStreamUrl(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (
    LPF_ALLOWED_SUFFIXES.some(
      (suffix) => host === suffix.slice(1) || host.endsWith(suffix)
    ) || LPF_ALLOWED_PREFIXES.some((prefix) => host.startsWith(prefix))
  );
}

/**
 * LPF playlist hosts configured on the app (`LPF_STREAM_HOSTS`). The populate
 * endpoint fetches these on behalf of Render, so the worker needs the same
 * allowlist or every LPF segment populate would 403.
 */
function isLpfStreamHostAllowed(url: URL, env: Env): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (env.LPF_STREAM_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some(
      (suffix) =>
        host === suffix.replace(/^\./, "") ||
        host.endsWith(suffix.startsWith(".") ? suffix : `.${suffix}`)
    );
}

const PLAYER_DOMAINS = ["kora-plus.mov", "kora-plus.li", "kora-plus.app"];
const PLAYER_PAGE_PATH_RE = /\/(?:framelatin|framestream)\.php$/i;

function isEmbedPlayerPage(url: URL, env: Env): boolean {
  const host = url.hostname.toLowerCase();
  const extra = (env.EMBED_PLAYER_DOMAINS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const domains = [...PLAYER_DOMAINS, ...extra];
  const isPlayerHost = domains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
  return isPlayerHost && PLAYER_PAGE_PATH_RE.test(url.pathname);
}

function rot13(value: string): string {
  return value.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(base + ((c.charCodeAt(0) - base + 13) % 26));
  });
}

function decodeMirrorParam(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return atob(rot13(decodeURIComponent(raw.slice(8))));
  } catch {
    return null;
  }
}

function mirrorBackupUrl(upstream: URL): URL | null {
  const rawQuery = upstream.search;
  if (!rawQuery.includes("_ctuph=") || !rawQuery.includes("_ctump=")) return null;
  const pick = (key: string): string | null => {
    const m = rawQuery.match(new RegExp(`[?&]${key}=([^&]*)`));
    return m ? m[1] : null;
  };
  const path = decodeMirrorParam(pick("_ctuph"));
  const mirror = decodeMirrorParam(pick("_ctump"));
  if (!path || !mirror) return null;
  const host = mirror.split("@").pop();
  if (!host) return null;
  try {
    const url = new URL(`https://${host}${path}`);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

const EDGE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function upstreamHeaders(upstream: URL, range: string | null, env: Env): Record<string, string> {
  const headers: Record<string, string> = { Accept: "*/*" };
  if (range) headers.Range = range;
  if (upstream.hostname.startsWith("fhlsport")) {
    headers["User-Agent"] = EDGE_UA;
    const referer = env.PLAYER_SIX_REFERER?.trim();
    if (referer) headers["Referer"] = referer;
  }
  return headers;
}

async function fetchWithMirrorFallback(
  upstream: URL,
  range: string | null,
  env: Env
): Promise<Response> {
  const headers = upstreamHeaders(upstream, range, env);
  const candidates: URL[] = [];
  const backup = mirrorBackupUrl(upstream);
  if (backup && backup.hostname !== upstream.hostname && !isBlockedNetworkTarget(backup)) {
    candidates.push(backup);
  }
  candidates.push(upstream);

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (res.ok || res.status === 206 || candidate === candidates[candidates.length - 1]) {
        return res;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("all upstream candidates failed");
}

async function handleLpfSeg(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const rawToken = url.searchParams.get("t");
  const rawPlain = url.searchParams.get("u");

  let target: string | null = null;
  if (rawToken) {
    try {
      target = openLpfUrl(rawToken, env);
    } catch {
      target = null;
    }
    if (!target) {
      return new Response("Invalid or expired stream token", { status: 400 });
    }
  } else {
    target = rawPlain;
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
  if (isEmbedPlayerPage(upstream, env)) {
    return new Response("Player pages are not segments", { status: 400 });
  }
  if (!isAllowedStreamUrl(upstream)) {
    return new Response("Stream host not allowed", { status: 403 });
  }

  const range = request.headers.get("range");

  try {
    const upstreamRes = await fetchWithMirrorFallback(upstream, range, env);

    const contentType = upstreamRes.headers.get("content-type") ?? "";
    const isPlaylist =
      upstream.pathname.toLowerCase().endsWith(".m3u8") || contentType.includes("mpegurl");

    if (isPlaylist) {
      // Playlists must never be cached — relay without cache headers.
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: withPassthrough(upstreamRes, NO_STORE_HEADERS),
      });
    }

    if (request.method === "HEAD") {
      return new Response(null, {
        status: upstreamRes.status,
        headers: withPassthrough(upstreamRes, SEGMENT_HEADERS),
      });
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: withPassthrough(upstreamRes, SEGMENT_HEADERS),
    });
  } catch (error) {
    console.warn("[seg-relay] lpf upstream failed:", error);
    return new Response("Upstream stream unavailable", { status: 502 });
  }
}

/* ------------------------------------------------------------------ *
 * Canales — mirrors streams.ts openCanalToken + canal seg route
 * ------------------------------------------------------------------ */

const CANAL_AAD = Buffer.from("goltv-canales-relay");

function canalKey(env: Env): Buffer {
  const secret = env.CANALES_PROXY_SECRET?.trim();
  if (!secret) throw new Error("CANALES_PROXY_SECRET is not configured");
  return sha256Key(secret);
}

interface CanalToken {
  url: string;
  encrypted: boolean;
}

function openCanalToken(token: string, env: Env): CanalToken | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 12 + 17) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(raw.length - 16);
    const cipherText = raw.subarray(12, raw.length - 16);

    const decipher = createDecipheriv("aes-256-gcm", canalKey(env), iv) as GcmDecipher;
    decipher.setAAD(CANAL_AAD);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8");

    const parsed = JSON.parse(plain) as { u?: unknown; e?: unknown; k?: unknown };
    if (typeof parsed.u !== "string" || typeof parsed.e !== "number") return null;
    if (parsed.e < Date.now()) return null;
    const url = httpsUrl(parsed.u);
    if (!url) return null;
    return { url: url.toString(), encrypted: parsed.k === 1 };
  } catch {
    return null;
  }
}

const DASH_PLACEHOLDERS: Array<[string, string]> = [
  ["$Time$", "time"],
  ["$Number$", "number"],
  ["$Bandwidth$", "bandwidth"],
  ["$RepresentationID$", "representationid"],
];

function expandDashTemplate(url: string, params: URLSearchParams): string {
  let expanded = url;
  for (const [placeholder, name] of DASH_PLACEHOLDERS) {
    const value = params.get(name);
    if (value) expanded = expanded.split(placeholder).join(value);
  }
  return expanded;
}

function isCanalStreamHost(url: URL, env: Env): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (env.CANALES_STREAM_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((suffix) => host === suffix.replace(/^\./, "") || host.endsWith(suffix.startsWith(".") ? suffix : `.${suffix}`));
}

/** Renames the encryption boxes so clear media reads as unencrypted (1:1 port). */
function neutralizeDrmBoxes(buffer: Buffer): Buffer {
  const copy = Buffer.from(buffer);
  const swaps = ["pssh", "sinf", "senc", "saiz", "saio", "sbgp", "sgpd", "encv", "enca"];
  for (const tag of swaps) {
    const to = tag === "encv" ? "avc1" : tag === "enca" ? "mp4a" : "free";
    let index = copy.indexOf(tag);
    while (index !== -1) {
      copy.write(to, index, 4, "latin1");
      index = copy.indexOf(tag);
    }
  }
  return copy;
}

async function canalFetchUpstream(url: URL, headers: Record<string, string>): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.ok || res.status < 500) return res;
      lastError = new Error(`upstream ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error("upstream unavailable");
}

async function handleCanalSeg(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const rawToken = url.searchParams.get("t");
  const sealed = rawToken ? openCanalToken(rawToken, env) : null;
  if (!sealed) {
    return new Response("Invalid stream reference", { status: 400 });
  }

  // The player substitutes the DASH placeholders next to the sealed token.
  let target = expandDashTemplate(sealed.url, url.searchParams);

  // Low latency HLS part requests carry their own query parameters.
  const partParams = new URLSearchParams();
  for (const name of ["_HLS_msn", "_HLS_part", "_HLS_skip"]) {
    const value = url.searchParams.get(name);
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
    return new Response("Missing or invalid segment URL", { status: 400 });
  }
  if (!isCanalStreamHost(upstream, env)) {
    return new Response("Stream host not allowed", { status: 403 });
  }

  try {
    const headers: Record<string, string> = { Accept: "*/*" };
    const range = request.headers.get("range");
    if (range) headers.Range = range;

    const upstreamRes = await canalFetchUpstream(upstream, headers);

    if (!upstreamRes.ok) {
      return new Response("Stream unavailable", {
        status: upstreamRes.status === 404 ? 503 : upstreamRes.status,
      });
    }

    const contentType = upstreamRes.headers.get("content-type") ?? "";
    const isPlaylist =
      upstream.pathname.toLowerCase().endsWith(".m3u8") || contentType.includes("mpegurl");
    const isManifest =
      upstream.pathname.toLowerCase().endsWith(".mpd") || contentType.includes("dash");

    // Playlists/manifests must never be cached.
    if (isPlaylist || isManifest) {
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: withPassthrough(upstreamRes, NO_STORE_HEADERS),
      });
    }

    if (request.method === "HEAD") {
      return new Response(null, {
        status: upstreamRes.status,
        headers: withPassthrough(upstreamRes, SEGMENT_HEADERS),
      });
    }

    const body = Buffer.from(await upstreamRes.arrayBuffer());
    const isInit = upstream.pathname.toLowerCase().includes("-init.");
    const finalBody = isInit && !sealed.encrypted ? neutralizeDrmBoxes(body) : body;

    return new Response(new Uint8Array(finalBody), {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: withPassthrough(upstreamRes, SEGMENT_HEADERS),
    });
  } catch (error) {
    console.warn("[seg-relay] canal upstream failed:", error);
    return new Response("Stream unavailable", { status: 502 });
  }
}

/* ------------------------------------------------------------------ *
 * R2 populate — pre-fetch segments into the bucket so viewers are
 * served by the CDN/R2 layer instead of this worker.
 * ------------------------------------------------------------------ */

/** Minimal R2Bucket surface used here (avoids a workers-types dependency). */
interface R2BucketLike {
  head(key: string): Promise<unknown>;
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }
  ): Promise<unknown>;
}

function r2SegmentKey(kind: string, token: string): string {
  const hex = createHash("sha256").update(token).digest("hex");
  return `v1/${kind}/${hex.slice(0, 48)}`;
}

async function r2PutSegment(
  env: Env,
  kind: string,
  token: string,
  body: ArrayBuffer | Uint8Array,
  contentType: string
): Promise<string> {
  const bucket = env.SEGMENTS_BUCKET;
  if (!bucket) throw new Error("SEGMENTS_BUCKET binding missing");
  const key = r2SegmentKey(kind, token);
  await bucket.put(key, body, {
    httpMetadata: {
      contentType: contentType || "application/octet-stream",
      cacheControl: "public, max-age=86400, immutable",
    },
  });
  return key;
}

async function r2HasSegment(env: Env, kind: string, token: string): Promise<boolean> {
  const bucket = env.SEGMENTS_BUCKET;
  if (!bucket) return false;
  return (await bucket.head(r2SegmentKey(kind, token))) !== null;
}

interface PopulateResult {
  status: number;
  body: string;
}

/** Fetches one LPF segment upstream and stores it in R2. */
async function populateLpf(env: Env, url: URL): Promise<PopulateResult> {
  const rawToken = url.searchParams.get("t");
  const rawPlain = url.searchParams.get("u");

  let target: string | null = null;
  if (rawToken) {
    try {
      target = openLpfUrl(rawToken, env);
    } catch {
      target = null;
    }
    if (!target) return { status: 400, body: "Invalid or expired stream token" };
  } else {
    target = rawPlain;
  }

  let upstream: URL;
  try {
    upstream = new URL(target ?? "");
  } catch {
    return { status: 400, body: "Missing or invalid segment URL" };
  }
  if (upstream.protocol !== "https:") return { status: 403, body: "Segment URL not allowed" };
  if (isEmbedPlayerPage(upstream, env)) return { status: 400, body: "Player pages are not segments" };
  if (!isAllowedStreamUrl(upstream) && !isLpfStreamHostAllowed(upstream, env)) {
    return { status: 403, body: `Stream host not allowed: ${upstream.hostname}` };
  }

  const tokenForKey = rawToken ?? upstream.toString();
  if (await r2HasSegment(env, "lpf", tokenForKey)) {
    return { status: 200, body: "exists" };
  }

  const upstreamRes = await fetchWithMirrorFallback(upstream, null, env);
  if (!upstreamRes.ok) return { status: 502, body: `upstream ${upstreamRes.status}` };

  const contentType = upstreamRes.headers.get("content-type") ?? "";
  const isPlaylist =
    upstream.pathname.toLowerCase().endsWith(".m3u8") || contentType.includes("mpegurl");
  if (isPlaylist) return { status: 200, body: "skip-playlist" };

  const body = await upstreamRes.arrayBuffer();
  await r2PutSegment(env, "lpf", tokenForKey, body, contentType);
  return { status: 200, body: "stored" };
}

/** Fetches one canal HLS segment upstream and stores it in R2. */
async function populateCanal(env: Env, url: URL): Promise<PopulateResult> {
  const rawToken = url.searchParams.get("t");
  const sealed = rawToken ? openCanalToken(rawToken, env) : null;
  if (!sealed || !rawToken) return { status: 400, body: "Invalid stream reference" };

  let target = expandDashTemplate(sealed.url, url.searchParams);
  const partParams = new URLSearchParams();
  for (const name of ["_HLS_msn", "_HLS_part", "_HLS_skip"]) {
    const value = url.searchParams.get(name);
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
    return { status: 400, body: "Missing or invalid segment URL" };
  }
  if (!isCanalStreamHost(upstream, env)) {
    return { status: 403, body: `Stream host not allowed: ${upstream.hostname}` };
  }

  if (await r2HasSegment(env, "canal", rawToken)) {
    return { status: 200, body: "exists" };
  }

  const headers: Record<string, string> = { Accept: "*/*" };
  const upstreamRes = await canalFetchUpstream(upstream, headers);
  if (!upstreamRes.ok) return { status: 502, body: `upstream ${upstreamRes.status}` };

  const contentType = upstreamRes.headers.get("content-type") ?? "";
  const isPlaylist =
    upstream.pathname.toLowerCase().endsWith(".m3u8") || contentType.includes("mpegurl");
  const isManifest =
    upstream.pathname.toLowerCase().endsWith(".mpd") || contentType.includes("dash");
  if (isPlaylist || isManifest) return { status: 200, body: "skip-playlist" };

  const body = Buffer.from(await upstreamRes.arrayBuffer());
  const isInit = upstream.pathname.toLowerCase().includes("-init.");
  const finalBody = isInit && !sealed.encrypted ? neutralizeDrmBoxes(body) : body;

  await r2PutSegment(env, "canal", rawToken, finalBody, contentType);
  return { status: 200, body: "stored" };
}

async function handlePopulate(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  }
  const kind = url.searchParams.get("kind");
  try {
    const result =
      kind === "canal" ? await populateCanal(env, url) : await populateLpf(env, url);
    return new Response(result.body, {
      status: result.status,
      headers: { "Content-Type": "text/plain", ...CORS_HEADERS },
    });
  } catch (error) {
    console.warn("[seg-relay] populate failed:", error);
    return new Response("Populate failed", { status: 502 });
  }
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

interface Env {
  LPF_PROXY_SECRET?: string;
  LPF_STREAM_HOSTS?: string;
  CANALES_PROXY_SECRET?: string;
  CANALES_STREAM_HOSTS?: string;
  PLAYER_SIX_REFERER?: string;
  EMBED_PLAYER_DOMAINS?: string;
  SEGMENTS_BUCKET?: R2BucketLike;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/hls/seg" || url.pathname.startsWith("/api/hls/seg/")) {
      return handleLpfSeg(request, env, url);
    }
    if (url.pathname === "/api/canales/seg" || url.pathname.startsWith("/api/canales/seg/")) {
      return handleCanalSeg(request, env, url);
    }
    if (url.pathname === "/api/populate" || url.pathname.startsWith("/api/populate/")) {
      return handlePopulate(request, env, url);
    }
    return new Response("Not found", { status: 404 });
  },
};
