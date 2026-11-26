import type { NextConfig } from "next";

// Badge CDN hosts come from IMG_PROXY_HOSTS (same list the image proxy and
// the segment-relay worker enforce) — nothing provider-specific is baked in.
const imageRemotePatterns = (process.env.IMG_PROXY_HOSTS ?? "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean)
  .map((hostname) => ({ protocol: "https" as const, hostname, pathname: "/**" }));

const nextConfig: NextConfig = {
  output: "standalone",
  // sharp is a native binary (badge optimizer) and mongodb manages its own
  // connection pool — both must stay external so edge bundles don't inline
  // platform-specific code. On Workers they degrade gracefully at runtime.
  serverExternalPackages: ["sharp", "mongodb"],
  images: {
    // Badge widths at 1x, 2x and 3x pixel density, including 48px desktop cards.
    imageSizes: [32, 40, 48, 64, 80, 96, 128, 144, 192, 256, 384],
    formats: ["image/webp"],
    // Same-origin image proxies carry their target in the query string; without
    // these patterns next/image rejects them before they ever render.
    localPatterns: [
      { pathname: "/badges/**" },
      { pathname: "/icon.svg" },
      { pathname: "/api/img" },
      { pathname: "/api/league-logos" },
      { pathname: "/api/lpf/crest" },
    ],
    remotePatterns: imageRemotePatterns,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: https: http://i.pinimg.com https://i.pinimg.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https:",
              "media-src 'self' blob: https:",
              "frame-src 'self' https:",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      {
        // The /p4 player proxy must stay frameable by our own watch page;
        // later entries override the same header key from the catch-all above.
        source: "/p4/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // Player 1 plays through this bare-frame document, so the watch page
        // has to be able to frame it. DENY would block even our own origin.
        source: "/api/secondary",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // /api/frame answers with a redirect into the provider page; the
        // framed document is the provider's, but keep the hop frameable.
        source: "/api/frame",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

export default nextConfig;
