import { ImageResponse } from "next/og";
import { loadOgFonts, RootOgImage } from "./_site/og";

export const alt = "Arena — The room decides.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(<RootOgImage />, { ...size, fonts: await loadOgFonts() });
}
