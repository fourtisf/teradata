import type { MetadataRoute } from "next";
import { getDataProvider } from "@/lib/data";
import { SITE_URL } from "@/lib/config/site";

/**
 * §8's index. Every public page is listed here or a crawler has to find it by
 * following links alone.
 *
 * While the figures are simulated the sitemap is empty on purpose — robots.ts
 * disallows everything in that mode, and advertising URLs we are asking not to
 * be indexed is a contradiction.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const provider = getDataProvider();
  if (provider.source === "sim") return [];

  const [days, origins, routes] = await Promise.all([
    provider.listDays(30),
    provider.listOrigins(),
    provider.listRoutes(),
  ]);
  const now = new Date();

  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/status`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
    ...days.map((date, index) => ({
      url: `${SITE_URL}/day/${date}`,
      lastModified: now,
      // Only today is still moving; the rest closed their window and are history.
      changeFrequency: (index === 0 ? "hourly" : "monthly") as "hourly" | "monthly",
      priority: index === 0 ? 0.9 : 0.6,
    })),
    ...origins.map((origin) => ({
      url: `${SITE_URL}/origin/${origin.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...routes.map((route) => ({
      url: `${SITE_URL}/route/${route.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
