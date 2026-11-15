import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cn } from "@/components/ui/cn";
import { contrastRatio, contrastRules, evaluateRule, parseOklch } from "./contrast";
import { colorTokenNames, colorTokens } from "./tokens";

describe("contrast helper", () => {
  it("matches known WCAG ratios", () => {
    expect(contrastRatio("oklch(0 0 0)", "oklch(1 0 0)")).toBeCloseTo(21, 1);
    expect(contrastRatio("oklch(1 0 0)", "oklch(1 0 0)")).toBeCloseTo(1, 5);
  });

  it("composites translucent colours over the backdrop", () => {
    const opaque = contrastRatio("oklch(0 0 0)", "oklch(1 0 0)");
    const half = contrastRatio("oklch(0 0 0 / 0.5)", "oklch(1 0 0)");
    expect(half).toBeGreaterThan(1);
    expect(half).toBeLessThan(opaque);
  });

  it("parses alpha as a number or percentage", () => {
    expect(parseOklch("oklch(0.2 0.01 270 / 0.1)").alpha).toBe(0.1);
    expect(parseOklch("oklch(0.2 0.01 270 / 10%)").alpha).toBe(0.1);
  });
});

describe("design-system §2.2 contrast rules", () => {
  it("covers exactly the pair table", () => {
    // 2 text × 3 bg + 5 *-text × 2 bg + accent-fg + 4 UI parts + 9 entry × 2 bg
    expect(contrastRules).toHaveLength(6 + 10 + 1 + 4 + 18);
    expect(contrastRules.some((r) => r.fg === "fg-subtle")).toBe(false);
  });

  for (const theme of ["light", "dark"] as const) {
    describe(theme, () => {
      it.each(contrastRules.map((r) => [`${r.fg} on ${r.bg} ≥ ${r.min}`, r] as const))("%s", (_, rule) => {
        const result = evaluateRule(rule, theme);
        expect(result.ratio, `${theme}: ${rule.fg} on ${rule.bg} = ${result.ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
          rule.min,
        );
      });
    });
  }
});

describe("globals.css mirrors tokens.ts", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  it.each(colorTokenNames)("--color-%s", (name) => {
    const { light, dark } = colorTokens[name];
    // Declared in @theme and re-declared on [data-theme] (see the comment in globals.css).
    expect(css.split(`--color-${name}: light-dark(${light}, ${dark});`).length - 1).toBe(2);
  });
});

describe("cn keeps type and colour tokens apart", () => {
  it("does not drop a type token next to a colour token", () => {
    expect(cn("text-body text-fg")).toBe("text-body text-fg");
    expect(cn("text-body", "text-callout")).toBe("text-callout");
    expect(cn("text-fg", "text-fg-muted")).toBe("text-fg-muted");
  });
});
