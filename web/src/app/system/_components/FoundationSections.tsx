import { cn } from "@/components/ui/cn";
import { typeTokens } from "@/lib/tokens";
import { Section } from "./Section";

// Literal class names so Tailwind sees them.
const typeClass: Record<(typeof typeTokens)[number]["name"], string> = {
  "display-xl": "text-display-xl",
  display: "text-display",
  "title-1": "text-title-1",
  "title-2": "text-title-2",
  "title-3": "text-title-3",
  body: "text-body",
  callout: "text-callout",
  footnote: "text-footnote",
  caption: "text-caption",
  mono: "text-mono",
  "numeric-xl": "text-numeric-xl",
};

const sample: Record<string, string> = {
  "display-xl": "Arena",
  display: "Demo Night",
  "numeric-xl": "1,284",
  mono: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
};

export function TypeSection() {
  return (
    <Section
      id="type"
      index="02"
      title="Typography"
      description="Geist Sans and Geist Mono. Each token carries size, leading, tracking and weight together, tightening as size grows."
    >
      <div className="solid squircle divide-border divide-y overflow-hidden rounded-lg">
        {typeTokens.map((t) => (
          <div key={t.name} className="grid gap-2 px-5 py-5 md:grid-cols-[12rem_1fr] md:gap-8 md:px-6">
            <div className="flex flex-col gap-0.5">
              <span className="text-footnote text-fg">text-{t.name}</span>
              <span className="text-caption text-fg-muted tabular">{t.spec}</span>
              <span className="text-caption text-fg-muted">{t.use}</span>
            </div>
            <p className={cn(typeClass[t.name], "text-fg min-w-0 truncate")}>
              {sample[t.name] ?? "Decided by the people in the room"}
            </p>
          </div>
        ))}
        <div className="px-5 py-5 md:px-6">
          <span className="text-caption-caps text-fg-muted">Caption, uppercase · +0.06em tracking</span>
        </div>
      </div>
    </Section>
  );
}

const spacing = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24];
const radii = [
  { name: "xs", cls: "rounded-xs", px: "6px", use: "Chips" },
  { name: "sm", cls: "rounded-sm", px: "10px", use: "Inputs, buttons" },
  { name: "md", cls: "rounded-md", px: "14px", use: "Cards" },
  { name: "lg", cls: "rounded-lg", px: "22px", use: "Sheets, modals" },
  { name: "xl", cls: "rounded-xl", px: "32px", use: "Hero panels" },
  { name: "full", cls: "rounded-full", px: "∞", use: "Pills, avatars" },
];

export function LayoutSection() {
  return (
    <Section
      id="space"
      index="03"
      title="Space and radius"
      description="A 4-point scale in rem, so larger browser text scales the layout. Continuous corners where the browser supports corner-shape."
    >
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <div className="solid squircle rounded-lg p-5 md:p-6">
          <p className="text-caption-caps text-fg-muted mb-4">Spacing</p>
          <div className="flex flex-col gap-2.5">
            {spacing.map((n) => (
              <div key={n} className="flex items-center gap-4">
                <span className="text-caption text-fg-muted tabular w-8 text-right">{n}</span>
                <span
                  className="bg-accent/70 h-3 rounded-full"
                  style={{ width: `calc(var(--spacing) * ${n})` }}
                />
                <span className="text-caption text-fg-muted tabular">{n * 4}px</span>
              </div>
            ))}
          </div>
        </div>
        <div className="solid squircle rounded-lg p-5 md:p-6">
          <p className="text-caption-caps text-fg-muted mb-4">Radius</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {radii.map((r) => (
              <div key={r.name} className="flex flex-col gap-2">
                <div className={cn("bg-accent/12 border-accent/40 aspect-square w-full border", r.cls)} />
                <div className="flex flex-col">
                  <span className="text-footnote text-fg">
                    {r.name} <span className="text-fg-muted tabular">{r.px}</span>
                  </span>
                  <span className="text-caption text-fg-muted">{r.use}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

const materials = [
  { cls: "glass-thin", name: "glass-thin", recipe: "55% · blur 12 · sat 170%", use: "Chips over content" },
  { cls: "glass", name: "glass", recipe: "70% · blur 20 · sat 180%", use: "Nav bar, action bar" },
  { cls: "glass-thick", name: "glass-thick", recipe: "82% · blur 32 · sat 190%", use: "Sheets, popovers" },
  { cls: "solid", name: "solid", recipe: "bg-elevated + hairline", use: "Cards, forms" },
];

/** A deliberately busy backdrop made from tokens: entry-colour bands, a mesh and large type. */
function BusyBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(40% 70% at 12% 25%, var(--color-entry-1), transparent)",
            "radial-gradient(35% 60% at 88% 15%, var(--color-entry-2), transparent)",
            "radial-gradient(45% 70% at 62% 95%, var(--color-entry-3), transparent)",
            "radial-gradient(30% 50% at 38% 70%, var(--color-entry-6), transparent)",
            "radial-gradient(30% 50% at 80% 60%, var(--color-entry-4), transparent)",
            "linear-gradient(var(--color-bg-sunken), var(--color-bg-sunken))",
          ].join(", "),
        }}
      />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(115deg, var(--color-fg) 0 1px, transparent 1px 1.5rem), repeating-linear-gradient(25deg, var(--color-fg) 0 1px, transparent 1px 1.5rem)",
        }}
      />
      <div className="text-display-xl text-fg/30 absolute inset-0 flex flex-col justify-center gap-4 overflow-hidden whitespace-nowrap select-none">
        <span>Arena · Vote · Live · Arena</span>
        <span className="-translate-x-1/6">Prize · Room · Stage · Prize</span>
      </div>
    </div>
  );
}

export function MaterialsSection() {
  return (
    <Section
      id="materials"
      index="04"
      title="Materials and depth"
      description="Bigger surfaces get thicker material and deeper shadow. Never glass on glass. With reduced transparency or increased contrast every material turns solid."
    >
      <div className="squircle relative overflow-hidden rounded-xl">
        <BusyBackdrop />
        <div className="relative grid gap-4 p-4 sm:grid-cols-2 md:p-10 lg:grid-cols-4 lg:py-16">
          {materials.map((m) => (
            <div key={m.name} className={cn(m.cls, "squircle flex min-h-40 flex-col justify-end rounded-md p-5")}>
              <p className="text-title-3 text-fg">{m.name}</p>
              <p className="text-footnote text-fg-muted tabular">{m.recipe}</p>
              <p className="text-footnote text-fg-muted">{m.use}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3 md:gap-6">
        {(
          [
            ["shadow-sm", "sm", "Buttons, small cards"],
            ["shadow-md", "md", "Hover, raised cards"],
            ["shadow-lg", "lg", "Sheets, popovers"],
          ] as const
        ).map(([cls, name, use]) => (
          <div key={name} className={cn("bg-bg-elevated squircle flex h-32 flex-col justify-end rounded-md p-5", cls)}>
            <p className="text-callout text-fg">shadow-{name}</p>
            <p className="text-footnote text-fg-muted">{use}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
