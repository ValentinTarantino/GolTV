import { NextRequest, NextResponse } from "next/server";
import { isIPBanned } from "@/lib/chat";
import { incrementCounter } from "@/lib/cache";
import { getClientIP } from "@/lib/client-ip";
import { isBlockedNetworkTarget } from "@/lib/url-guard";
import { openLpfUrl, sealLpfUrl } from "@/lib/sealed-url";

/** Requests allowed per address per minute: the player only needs a handful. */
const MAX_REQUESTS_PER_MINUTE = 90;

/** Ceiling for a proxied document. Media pages are far smaller than this. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * Only what a media page needs. The old code forwarded the whole request,
 * including `cookie` and `authorization`, so any host the visitor loaded
 * through the proxy received this site's session cookies.
 */
const FORWARDED_HEADERS = [
  "accept",
  "accept-language",
  "range",
  "if-none-match",
  "if-modified-since",
];

/**
 * Rejects loopback, private ranges and cloud metadata endpoints. The shared
 * guard also protects the sealed relays, so the rule cannot drift between
 * routes.
 */
const isBlockedTarget = isBlockedNetworkTarget;

/** Ban check plus a per-address budget for every proxy verb. */
async function denyRequest(request: NextRequest): Promise<Response | null> {
  const clientIP = getClientIP(request.headers);
  if (await isIPBanned(clientIP)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  const hits = await incrementCounter(`proxy:${clientIP}`, 60_000);
  if (hits > MAX_REQUESTS_PER_MINUTE) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const denied = await denyRequest(request);
  if (denied) return denied;
  return handleProxy(request);
}

export async function POST(request: NextRequest) {
  const denied = await denyRequest(request);
  if (denied) return denied;
  return handleProxy(request);
}

export async function HEAD(request: NextRequest) {
  const denied = await denyRequest(request);
  if (denied) return denied;
  return handleProxy(request);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}

async function handleProxy(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  // `?t=` carries the target sealed (opaque token); `?url=` stays for
  // compatibility with already-issued links and playlist rewrites.
  const viaToken = !searchParams.get("url") && !!searchParams.get("t");
  let url = searchParams.get("url");
  if (!url) {
    const token = searchParams.get("t");
    if (token) {
      try {
        url = openLpfUrl(token);
      } catch {
        url = null;
      }
    }
  }

  /** Keeps the redirect hop opaque when the request arrived sealed. */
  const proxyHref = (target: string): string => {
    if (!viaToken) {
      return `${request.nextUrl.origin}/api/proxy?url=${encodeURIComponent(target)}`;
    }
    try {
      return `${request.nextUrl.origin}/api/proxy?t=${sealLpfUrl(target)}`;
    } catch {
      return `${request.nextUrl.origin}/api/proxy?url=${encodeURIComponent(target)}`;
    }
  };

  if (!url) {
    console.error("[Proxy] Missing URL parameter");
    return NextResponse.json({ error: "Missing URL parameter" }, { status: 400 });
  }

  try {
    const targetUrl = new URL(url);
    // SSRF guard: no loopback, no private ranges, no cloud metadata.
    if (isBlockedTarget(targetUrl)) {
      return NextResponse.json({ error: "Target not allowed" }, { status: 403 });
    }

    // Reading a media page never needs POST, and an open POST relay can be
    // used to spam a third party with your infrastructure as the source.
    const method = request.method === "HEAD" ? "HEAD" : "GET";

    // Only the headers a media page needs. Forwarding the whole request used
    // to hand the visitor's session cookie to whatever host they passed in.
    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    // Set headers to simulate real browser
    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
    headers.set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8");
    headers.set("Accept-Language", "es-ES,es;q=0.9,en;q=0.8");
    headers.set("Accept-Encoding", "gzip, deflate, br");
    headers.set("Referer", targetUrl.origin);
    headers.set("Origin", targetUrl.origin);
    headers.set("Connection", "keep-alive");
    headers.set("Upgrade-Insecure-Requests", "1");
    headers.set("Sec-Fetch-Dest", "document");
    headers.set("Sec-Fetch-Mode", "navigate");
    headers.set("Sec-Fetch-Site", "same-origin");
    headers.set("Sec-Fetch-User", "?1");
    headers.set("Cache-Control", "max-age=0");

    console.log("[Proxy] Making request to:", targetUrl.toString());

    // Make the request to the target
    const response = await fetch(targetUrl.toString(), {
      method,
      headers,
      redirect: "manual", // Handle redirects manually
    });

    // Handle redirects
    if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
      const location = response.headers.get("location");
      if (location) {
        const redirectUrl = new URL(location, targetUrl);
        // A public host can redirect straight into the private network; the
        // guard has to run on the destination too, not only on the input.
        if (isBlockedTarget(redirectUrl)) {
          return NextResponse.json({ error: "Target not allowed" }, { status: 403 });
        }
        return NextResponse.redirect(proxyHref(redirectUrl.toString()));
      }
    }

    if (!response.ok) {
      console.error("[Proxy] Failed to fetch:", response.status);
      return NextResponse.json({ error: `Failed to fetch: ${response.status}` }, { status: response.status });
    }

    const contentType = response.headers.get("content-type") || "text/html";

    // Only text is ever processed; a binary or huge body would just sit in
    // memory on the server until the function times out.
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Response too large" }, { status: 413 });
    }
    const body = await response.text();
    if (body.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Response too large" }, { status: 413 });
    }

    // Process HTML content
    let modifiedBody = body;
    if (contentType.includes("text/html")) {
      
      // Ad blocking patterns (similar to uBlock Origin EasyList)
      const adPatterns = [
        // Common ad network scripts
        /<script[^>]*src=["'].*?(google-analytics|googletagmanager|googlesyndication|doubleclick|facebook\.com\/tr|facebook\.com\/pixel|twitter\.com\/i\/jot|connect\.facebook\.net|cdn\.ampproject\.org|quantserve\.com|scorecardresearch\.com|rubiconproject\.com|adnxs\.com|outbrain\.com|taboola\.com|disqus\.com|addthis\.com|criteo\.com|appnexus\.com|adform\.com|lijit\.com|smartadserver\.com|pubmatic\.com|sharethrough\.com|moatads\.com|spotxchange\.com|openx\.net|pubmatic\.com|indexww\.com|taboola\.com|yieldoptimizer\.com|serving-sys\.com|adroll\.com|pixfuture\.com|adsystem|adserver|tracking|pixel)/gi,
        // Ad div elements
        /<div[^>]*(class|id)[^>]*["']*(ad|advertisement|ad-container|ad-wrapper|ad-slot|ad-banner|ad-sidebar|ad-header|ad-footer|ad-popup|ad-modal|ad-overlay|ad-interstitial|ad-sticky|ad-video|ad-player|pre-roll|mid-roll|post-roll|sponsored|promo|partner|popup|modal|overlay|interstitial|sticky|banner)[^"']*["'][^>]*>/gi,
        // Ad iframes
        /<iframe[^>]*(class|id|src)[^>]*["']*(ad|advertisement|promo|sponsored|banner|partner|popup|modal|overlay|interstitial|pre-roll|mid-roll|post-roll|sticky|googleads|doubleclick|adserver|adroll|taboola|criteo|outbrain|sharethrough|disqus|addthis|scorecardresearch|quantserve|rubicon|adnxs|appnexus|pubmatic|lijit|smartadserver|pubmatic|moatads|spotxchange|openx)[^"']*["'][^>]*>/gi,
        // Ad images
        /<img[^>]*(class|id|alt|src)[^>]*["']*(ad|advertisement|promo|sponsored|banner|partner|popup|modal|overlay|interstitial|pre-roll|mid-roll|post-roll|sticky|googleads|doubleclick|adroll|taboola|criteo|outbrain|sharethrough|disqus|addthis|scorecardresearch|quantserve|rubicon|adnxs|appnexus|pubmatic|lijit|smartadserver|pubmatic|moatads|spotxchange|openx|indexww|adsystem|adserver|tracking|pixel)[^"']*["'][^>]*>/gi,
        // Ad links
        /<a[^>]*(class|id|href|onclick)[^>]*["']*(ad|advertisement|promo|sponsored|banner|partner|popup|modal|overlay|interstitial|pre-roll|mid-roll|post-roll|sticky|click\.|track|affiliate|referral|ads\.google\.com|ads\.doubleclick\.net|ad\.zqtk\.net|outbrain\.com|taboola\.com|sharethrough\.com|criteo\.com|adform\.com|lijit\.com|smartadserver\.com|pubmatic\.com|moatads\.com|spotxchange\.com|openx\.net|indexww\.com)[^"']*["'][^>]*>[\s\S]*?<\/a>/gi,
        // Noscript ads
        /<noscript[^>]*>.*?<\/noscript>/gi,
      ];
      
      // Remove ads
      for (const pattern of adPatterns) {
        modifiedBody = modifiedBody.replace(pattern, '');
      }
      
      // Rewrite all absolute URLs to go through proxy
      modifiedBody = modifiedBody
        // Rewrite iframe src
        .replace(/<iframe\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (match, before, src, after) => {
          if (src.startsWith('http')) {
            const absoluteUrl = new URL(src, targetUrl).href;
            return `<iframe ${before}src="${proxyHref(absoluteUrl)}"${after}>`;
          }
          return match;
        })
        // Rewrite script src
        .replace(/<script\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (match, before, src, after) => {
          if (src.startsWith('http')) {
            const absoluteUrl = new URL(src, targetUrl).href;
            return `<script ${before}src="${proxyHref(absoluteUrl)}"${after}>`;
          }
          return match;
        })
        // Rewrite link href (CSS, etc)
        .replace(/<link\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi, (match, before, href, after) => {
          if (href.startsWith('http') || href.endsWith('.css')) {
            const absoluteUrl = new URL(href, targetUrl).href;
            return `<link ${before}href="${proxyHref(absoluteUrl)}"${after}>`;
          }
          return match;
        })
        // Rewrite img src
        .replace(/<img\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (match, before, src, after) => {
          if (src.startsWith('http')) {
            const absoluteUrl = new URL(src, targetUrl).href;
            return `<img ${before}src="${proxyHref(absoluteUrl)}"${after}>`;
          }
          return match;
        })
        // Rewrite anchor tags
        .replace(/<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi, (match, before, href, after) => {
          if (href.startsWith('http')) {
            const absoluteUrl = new URL(href, targetUrl).href;
            return `<a ${before}href="${proxyHref(absoluteUrl)}"${after}>`;
          }
          return match;
        })
        // Remove security meta tags
        .replace(/<meta\s+http-equiv=["']X-Frame-Options["'][^>]*>/gi, "")
        .replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "")
        .replace(/<meta\s+http-equiv=["']REFRESH["'][^>]*>/gi, "")
        // Add base tag for relative URLs
        .replace(/<head>/i, `<head><base href="${targetUrl.origin}/">`);
    }

    // Build response headers
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Skip security headers
      if (!['x-frame-options', 'content-security-policy', 'x-content-type-options', 'strict-transport-security', 'referrer-policy'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    // Add permissive headers
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");
    responseHeaders.set("Access-Control-Max-Age", "86400");
    responseHeaders.set("X-Frame-Options", "ALLOWALL");
    responseHeaders.set("Content-Security-Policy", "frame-ancestors *;");
    responseHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");

    return new NextResponse(modifiedBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    // The message can carry the upstream URL and internal detail; log it,
    // answer with a code only.
    console.error("[Proxy] error:", error);
    return NextResponse.json({ error: "Proxy error" }, { status: 502 });
  }
}
