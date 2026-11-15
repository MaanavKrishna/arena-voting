import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";

/** One tile of the control room: icon, title, a one-line purpose, then the controls. */
export function ControlCard({
  id,
  icon,
  title,
  description,
  action,
  span = 1,
  className,
  children,
}: {
  id?: string;
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  span?: 1 | 2 | 3;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card
      id={id}
      padding="md"
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn(
        "flex min-w-0 scroll-mt-24 flex-col gap-5",
        span === 2 && "md:col-span-2",
        span === 3 && "md:col-span-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <span className="bg-accent/10 text-accent mt-0.5 grid size-9 shrink-0 place-items-center rounded-full [&_svg]:size-5">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 id={id ? `${id}-title` : undefined} className="text-title-3 text-fg">
              {title}
            </h2>
            {description ? <p className="text-footnote text-fg-muted mt-0.5 text-pretty">{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** Plain explanation inside a card (locked states, "nothing yet"). */
export function Note({ tone = "neutral", children }: { tone?: "neutral" | "warning"; children: ReactNode }) {
  return (
    <p
      className={cn(
        "text-footnote rounded-sm px-3 py-2.5 text-pretty",
        tone === "warning" ? "bg-warning/14 text-warning-text" : "bg-fg/5 text-fg-muted",
      )}
    >
      {children}
    </p>
  );
}
