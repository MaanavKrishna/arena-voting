import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { listContestIds, serverReader } from "./_site/contests.server";
import { siteUrl } from "./_site/brand";

/** Public pages worth indexing. Kiosk screens, /manage and /me are left out on purpose. */
export const STATIC_ROUTES: { path: string; changeFrequency: "daily" | "weekly" | "monthly"; priority: number }[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/explore", changeFrequency: "daily", priority: 0.9 },
  { path: "/create", changeFrequency: "monthly", priority: 0.7 },
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.8 },
  { path: "/organisers", changeFrequency: "monthly", priority: 0.7 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.7 },
  { path: "/trust", changeFrequency: "monthly", priority: 0.6 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.3 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.3 },
];

/**
 * Contest ids read from the chain, cached for an hour. Never throws: if the RPC is down, slow or
 * not configured the sitemap still lists the static pages.
 */
export async function contestIds(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  const reader = serverReader();
  if (!reader) return [];
  try {
    return await listContestIds(reader);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const ids = await contestIds();
  return [
    ...STATIC_ROUTES.map((r) => ({
      url: `${base}${r.path === "/" ? "" : r.path}`,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    })),
    ...ids.map((id) => ({ url: `${base}/c/${id}`, changeFrequency: "hourly" as const, priority: 0.6 })),
  ];
}
