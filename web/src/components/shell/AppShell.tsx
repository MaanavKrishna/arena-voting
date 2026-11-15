import type { ReactNode } from "react";

/**
 * App chrome for every product page (not Stage/Gate): glass nav with logo, Explore, Create,
 * testnet badge, theme toggle and account/connect; main content area; footer.
 * STUB: the shell/wallet agent replaces this.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return <main className="min-h-dvh">{children}</main>;
}
