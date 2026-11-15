import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export function Section({
  id,
  index,
  title,
  description,
  children,
  className,
}: {
  id: string;
  index: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24 py-14 md:py-20", className)}>
      <header className="mb-8 max-w-prose md:mb-10">
        <p className="text-caption-caps text-fg-muted tabular mb-2">{index}</p>
        <h2 id={`${id}-title`} className="text-title-1 text-fg">
          {title}
        </h2>
        {description ? <p className="text-body text-fg-muted mt-2 text-pretty">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function Demo({
  title,
  note,
  children,
  className,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("solid squircle flex flex-col rounded-md", className)}>
      <div className="border-border flex items-baseline justify-between gap-3 border-b px-5 py-3">
        <h3 className="text-footnote text-fg">{title}</h3>
        {note ? <span className="text-caption text-fg-muted text-right">{note}</span> : null}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">{children}</div>
    </div>
  );
}

export function StateLabel({ children }: { children: ReactNode }) {
  return <span className="text-caption text-fg-muted">{children}</span>;
}
