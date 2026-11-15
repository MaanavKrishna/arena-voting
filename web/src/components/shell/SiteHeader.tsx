"use client";

import { Compass, Menu, Plus } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { TestnetBadge } from "@/components/wallet/TestnetBadge";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

export const NAV_LINKS = [
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/create", label: "Create", icon: Plus },
] as const;

/** `/c/1/manage` is not under Explore; `/explore?tab=live` is. */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** True once the page has scrolled under the nav (drives the glass + scroll-edge fade). */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 2);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return scrolled;
}

function DesktopLinks({ pathname }: { pathname: string | null }) {
  return (
    <ul className="hidden items-center gap-1 md:flex">
      {NAV_LINKS.map((l) => {
        const active = isActivePath(pathname, l.href);
        return (
          <li key={l.href} className="relative">
            <Link
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-callout relative z-10 inline-flex h-8 items-center rounded-full px-3 transition-colors",
                active ? "text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {l.label}
            </Link>
            {active ? (
              <motion.span
                layoutId="nav-active"
                transition={spring.smooth}
                aria-hidden
                className="bg-fg/7 absolute inset-0 rounded-full"
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function DesktopLinksWithPath() {
  return <DesktopLinks pathname={usePathname()} />;
}

function MenuLinks({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="bg-fg/4 divide-border squircle divide-y overflow-hidden rounded-md">
      {NAV_LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className="text-body text-fg hover:bg-fg/5 flex h-14 items-center gap-3 px-4 transition-colors"
            >
              <Icon className={cn("size-5", active ? "text-accent" : "text-fg-muted")} strokeWidth={1.75} aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Sticky glass nav. Transparent at the top; glass with a soft bottom fade once content scrolls under. */
export function SiteHeader() {
  const scrolled = useScrolled();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30" data-scrolled={scrolled || undefined}>
      {/* Material layer: no border — a mask fades its lower edge into the content (§5). */}
      <div
        aria-hidden
        className={cn(
          "bg-bg/72 scroll-edge-fade pointer-events-none absolute inset-x-0 top-0 -bottom-4 backdrop-blur-xl backdrop-saturate-150 transition-opacity duration-200",
          scrolled ? "opacity-100" : "opacity-0",
        )}
      />
      <nav
        aria-label="Main"
        className="max-w-content relative mx-auto flex h-14 items-center gap-2 px-4 md:h-16 md:gap-4 md:px-8"
      >
        <Link
          href="/"
          className="text-title-3 text-fg -ml-1 inline-flex h-11 items-center rounded-sm px-1 tracking-tight"
          aria-label="Arena home"
        >
          Arena
        </Link>
        <TestnetBadge />
        <Suspense fallback={<DesktopLinks pathname={null} />}>
          <DesktopLinksWithPath />
        </Suspense>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <ThemeToggle className="hidden md:inline-flex" />
          <ConnectButton />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className="text-fg hover:bg-fg/6 -mr-2 grid size-11 place-items-center rounded-full transition-colors md:hidden"
          >
            <Menu className="size-5" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Menu">
        <div className="flex flex-col gap-5">
          <Suspense fallback={null}>
            <MenuLinks onNavigate={() => setMenuOpen(false)} />
          </Suspense>
          <div className="flex items-center justify-between gap-3 px-1">
            <span className="text-callout text-fg-muted">Appearance</span>
            <ThemeToggle />
          </div>
        </div>
      </Sheet>
    </header>
  );
}
