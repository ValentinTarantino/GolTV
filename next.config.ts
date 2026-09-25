import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.api-sports.io",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.thesportsdb.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "r2.thesportsdb.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.football-live-stream.online",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.freebiesupply.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "api.promiedos.com.ar",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "flagcdn.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "encrypted-tbn0.gstatic.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.countryflags.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "football-logos.cc",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "assets.football-logos.cc",
        pathname: "/**",
      },
    ],
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
              "img-src 'self' data: https:",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://media.api-sports.io https://www.thesportsdb.com https://r2.thesportsdb.com https://images.football-live-stream.online https://cdn.freebiesupply.com https://upload.wikimedia.org https://api.promiedos.com.ar https://flagcdn.com https://encrypted-tbn0.gstatic.com https://www.countryflags.com https://football-logos.cc https://assets.football-logos.cc",
              "frame-src 'self' https://futbollibrefullhd.org https://pelotalibre.biz https://tvf90.com",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
