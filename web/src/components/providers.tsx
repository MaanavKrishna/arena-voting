"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { ThemeProvider, ThemeScript } from "@/components/ui/theme";
import { ToastProvider, Toaster } from "@/components/ui/Toast";
import { WalletProviders } from "@/components/wallet/WalletProviders";

/**
 * App-wide client providers.
 * Wallet state is restored on the client (wagmi cookie storage + reconnect) rather than via a
 * server `initialState`, so pages stay statically renderable under Cache Components (D-27).
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ThemeScript />
      <WalletProviders>
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            {children}
            <Toaster />
          </ToastProvider>
        </MotionConfig>
      </WalletProviders>
    </ThemeProvider>
  );
}
