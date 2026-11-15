"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

/** Says what happened and what to do next; never shows a raw error string. */
export function ErrorState({
  title = "Something went wrong.",
  description = "Check your connection and try again.",
  onRetry,
  retrying,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <div className="bg-danger/10 text-danger-text mb-4 grid size-12 place-items-center rounded-full">
        <TriangleAlert className="size-6" strokeWidth={1.75} aria-hidden />
      </div>
      <h3 className="text-title-3 text-fg">{title}</h3>
      {description ? <p className="text-callout text-fg-muted mt-1.5 max-w-xs text-pretty">{description}</p> : null}
      {onRetry ? (
        <Button
          variant="secondary"
          className="mt-5"
          onClick={onRetry}
          loading={retrying}
          icon={<RotateCw className="size-4" strokeWidth={1.75} aria-hidden />}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}
