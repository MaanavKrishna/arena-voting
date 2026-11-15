import { Check, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { evaluateAll, type ContrastResult } from "@/lib/contrast";
import { colorTokens, type ColorToken, type ThemeName } from "@/lib/tokens";
import { Section } from "./Section";

const groups: { title: string; tokens: ColorToken[] }[] = [
  {
    title: "Neutrals",
    tokens: ["bg", "bg-elevated", "bg-sunken", "fg", "fg-muted", "fg-subtle", "border", "border-strong"],
  },
  { title: "Brand and semantic", tokens: ["accent", "accent-fg", "live", "verified", "warning", "danger", "prize"] },
  { title: "Semantic text", tokens: ["live-text", "verified-text", "warning-text", "danger-text", "prize-text"] },
  {
    title: "Entry palette",
    tokens: ["entry-1", "entry-2", "entry-3", "entry-4", "entry-5", "entry-6", "entry-7", "entry-8", "entry-other"],
  },
];

const results: Record<ThemeName, ContrastResult[]> = { light: evaluateAll("light"), dark: evaluateAll("dark") };

function Swatch({ token, theme }: { token: ColorToken; theme: ThemeName }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className="ring-border squircle size-10 shrink-0 rounded-sm ring-1 ring-inset"
        style={{ backgroundColor: `var(--color-${token})` }}
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-footnote text-fg truncate">{token}</span>
        <span className="text-caption text-fg-muted truncate font-mono">{colorTokens[token][theme]}</span>
      </span>
    </div>
  );
}

function ThemePanel({ theme }: { theme: ThemeName }) {
  const failed = results[theme].filter((r) => !r.pass).length;
  return (
    <div data-theme={theme} className="bg-bg border-border squircle rounded-lg border p-5 md:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-title-3 text-fg capitalize">{theme}</h3>
        <span className={cn("text-caption", failed ? "text-danger-text" : "text-verified-text")}>
          {failed ? `${failed} pairs fail` : `All ${results[theme].length} pairs pass`}
        </span>
      </div>
      <div className="flex flex-col gap-6">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="text-caption-caps text-fg-muted mb-3">{g.title}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {g.tokens.map((t) => (
                <Swatch key={t} token={t} theme={theme} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RatioCell({ result }: { result: ContrastResult }) {
  return (
    <td className="py-1.5 pr-3">
      <div data-theme={result.theme} className="flex items-center gap-2.5">
        <span
          className="text-caption ring-border grid h-6 w-9 shrink-0 place-items-center rounded-xs ring-1 ring-inset"
          style={{
            backgroundColor: `var(--color-${result.bg})`,
            color: `var(--color-${result.fg})`,
          }}
        >
          {result.min >= 4.5 ? "Aa" : "●"}
        </span>
      </div>
    </td>
  );
}

function Verdict({ result }: { result: ContrastResult }) {
  return (
    <td className="py-1.5 pr-4">
      <span
        className={cn(
          "text-caption tabular inline-flex h-6 items-center gap-1 rounded-full px-2",
          result.pass ? "bg-verified/14 text-verified-text" : "bg-danger text-accent-fg",
        )}
      >
        {result.pass ? (
          <Check aria-hidden className="size-3" strokeWidth={3} />
        ) : (
          <X aria-hidden className="size-3" strokeWidth={3} />
        )}
        {result.ratio.toFixed(2)}
        <span className="sr-only">{result.pass ? "passes" : "fails"}</span>
      </span>
    </td>
  );
}

export function ColorSection() {
  const rows = results.light.map((l, i) => ({ light: l, dark: results.dark[i]! }));
  const groupedRows = Object.entries(
    rows.reduce<Record<string, typeof rows>>((acc, r) => {
      (acc[r.light.label] ??= []).push(r);
      return acc;
    }, {}),
  );
  return (
    <Section
      id="colour"
      index="01"
      title="Colour"
      description="OKLCH throughout. Both themes shown side by side; every ratio below is measured live by the same helper contrast.test.ts uses."
    >
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <ThemePanel theme="light" />
        <ThemePanel theme="dark" />
      </div>

      <div className="solid squircle mt-6 overflow-hidden rounded-lg">
        <div className="border-border flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
          <h3 className="text-title-3 text-fg">Contrast rules</h3>
          <p className="text-footnote text-fg-muted">design-system.md §2.2 · fg-subtle exempt</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-xl border-collapse text-left">
            <thead>
              <tr className="text-caption-caps text-fg-muted border-border border-b">
                <th scope="col" className="py-3 pr-3 pl-5 font-medium">
                  Pair
                </th>
                <th scope="col" className="py-3 pr-3 font-medium">
                  Min
                </th>
                <th scope="col" colSpan={2} className="py-3 pr-3 font-medium">
                  Light
                </th>
                <th scope="col" colSpan={2} className="py-3 pr-4 font-medium">
                  Dark
                </th>
              </tr>
            </thead>
            {groupedRows.map(([label, group]) => (
              <tbody key={label}>
                <tr>
                  <th scope="colgroup" colSpan={6} className="text-caption-caps text-fg-muted bg-fg/3 py-2 pl-5 text-left font-medium">
                    {label}
                  </th>
                </tr>
                {group.map(({ light, dark }) => (
                  <tr key={`${light.fg}-${light.bg}`} className="border-border border-t">
                    <th scope="row" className="py-1.5 pr-3 pl-5 font-normal">
                      <span className="text-footnote text-fg">{light.fg}</span>
                      <span className="text-footnote text-fg-muted"> on {light.bg}</span>
                    </th>
                    <td className="text-footnote text-fg-muted tabular py-1.5 pr-3">{light.min.toFixed(1)}</td>
                    <RatioCell result={light} />
                    <Verdict result={light} />
                    <RatioCell result={dark} />
                    <Verdict result={dark} />
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </div>
    </Section>
  );
}
