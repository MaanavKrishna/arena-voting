import { ConnectSheetProvider } from "@/components/wallet/ConnectSheet";

/**
 * Kiosk pages (Stage projector, Gate): no app chrome, always dark, full-bleed. The colour tokens are
 * re-declared on any `[data-theme]` element, so this subtree is dark whatever the visitor's theme.
 */
export default function KioskLayout({ children }: LayoutProps<"/">) {
  return (
    <ConnectSheetProvider>
      <div data-theme="dark" className="bg-bg text-fg relative isolate flex min-h-dvh flex-col overflow-hidden">
        {children}
      </div>
    </ConnectSheetProvider>
  );
}
