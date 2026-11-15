"use client";

import { ErrorState } from "@/components/ui/ErrorState";

/** Route-level fallback. Never shows the raw error; offers a retry of this segment. */
export default function RouteError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="max-w-content mx-auto flex w-full flex-1 flex-col items-center justify-center px-4 py-16 md:px-8">
      <ErrorState
        title="This page didn't load."
        description="Check your connection and try again. Nothing you did was lost."
        onRetry={retry}
      />
    </div>
  );
}
