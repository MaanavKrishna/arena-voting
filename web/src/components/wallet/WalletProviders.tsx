"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type State } from "wagmi";
import { getConfig } from "@/config/wagmi";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false } },
  });
}

/**
 * Wagmi + React Query for everything that touches the wallet or the chain.
 * Pass `initialState` from `cookieToInitialState(getConfig(), (await headers()).get("cookie"))`
 * so the connected account doesn't flash on first paint.
 */
export function WalletProviders({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: State;
}) {
  const [config] = useState(() => getConfig());
  const [queryClient] = useState(makeQueryClient);
  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
