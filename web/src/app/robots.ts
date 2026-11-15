import type { MetadataRoute } from "next";
import { siteUrl } from "./_site/brand";

/**
 * Everything public may be crawled. The API, the kiosk screens (Gate, Stage), the organiser
 * control room and the personal /me page are not useful in search results.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/c/*/gate", "/c/*/stage", "/c/*/manage", "/me"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
