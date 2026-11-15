import type { ReactNode } from "react";
import { cn } from "./cn";

/** Layout only (§7): 1 column on phone, 3 on desktop; items may span. */
export function BentoGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-3 md:gap-6", className)}>{children}</div>;
}

export function BentoItem({
  title,
  description,
  eyebrow,
  visual,
  span = 1,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  visual?: ReactNode;
  span?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "solid squircle shadow-sm group relative flex flex-col overflow-hidden rounded-lg p-6",
        "transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md",
        span === 2 && "md:col-span-2",
        span === 3 && "md:col-span-3",
        className,
      )}
    >
      {visual ? <div className="mb-6 flex min-h-28 flex-1 items-center justify-center">{visual}</div> : null}
      <div className="mt-auto">
        {eyebrow ? <p className="text-caption-caps text-fg-muted mb-2">{eyebrow}</p> : null}
        <h3 className="text-title-3 text-fg">{title}</h3>
        {description ? <p className="text-callout text-fg-muted mt-1 text-pretty">{description}</p> : null}
      </div>
    </div>
  );
}
