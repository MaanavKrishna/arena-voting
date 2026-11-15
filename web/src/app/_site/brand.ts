import { oklchToSrgb, parseOklch } from "@/lib/contrast";
import { colorTokens, type ColorToken, type ThemeName } from "@/lib/tokens";

/**
 * Brand values for files rendered outside the browser's CSS (icons, OG images, the web manifest).
 * Colours come from the design tokens and are converted to hex, because image renderers and
 * manifest parsers don't all understand oklch().
 */
export function tokenHex(token: ColorToken, theme: ThemeName): string {
  const [r, g, b] = oklchToSrgb(parseOklch(colorTokens[token][theme]));
  return `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** The mark always sits on graphite, so it uses the dark-theme values. */
export const markColours = {
  graphite: tokenHex("bg", "dark"),
  seat: tokenHex("fg", "dark"),
  ember: tokenHex("live", "dark"),
  muted: tokenHex("fg-muted", "dark"),
  subtle: tokenHex("fg-subtle", "dark"),
} as const;

export const SITE_NAME = "Arena";
export const SITE_TAGLINE = "The room decides.";
export const SITE_DESCRIPTION =
  "Run a contest where only the people in the room can vote. The prize is locked in a smart contract before the first vote and paid to the winner when voting closes.";

/**
 * Absolute origin for metadata, the sitemap and robots.txt. Vercel sets
 * VERCEL_PROJECT_PRODUCTION_URL to the production host (no protocol); locally it's the dev server.
 */
export function siteUrl(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host ? `https://${host.replace(/^https?:\/\//, "").replace(/\/+$/, "")}` : "http://localhost:3000";
}
