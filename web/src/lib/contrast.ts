/**
 * OKLCH → sRGB → WCAG 2.x contrast. Shared by contrast.test.ts and /system so the
 * numbers on the page are the numbers the test enforces.
 */
import { colorTokens, type ColorToken, type ThemeName } from "./tokens";

export type Oklch = { l: number; c: number; h: number; alpha: number };
export type Rgb = [number, number, number];

const OKLCH_RE =
  /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/;

export function parseOklch(value: string): Oklch {
  const m = OKLCH_RE.exec(value.trim());
  if (!m) throw new Error(`Not an oklch() colour: ${value}`);
  const a = m[4];
  const alpha = a === undefined ? 1 : a.endsWith("%") ? Number(a.slice(0, -1)) / 100 : Number(a);
  return { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]), alpha };
}

/** OKLCH → linear sRGB (unclamped). */
export function oklchToLinearSrgb({ l, c, h }: Oklch): Rgb {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** OKLCH → gamma-encoded sRGB in 0..1, clipped to gamut. */
export function oklchToSrgb(color: Oklch): Rgb {
  const [r, g, b] = oklchToLinearSrgb(color);
  return [encode(clamp01(r)), encode(clamp01(g)), encode(clamp01(b))];
}

/** Composite a (possibly translucent) colour over an opaque backdrop, like the browser does. */
export function composite(fg: Oklch, backdrop: Oklch): Rgb {
  const top = oklchToSrgb(fg);
  const base = oklchToSrgb(backdrop);
  const a = fg.alpha;
  return [0, 1, 2].map((i) => top[i]! * a + base[i]! * (1 - a)) as Rgb;
}

export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * decode(r) + 0.7152 * decode(g) + 0.0722 * decode(b);
}

/** WCAG contrast ratio of `fg` drawn on `bg` (both oklch() strings; fg may be translucent). */
export function contrastRatio(fg: string, bg: string): number {
  const back = parseOklch(bg);
  const lb = relativeLuminance(oklchToSrgb(back));
  const lf = relativeLuminance(composite(parseOklch(fg), back));
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastRule = { fg: ColorToken; bg: ColorToken; min: number; label: string };

const textTokens = ["live-text", "verified-text", "warning-text", "danger-text", "prize-text"] as const;
const entryTokens = [
  "entry-1",
  "entry-2",
  "entry-3",
  "entry-4",
  "entry-5",
  "entry-6",
  "entry-7",
  "entry-8",
  "entry-other",
] as const;

/** Exactly the pair table in docs/design-system.md §2.2. `fg-subtle` is exempt. */
export const contrastRules: readonly ContrastRule[] = [
  ...(["fg", "fg-muted"] as const).flatMap((fg) =>
    (["bg", "bg-elevated", "bg-sunken"] as const).map((bg) => ({ fg, bg, min: 4.5, label: "Text" })),
  ),
  ...textTokens.flatMap((fg) =>
    (["bg", "bg-elevated"] as const).map((bg) => ({ fg, bg, min: 4.5, label: "Semantic text" })),
  ),
  { fg: "accent-fg", bg: "accent", min: 4.5, label: "Text on accent" },
  ...(["accent", "danger", "verified", "border-strong"] as const).map((fg) => ({
    fg,
    bg: "bg" as const,
    min: 3,
    label: "UI part",
  })),
  ...entryTokens.flatMap((fg) =>
    (["bg", "bg-elevated"] as const).map((bg) => ({ fg, bg, min: 3, label: "Chart mark" })),
  ),
];

export type ContrastResult = ContrastRule & { theme: ThemeName; ratio: number; pass: boolean };

export function evaluateRule(rule: ContrastRule, theme: ThemeName): ContrastResult {
  const ratio = contrastRatio(colorTokens[rule.fg][theme], colorTokens[rule.bg][theme]);
  return { ...rule, theme, ratio, pass: ratio >= rule.min };
}

export function evaluateAll(theme: ThemeName): ContrastResult[] {
  return contrastRules.map((r) => evaluateRule(r, theme));
}
