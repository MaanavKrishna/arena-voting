import { CloudOff, SearchX } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

/** Page frame shared by every contest-page state, so loading → loaded doesn't jump. */
export function ContestFrame({ children }: { children: ReactNode }) {
  return <div className="max-w-content mx-auto w-full px-4 pt-6 pb-24 md:px-8 md:pt-12">{children}</div>;
}

const linkButton =
  "bg-accent text-accent-fg text-callout hover:bg-accent/90 inline-flex h-10 items-center rounded-sm px-4 shadow-sm transition-[background-color,transform] duration-150 active:scale-[0.97]";

export function ContestNotFound() {
  return (
    <ContestFrame>
      <EmptyState
        className="py-24"
        icon={<SearchX strokeWidth={1.75} aria-hidden />}
        title="We couldn't find that contest"
        description="The link may be mistyped, or the contest lives on a different network."
        action={
          <Link href="/explore" className={linkButton}>
            Explore contests
          </Link>
        }
      />
    </ContestFrame>
  );
}

export function NotDeployed({ chainName }: { chainName: string }) {
  return (
    <ContestFrame>
      <EmptyState
        className="py-24"
        icon={<CloudOff strokeWidth={1.75} aria-hidden />}
        title={`Arena isn't on ${chainName} yet`}
        description="The contest contract hasn't been set up on this network, so there's nothing to show. Check back soon."
      />
    </ContestFrame>
  );
}

/** Mirrors the loaded layout: header, results card, gallery. */
export function ContestSkeleton() {
  return (
    <ContestFrame>
      <div role="status" aria-label="Loading contest" className="flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="h-12 w-3/4 max-w-xl rounded-sm" />
          <Skeleton className="h-4 w-full max-w-md" />
          <div className="border-border mt-2 grid grid-cols-2 gap-5 border-y py-5 sm:flex sm:gap-10">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10">
          <div className="solid squircle rounded-lg p-6 lg:col-start-2">
            <Skeleton className="mx-auto aspect-2/1 w-full max-w-md rounded-t-full" />
            <div className="mt-6 flex flex-col gap-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
          <div className="grid-gallery lg:col-start-1 lg:row-start-1">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    </ContestFrame>
  );
}
