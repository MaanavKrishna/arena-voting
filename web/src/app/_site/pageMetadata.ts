import type { Metadata } from "next";
import { SITE_NAME } from "./brand";

/**
 * Metadata for the content pages. A page-level `openGraph` object replaces the root one instead of
 * merging, so this repeats the shared fields and points at the root share image explicitly.
 */
export function contentPageMetadata({
  title,
  heading,
  description,
  path,
}: {
  /** Short title for the tab: "%s · Arena". */
  title: string;
  /** The page's H1, used as the share title. */
  heading: string;
  description: string;
  path: string;
}): Metadata {
  const shareTitle = `${heading} · ${SITE_NAME}`;
  const image = { url: "/opengraph-image", width: 1200, height: 630, alt: "Arena — The room decides." };
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en",
      url: path,
      title: shareTitle,
      description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: shareTitle, description, images: [image] },
  };
}
