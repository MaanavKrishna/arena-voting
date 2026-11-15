"use client";

import { ArrowLeft, Lock, SearchX } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { LinkButton } from "@/components/landing/LinkButton";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";

export function PageContainer({ children, narrow, className }: { children: ReactNode; narrow?: boolean; className?: string }) {
  return (
    <div className={cn("mx-auto w-full px-4 py-8 md:px-8 md:py-12", narrow ? "max-w-2xl" : "max-w-content", className)}>
      {children}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-footnote text-fg-muted hover:text-fg -ml-1 inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1 transition-colors duration-150"
    >
      <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />
      {children}
    </Link>
  );
}

export function PageSkeleton({ narrow }: { narrow?: boolean }) {
  return (
    <PageContainer narrow={narrow}>
      <div role="status" aria-label="Loading" className="flex flex-col gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-6 h-64 w-full rounded-md" />
      </div>
    </PageContainer>
  );
}

/** A full-page explanation with a way out. */
export function PageNotice({
  contestId,
  icon,
  title,
  description,
  back = true,
  children,
  narrow,
}: {
  contestId?: string;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  back?: boolean;
  children?: ReactNode;
  narrow?: boolean;
}) {
  return (
    <PageContainer narrow={narrow}>
      <Card padding="lg" className="mx-auto max-w-xl">
        <EmptyState
          icon={icon ?? <Lock strokeWidth={1.75} />}
          title={title}
          description={description}
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              {children}
              {back && contestId ? (
                <LinkButton href={`/c/${contestId}`} variant="secondary">
                  Back to the contest
                </LinkButton>
              ) : null}
            </div>
          }
        />
      </Card>
    </PageContainer>
  );
}

export function ContestNotFoundNotice({ onRetry, isError }: { onRetry?: () => void; isError?: boolean }) {
  if (isError && onRetry) {
    return (
      <PageContainer narrow>
        <ErrorState
          title="We couldn't load this contest."
          description="Check your connection and try again."
          onRetry={onRetry}
        />
      </PageContainer>
    );
  }
  return (
    <PageContainer narrow>
      <Card padding="lg" className="mx-auto max-w-xl">
        <EmptyState
          icon={<SearchX strokeWidth={1.75} />}
          title="We couldn't find that contest"
          description="The link may be wrong, or the contest isn't on this network."
          action={
            <LinkButton href="/explore" variant="secondary">
              Browse contests
            </LinkButton>
          }
        />
      </Card>
    </PageContainer>
  );
}
