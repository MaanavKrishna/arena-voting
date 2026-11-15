import type { ReactNode } from "react";
import { ConnectSheetProvider } from "@/components/wallet/ConnectSheet";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/**
 * App chrome for every product page (not Stage/Gate): skip link, sticky glass nav (logo, Explore,
 * Create, Testnet badge, theme, Connect/account), wrong-network notice, main, footer.
 * Pages render inside `<main id="main">`; full-bleed heroes can sit under the transparent nav
 * with a negative top margin (`-mt-14 md:-mt-16`).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ConnectSheetProvider>
      <a
        href="#main"
        className="bg-accent text-accent-fg text-callout sr-only z-50 rounded-full px-4 py-2 shadow-md focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        <NetworkGuard />
        <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
          {children}
        </main>
        <SiteFooter />
      </div>
    </ConnectSheetProvider>
  );
}
