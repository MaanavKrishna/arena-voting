import { cn } from "./cn";

/** Loading placeholder with a soft shimmer (static under reduced motion). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("bg-fg/7 relative block overflow-hidden rounded-xs", className)}
    >
      <span className="animate-shimmer via-fg/5 absolute inset-0 bg-linear-to-r from-transparent to-transparent" />
    </span>
  );
}

/** A card-shaped skeleton matching EntryCard/ContestCard proportions. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("solid squircle rounded-md p-3", className)}>
      <Skeleton className="aspect-4/3 w-full rounded-sm" />
      <div className="flex flex-col gap-2 px-1 pt-4 pb-1">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
