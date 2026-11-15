import { Compass } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";

export default function NotFound() {
  return (
    <div className="max-w-content mx-auto flex w-full flex-1 flex-col items-center justify-center px-4 py-16 md:px-8">
      <EmptyState
        icon={<Compass strokeWidth={1.75} aria-hidden />}
        title="We couldn't find that page."
        description="The link may be mistyped, or the contest may live on a different network."
        action={
          <Link
            href="/explore"
            className="bg-accent text-accent-fg text-callout hover:bg-accent/90 inline-flex h-11 items-center rounded-full px-5 shadow-sm transition-[background-color,transform] duration-150 active:scale-[0.97]"
          >
            Explore contests
          </Link>
        }
      />
    </div>
  );
}
