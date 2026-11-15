import { ArrowRight, Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Aurora } from "@/components/fx/hero/Aurora";
import { LinkButton } from "@/components/landing/LinkButton";

export const metadata: Metadata = { title: "Page not found" };

/** Root not-found: any URL outside the app's routes. Self-contained (no app shell at this level). */
export default function RootNotFound() {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      <Aurora intensity={0.16} className="[mask-image:linear-gradient(to_bottom,black_50%,transparent)]" />
      <header className="max-w-content mx-auto w-full px-4 pt-3 md:px-8">
        <Link href="/" aria-label="Arena home" className="text-title-3 text-fg -ml-1 inline-flex h-11 items-center rounded-sm px-1 tracking-tight">
          Arena
        </Link>
      </header>
      <main id="main" className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <p className="text-caption-caps text-fg-muted mb-4">Error 404</p>
        <h1 className="text-display-xl text-fg">Lost the room</h1>
        <p className="text-title-3 text-fg-muted mt-4 text-balance">
          There&apos;s nothing at this address. The link may be mistyped, or the page may have moved.
        </p>
        <div className="mt-10 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row">
          <LinkButton href="/" iconAfter={<ArrowRight className="size-5" strokeWidth={1.75} aria-hidden />}>
            Back to home
          </LinkButton>
          <LinkButton href="/explore" variant="secondary" icon={<Compass className="size-5" strokeWidth={1.75} aria-hidden />}>
            Explore contests
          </LinkButton>
        </div>
      </main>
    </div>
  );
}
