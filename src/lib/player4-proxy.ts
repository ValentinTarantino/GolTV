import { PLAYER4_PREFIX, playerBase } from "@/lib/player-two-source";

// Same-origin reverse proxy for the PlayerFour (PlayerTwo) embed.
//
// The provider blanks its player frame unless the embedding origin is in its
// own allowlist (judgeValid reads ancestorOrigins/document.referrer) and runs
// a disable-devtool trap that forces about:blank while the parent frame is
// readable. Serving the page under our own origin makes ancestorOrigins[0] ours,
// so the two checks are neutralized with server-side JS patches: judgeValid
// becomes a no-op and the trap guard always passes. Upstream keeps receiving
// the provider's Referer (its API rejects requests without one).
//
// Upstream routing by first path segment:
//   _s/...            → PLAYER_TWO_STATICS_URL (bundles, CSS, images)
//   api*/...          → PLAYER_TWO_API_BASE (incl. /api-cf/*)
//   sfver.../...      → PLAYER_TWO_API_BASE (signed API requests)
//   anything else     → PLAYER_TWO_PLAYER_URL (player.html, /js/*)

const UPSTREAM_TIMEOUT_MS = 30_000;

const UPSTREAM_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

// Matched by code shape, not bundle filename: the provider rotates its hashed
// bundles. Both needles were verified unique in the served bundles.
const JS_PATCHES: ReadonlyArray<{ needle: string; replacement: string }> = [
  { needle: "'judgeValid':function(){", replacement: "'judgeValid':function(){return;" },
  { needle: "['href'],!0x1;}catch(ej){return!0x0;}", replacement: "['href'],!0x0;}catch(ej){return!0x0;}" },
];

// API_URL_BROWSER binds (main c$config and per-route config) in the inline
// __NUXT__ IIFE: the browser API base must move under the proxy so XHRs stay
// same-origin instead of hitting our app router's own /api routes. The value is
// patched at the property, NOT at the shared arg: that arg is also basePath /
// assetsPath, which must keep "/" or webpack's CSS-chunk URLs gain a stray
// path segment and the app never boots.
const HTML_API_BASE_NEEDLE = "API_URL_BROWSER:h,";
const HTML_API_BASE_REPLACEMENT = `API_URL_BROWSER:"\\u002F${PLAYER4_PREFIX.slice(1)}\\u002F",`;
const HTML_ROOT_SCRIPT_NEEDLE = '="/js/';
const HTML_ROOT_SCRIPT_REPLACEMENT = `="${PLAYER4_PREFIX}/js/`;

function envBase(name: string): string {
  return process.env[name]?.trim().replace(/\/$/, "") ?? "";
}

function staticsBase(): string {
  return envBase("PLAYER_TWO_STATICS_URL");
}

function apiBase(): string {
  return envBase("PLAYER_TWO_API_BASE");
}

function referer(): string {
  return process.env.PLAYER_TWO_REFERER?.trim() ?? "";
}

/** Rewrite a provider origin to its proxy prefix, raw and `\u002F`-escaped. */
function replaceOrigin(text: string, origin: string, prefix: string): string {
  if (!origin) return text;
  const escaped = origin.split("/").join("\\u002F");
  return text.split(escaped).join(prefix).split(origin).join(prefix);
}

/**
 * Point provider-hosted URLs at the proxy. Plain config strings in JS/HTML
 * sometimes escape slashes (`https:\u002F\u002F…`), so both spellings are
 * rewritten; escaped origins only occur inside string literals, where the raw
 * prefix is valid too.
 */
function rewriteOrigins(text: string): string {
  const withStatics = replaceOrigin(text, staticsBase(), `${PLAYER4_PREFIX}/_s`);
  return replaceOrigin(withStatics, apiBase(), PLAYER4_PREFIX);
}

export function patchHtml(html: string): string {
  const rewritten = html
    .split(HTML_API_BASE_NEEDLE).join(HTML_API_BASE_REPLACEMENT)
    .split(HTML_ROOT_SCRIPT_NEEDLE).join(HTML_ROOT_SCRIPT_REPLACEMENT);
  return rewriteOrigins(rewritten);
}

export function patchJs(js: string): string {
  let out = js;
  for (const patch of JS_PATCHES) out = out.split(patch.needle).join(patch.replacement);
  return rewriteOrigins(out);
}

/** Map a /p4/... path to the upstream origin that owns it. */
export function resolveUpstream(segments: string[], playerOrigin: string): string | null {
  const rest = segments.join("/");
  const head = segments[0] ?? "";
  if (head === "_s") {
    const statics = staticsBase();
    return statics ? `${statics}/${segments.slice(1).join("/")}` : null;
  }
  // Prefix match: the player also calls /api-cf/... (and future api-* variants),
  // which are served by the API host, not the player host (nginx auth_basic 401).
  if (head.startsWith("api") || head.startsWith("sfver")) {
    const api = apiBase();
    return api ? `${api}/${rest}` : null;
  }
  return playerOrigin ? `${playerOrigin}/${rest}` : null;
}

type ResponseKind = "html" | "js" | "css" | "raw";

function classify(contentType: string, path: string): ResponseKind {
  const type = contentType.toLowerCase();
  if (type.includes("text/html") || path.endsWith(".html")) return "html";
  if (type.includes("javascript") || path.endsWith(".js")) return "js";
  if (type.includes("text/css") || path.endsWith(".css")) return "css";
  return "raw";
}

export async function proxyPlayer4(
  rawSegments: string[],
  search: string,
  clientHeaders: Headers
): Promise<Response> {
  const segments = rawSegments.filter(Boolean);
  if (segments.length === 0) return new Response("Not found", { status: 404 });

  const target = resolveUpstream(segments, await playerBase());
  if (!target) return new Response("Upstream not configured", { status: 502 });
  const url = search ? `${target}${search}` : target;

  const headers: Record<string, string> = {
    "User-Agent": UPSTREAM_UA,
    Accept: clientHeaders.get("accept") ?? "*/*",
    "Accept-Language": clientHeaders.get("accept-language") ?? "es-AR,es;q=0.9,en;q=0.8",
    ...(referer() ? { Referer: referer() } : {}),
  };
  const range = clientHeaders.get("range");
  if (range) headers.Range = range;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.warn("[player4-proxy] upstream failed:", target, error);
    return new Response("Upstream unavailable", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const kind = classify(contentType, segments.join("/"));

  // Whitelist response headers: upstream CSP/X-Frame-Options could block our
  // own embedding, and content-encoding/length no longer match a rewritten body.
  const outHeaders: Record<string, string> = {};
  if (contentType) outHeaders["Content-Type"] = contentType;
  outHeaders["Cache-Control"] =
    upstream.headers.get("cache-control") ??
    (kind === "js" || kind === "css" ? "public, max-age=60" : "no-store");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) outHeaders["Content-Range"] = contentRange;
  const acceptRanges = upstream.headers.get("accept-ranges");
  if (acceptRanges) outHeaders["Accept-Ranges"] = acceptRanges;

  if (!upstream.ok) return new Response(null, { status: upstream.status, headers: outHeaders });
  if (kind === "raw") return new Response(upstream.body, { status: upstream.status, headers: outHeaders });

  const text = await upstream.text();
  const patched =
    kind === "html" ? patchHtml(text) : kind === "js" ? patchJs(text) : rewriteOrigins(text);
  return new Response(patched, { status: upstream.status, headers: outHeaders });
}
