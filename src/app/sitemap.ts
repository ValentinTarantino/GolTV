import type { MetadataRoute } from "next";
import { SUPPORTED_LEAGUES } from "@/lib/constants";
import { hasStandings } from "@/lib/standings";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://goltv.stream";

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
    {
      url: `${BASE_URL}/lpf`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/boxeo`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/nba`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/tennis`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
  ];

  const leaguePages: MetadataRoute.Sitemap = SUPPORTED_LEAGUES.filter((league) =>
    hasStandings(league.id)
  ).map((league) => ({
    url: `${BASE_URL}/leagues?league=${league.id}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...leaguePages];
}
