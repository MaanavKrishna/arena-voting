import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="max-w-content mx-auto flex w-full flex-col gap-8 px-4 pt-8 pb-16 md:px-8 md:pt-12"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-2/3 max-w-md rounded-sm" />
        <Skeleton className="h-4 w-1/2 max-w-sm" />
      </div>
      <div className="grid-gallery">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
