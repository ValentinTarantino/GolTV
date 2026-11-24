import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import type { OpenNextConfig } from "@opennextjs/aws/types/open-next";

const config: OpenNextConfig = {
  ...defineCloudflareConfig({}),
  // Next 16 builds with Turbopack by default; OpenNext 1.19 expects the
  // webpack output layout, otherwise runtime chunks are missing (ChunkLoadError).
  buildCommand: "npx next build --webpack",
};

export default config;
