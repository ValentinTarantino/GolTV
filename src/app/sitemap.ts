import type { MetadataRoute } from "next";
import { SUPPORTED_LEAGUES } from "@/lib/constants";

const BASE_URL = "https://goltv-libre.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE_URL}/leagues`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  const leaguePages: MetadataRoute.Sitemap = SUPPORTED_LEAGUES.map((league) => ({
    url: `${BASE_URL}/leagues?league=${league.id}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...leaguePages];
}
