import { ExploreSkeleton } from "@/components/explore/ExploreView";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="max-w-content mx-auto w-full px-4 py-10 md:px-8 md:py-14">
      <Skeleton className="mb-3 h-10 w-40" />
      <Skeleton className="mb-10 h-5 w-72 max-w-full" />
      <ExploreSkeleton />
    </div>
  );
}
