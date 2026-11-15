import type { Metadata } from "next";
import { Suspense } from "react";
import { ExploreSkeleton, ExploreView } from "@/components/explore/ExploreView";

export const metadata: Metadata = {
  title: "Explore contests",
  description: "Browse contests that are live, starting soon or finished.",
};

export default function ExplorePage() {
  return (
    <div className="max-w-content mx-auto w-full px-4 py-10 md:px-8 md:py-14">
      <header className="mb-8 md:mb-10">
        <h1 className="text-display text-fg">Explore</h1>
        <p className="text-body text-fg-muted mt-2 max-w-prose text-pretty">
          Find a contest to vote in, or see how past ones ended.
        </p>
      </header>
      <Suspense fallback={<ExploreSkeleton />}>
        <ExploreView />
      </Suspense>
    </div>
  );
}
