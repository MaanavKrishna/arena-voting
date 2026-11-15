"use client";

import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { AccountMenu } from "./AccountMenu";
import { useConnectLauncher, type ConnectOptions } from "./ConnectSheet";
import { useNetworkGuard } from "./NetworkGuard";

/** "Connect" when no wallet is connected, the account menu once one is. */
export function ConnectButton({ className, ...opts }: { className?: string } & ConnectOptions) {
  const { state } = useNetworkGuard();
  const { openConnect, sheet } = useConnectLauncher();

  if (state === "checking") {
    return <Skeleton className={cn("h-8 w-24 rounded-full", className)} />;
  }
  if (state === "connect") {
    return (
      <>
        <Button size="sm" className={cn("rounded-full", className)} onClick={() => openConnect(opts)}>
          Connect
        </Button>
        {sheet}
      </>
    );
  }
  return <AccountMenu className={className} />;
}
