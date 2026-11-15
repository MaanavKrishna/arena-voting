import { isTestnet } from "@/config/network";
import { cn } from "@/lib/cn";

/** Persistent "Testnet" marker while only test networks are configured. Renders nothing otherwise. */
export function TestnetBadge({ className }: { className?: string }) {
  if (!isTestnet) return null;
  return (
    <span
      title="Free test ETH, no real money"
      className={cn(
        "text-caption text-fg-muted bg-fg/6 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 whitespace-nowrap",
        className,
      )}
    >
      <span aria-hidden className="bg-warning size-1.5 rounded-full" />
      Testnet
      <span className="sr-only">: free test ETH, no real money</span>
    </span>
  );
}
