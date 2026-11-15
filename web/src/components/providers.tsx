"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { ThemeProvider, ThemeScript } from "@/components/ui/theme";
import { ToastProvider, Toaster } from "@/components/ui/Toast";

/**
 * App-wide client providers.
 * Wallet slot (Task 9): WagmiProvider (with cookie `initialState` from the layout) and
 * QueryClientProvider wrap everything inside ThemeProvider, around <MotionConfig>.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ThemeScript />
      {/* WALLET PROVIDERS GO HERE */}
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          {children}
          <Toaster />
        </ToastProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
