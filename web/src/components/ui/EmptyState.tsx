import type { ReactNode } from "react";
import { cn } from "./cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon ? (
        <div className="bg-fg/5 text-fg-muted mb-4 grid size-12 place-items-center rounded-full [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <h3 className="text-title-3 text-fg">{title}</h3>
      {description ? <p className="text-callout text-fg-muted mt-1.5 max-w-xs text-pretty">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
