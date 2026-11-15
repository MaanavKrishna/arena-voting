import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME, tokenHex } from "./_site/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: tokenHex("bg", "dark"),
    theme_color: tokenHex("bg", "dark"),
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
