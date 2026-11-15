/**
 * Design tokens — the single source of truth for colour values.
 * `web/src/app/globals.css` mirrors these as `light-dark(<light>, <dark>)` pairs; contrast.test.ts
 * checks the contrast rules against these values and that the CSS still matches them.
 * Spec: docs/design-system.md §2. Lightness was tuned (hue kept) until contrast.test.ts passed.
 */
export type ThemeName = "light" | "dark";
type Pair = { readonly light: string; readonly dark: string };

export const colorTokens = {
  // §2.1 Neutrals ("graphite")
  bg: { light: "oklch(0.985 0.002 270)", dark: "oklch(0.145 0.006 270)" },
  "bg-elevated": { light: "oklch(1 0 0)", dark: "oklch(0.19 0.007 270)" },
  "bg-sunken": { light: "oklch(0.96 0.003 270)", dark: "oklch(0.12 0.005 270)" },
  fg: { light: "oklch(0.2 0.01 270)", dark: "oklch(0.97 0.003 270)" },
  "fg-muted": { light: "oklch(0.47 0.012 270)", dark: "oklch(0.72 0.01 270)" },
  "fg-subtle": { light: "oklch(0.6 0.01 270)", dark: "oklch(0.58 0.01 270)" },
  border: { light: "oklch(0.2 0.01 270 / 0.1)", dark: "oklch(1 0 0 / 0.1)" },
  "border-strong": { light: "oklch(0.2 0.01 270 / 0.47)", dark: "oklch(1 0 0 / 0.36)" },

  // §2.2 Brand and semantic (fills and icons)
  accent: { light: "oklch(0.55 0.22 280)", dark: "oklch(0.68 0.19 280)" },
  "accent-fg": { light: "oklch(0.99 0 0)", dark: "oklch(0.15 0.02 280)" },
  live: { light: "oklch(0.64 0.21 32)", dark: "oklch(0.72 0.18 35)" },
  verified: { light: "oklch(0.6 0.16 155)", dark: "oklch(0.75 0.16 155)" },
  warning: { light: "oklch(0.75 0.16 75)", dark: "oklch(0.82 0.15 80)" },
  danger: { light: "oklch(0.58 0.22 25)", dark: "oklch(0.7 0.19 25)" },
  prize: { light: "oklch(0.8 0.15 85)", dark: "oklch(0.85 0.14 88)" },

  // Semantic text (same hue, darker in light / lighter in dark)
  "live-text": { light: "oklch(0.5 0.21 32)", dark: "oklch(0.8 0.18 35)" },
  "verified-text": { light: "oklch(0.5 0.16 155)", dark: "oklch(0.8 0.16 155)" },
  "warning-text": { light: "oklch(0.5 0.16 75)", dark: "oklch(0.8 0.15 80)" },
  "danger-text": { light: "oklch(0.5 0.22 25)", dark: "oklch(0.8 0.19 25)" },
  "prize-text": { light: "oklch(0.5 0.15 85)", dark: "oklch(0.8 0.14 88)" },

  // §2.3 Entry palette (chart marks)
  "entry-1": { light: "oklch(0.58 0.17 280)", dark: "oklch(0.68 0.17 280)" },
  "entry-2": { light: "oklch(0.58 0.16 35)", dark: "oklch(0.72 0.16 35)" },
  "entry-3": { light: "oklch(0.58 0.14 155)", dark: "oklch(0.72 0.14 155)" },
  "entry-4": { light: "oklch(0.58 0.14 85)", dark: "oklch(0.78 0.14 85)" },
  "entry-5": { light: "oklch(0.58 0.15 220)", dark: "oklch(0.68 0.15 220)" },
  "entry-6": { light: "oklch(0.58 0.18 330)", dark: "oklch(0.68 0.18 330)" },
  "entry-7": { light: "oklch(0.58 0.12 120)", dark: "oklch(0.74 0.12 120)" },
  "entry-8": { light: "oklch(0.58 0.12 250)", dark: "oklch(0.66 0.12 250)" },
  "entry-other": { light: "oklch(0.58 0.01 270)", dark: "oklch(0.6 0.01 270)" },
} as const satisfies Record<string, Pair>;

export type ColorToken = keyof typeof colorTokens;
export const colorTokenNames = Object.keys(colorTokens) as ColorToken[];

export const entryColorTokens = [
  "entry-1",
  "entry-2",
  "entry-3",
  "entry-4",
  "entry-5",
  "entry-6",
  "entry-7",
  "entry-8",
] as const satisfies readonly ColorToken[];

/** Radii (§4). Mirrored in globals.css `--radius-*`. */
export const radiusTokens = {
  xs: "0.375rem",
  sm: "0.625rem",
  md: "0.875rem",
  lg: "1.375rem",
  xl: "2rem",
} as const;

/** Type tokens (§3) — names of the `text-<token>` utilities in globals.css. */
export const typeTokens = [
  { name: "display-xl", spec: "clamp(3rem, 7vw, 5.5rem) / 1.0 / -0.035em / 650", use: "Landing hero, winner reveal" },
  { name: "display", spec: "clamp(2.25rem, 4.5vw, 3.5rem) / 1.05 / -0.03em / 650", use: "Page titles" },
  { name: "title-1", spec: "28px / 1.15 / -0.02em / 600", use: "Section titles" },
  { name: "title-2", spec: "22px / 1.2 / -0.015em / 600", use: "Card and sheet titles" },
  { name: "title-3", spec: "18px / 1.3 / -0.01em / 600", use: "List headers" },
  { name: "body", spec: "16px / 1.5 / 0 / 400", use: "Body" },
  { name: "callout", spec: "15px / 1.45 / 0 / 450", use: "Buttons, inputs" },
  { name: "footnote", spec: "13px / 1.4 / 0.005em / 450", use: "Captions, meta" },
  { name: "caption", spec: "12px / 1.35 / 0.01em / 500", use: "Badges, labels" },
  { name: "mono", spec: "13px / 1.4 / 0 / 450", use: "Addresses, hashes" },
  { name: "numeric-xl", spec: "clamp(3rem, 8vw, 7rem) / 1.0 / -0.04em / 600", use: "Stage counters, prize" },
] as const;
