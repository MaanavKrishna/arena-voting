import Link from "next/link";
import { Skeleton } from "@/components/ui/Skeleton";

/** Loading frame in the projector layout (server-safe, used as the page's Suspense fallback). */
export function StageSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col gap-6 px-5 py-5 md:px-10 md:py-8 lg:h-dvh lg:min-h-0" aria-busy="true" aria-label="Loading the stage">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-12 w-2/3 max-w-3xl" />
      </div>
      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-12">
        <Skeleton className="min-h-80 rounded-xl lg:col-span-7" />
        <Skeleton className="min-h-80 rounded-xl lg:col-span-5" />
      </div>
      <Skeleton className="h-28 rounded-xl" />
    </div>
  );
}

export function StageEmpty({ title }: { title: string }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <p className="text-display text-fg">{title}</p>
        <Link href="/explore" className="text-callout text-accent underline-offset-4 hover:underline">
          Browse contests
        </Link>
      </div>
    </div>
  );
}

export function StageError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <p className="text-display text-fg">Can&apos;t reach the network.</p>
        <p className="text-body text-fg-muted">The stage will keep working once the connection is back.</p>
        <button type="button" onClick={onRetry} className="text-callout text-accent h-11 underline-offset-4 hover:underline">
          Try again
        </button>
      </div>
    </div>
  );
}
