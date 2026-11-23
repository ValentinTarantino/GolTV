import { LEAGUE_LOGOS } from "@/lib/constants";
import { proxyImageUrl, openImageToken } from "@/lib/public-url";
import { prefetchImage } from "@/lib/image-cache";
import LeaguesClient from "./LeaguesClient";

export const dynamic = "force-dynamic";

export default function LeaguesPage() {
  const logos: Record<string, string> = {};
  for (const [id, url] of Object.entries(LEAGUE_LOGOS)) {
    logos[id] = proxyImageUrl(url);
  }

  // Warm the shared image cache so league badges are instant on first paint.
  for (const proxied of Object.values(logos)) {
    if (!proxied.startsWith("/api/img?t=")) continue;
    const upstream = openImageToken(proxied.slice("/api/img?t=".length));
    if (upstream) prefetchImage(upstream);
  }

  return <LeaguesClient leagueLogos={logos} />;
}
