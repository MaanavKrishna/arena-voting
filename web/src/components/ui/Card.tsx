import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export type CardProps = ComponentProps<"div"> & {
  /** Hover lift + pointer cursor for cards that open something. */
  interactive?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
};

const pad = { none: "", sm: "p-4", md: "p-5 md:p-6", lg: "p-6 md:p-8" } as const;

/** Solid material: elevated surface + hairline + small shadow, continuous corners. */
export function Card({ interactive, padding = "md", className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "solid squircle shadow-sm relative rounded-md",
        pad[padding],
        interactive &&
          "cursor-pointer transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99]",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h3 className="text-title-3 text-fg">{title}</h3>
        {description ? <p className="text-footnote text-fg-muted mt-1">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
