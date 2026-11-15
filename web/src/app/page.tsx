import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Aurora } from "@/components/fx/hero/Aurora";
import { Spotlight } from "@/components/fx/hero/Spotlight";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function Home() {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      <Aurora />
      <Spotlight />
      <header className="relative z-10">
        <div className="max-w-content mx-auto flex h-16 items-center justify-between px-4 md:px-8">
          <span className="text-title-3 text-fg">Arena</span>
          <ThemeToggle />
        </div>
      </header>
      <main className="relative z-10 mx-auto flex w-full max-w-content flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <p className="text-caption-caps text-fg-muted mb-6">Ethereum contests · Testnet preview</p>
        <h1 className="text-display-xl text-fg">Arena</h1>
        <p className="text-title-3 text-fg-muted mt-5 max-w-md text-balance">
          Contests decided by the people in the room.
        </p>
        <Link
          href="/system"
          className="bg-accent text-accent-fg text-body shadow-md hover:bg-accent/90 mt-10 inline-flex h-12 items-center gap-2 rounded-full px-6 transition-[background-color,transform] duration-150 active:scale-[0.97]"
        >
          See the design system
          <ArrowRight className="size-5" strokeWidth={1.75} aria-hidden />
        </Link>
      </main>
    </div>
  );
}
