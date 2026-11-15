"use client";

import { ArrowLeft, ChevronDown, ChevronRight, Copy, FlaskConical, QrCode, ScanFace, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConnect, useConnectors, type Connector } from "wagmi";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useIsDesktop, useReducedMotionPref } from "@/components/ui/hooks";
import { isTestnet, targetChain } from "@/config/network";
import { cn } from "@/lib/cn";
import { explainError } from "@/lib/errors";
import { fade, spring } from "@/lib/motion";

/* ------------------------------------------------------------------ options (pure) */

export type WalletKind = "test" | "browser" | "walletconnect" | "passkey";

export type WalletOption = {
  connector: Pick<Connector, "id" | "uid" | "name" | "type" | "icon">;
  kind: WalletKind;
  label: string;
  description?: string;
};

type ConnectorLike = WalletOption["connector"];

/**
 * Which wallets the sheet offers, in order. Pure so every combination is testable.
 * - The E2E mock connector shows as "Test wallet".
 * - EIP-6963 wallets (one connector per installed wallet) show with their own name and icon.
 * - The generic `injected` connector only shows when nothing announced itself but a provider exists.
 * - WalletConnect only when its connector is configured; Base Account (Face ID) only when present
 *   and not hidden (Gated contests hide passkey wallets, decision D-13).
 */
export function walletOptions(
  connectors: readonly ConnectorLike[],
  opts: { hidePasskey?: boolean; hasInjectedProvider: boolean },
): WalletOption[] {
  const test: WalletOption[] = [];
  const browser: WalletOption[] = [];
  const remote: WalletOption[] = [];
  const passkey: WalletOption[] = [];
  const announced = connectors.some((c) => c.type === "injected" && c.id !== "injected");
  const seen = new Set<string>();

  for (const c of connectors) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    if (c.type === "mock") {
      test.push({ connector: c, kind: "test", label: "Test wallet", description: "A built-in account for testing" });
    } else if (c.type === "injected") {
      if (c.id === "injected") {
        if (!announced && opts.hasInjectedProvider) {
          browser.push({ connector: c, kind: "browser", label: "Browser wallet", description: "The wallet in this browser" });
        }
      } else {
        browser.push({ connector: c, kind: "browser", label: c.name });
      }
    } else if (c.type === "walletConnect") {
      remote.push({
        connector: c,
        kind: "walletconnect",
        label: "Wallet on your phone",
        description: "Connect any app with WalletConnect",
      });
    } else if (c.type === "baseAccount") {
      if (!opts.hidePasskey) {
        passkey.push({
          connector: c,
          kind: "passkey",
          label: "Create a wallet with Face ID",
          description: "No app to install. Uses a passkey on this device.",
        });
      }
    }
  }
  return [...test, ...browser, ...remote, ...passkey];
}

/* ------------------------------------------------------------------ launcher context */

export type ConnectOptions = { hidePasskey?: boolean };
type ConnectSheetApi = { open: (opts?: ConnectOptions) => void };

const ConnectSheetContext = createContext<ConnectSheetApi | null>(null);

/** One shared Connect sheet for everything inside it (AppShell mounts this). */
export function ConnectSheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean } & ConnectOptions>({ open: false });
  const api = useMemo<ConnectSheetApi>(() => ({ open: (opts) => setState({ open: true, ...opts }) }), []);
  return (
    <ConnectSheetContext.Provider value={api}>
      {children}
      <ConnectSheet
        open={state.open}
        hidePasskey={state.hidePasskey}
        onOpenChange={(open) => setState((s) => ({ ...s, open }))}
      />
    </ConnectSheetContext.Provider>
  );
}

/**
 * Opens the Connect sheet. Inside `ConnectSheetProvider` it uses the shared sheet; outside one
 * (Stage, Gate) it returns a local sheet element that the caller renders.
 */
export function useConnectLauncher(): { openConnect: (opts?: ConnectOptions) => void; sheet: ReactNode } {
  const ctx = useContext(ConnectSheetContext);
  const [local, setLocal] = useState<{ open: boolean } & ConnectOptions>({ open: false });
  const openLocal = useCallback((opts?: ConnectOptions) => setLocal({ open: true, ...opts }), []);
  if (ctx) return { openConnect: ctx.open, sheet: null };
  return {
    openConnect: openLocal,
    sheet: (
      <ConnectSheet
        open={local.open}
        hidePasskey={local.hidePasskey}
        onOpenChange={(open) => setLocal((s) => ({ ...s, open }))}
      />
    ),
  };
}

/* ------------------------------------------------------------------ sheet */

export type ConnectSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hide passkey (Face ID) wallets — Gated contests can't use them for the door pass. */
  hidePasskey?: boolean;
};

function hasInjectedProvider(): boolean {
  return typeof window !== "undefined" && "ethereum" in window && Boolean((window as { ethereum?: unknown }).ethereum);
}

export function ConnectSheet({ open, onOpenChange, hidePasskey }: ConnectSheetProps) {
  const connectors = useConnectors();
  const desktop = useIsDesktop();
  const reduce = useReducedMotionPref();
  const { toast } = useToast();
  const [qrUri, setQrUri] = useState<string | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);

  const connect = useConnect();
  const { reset } = connect;
  const pendingUid = connect.isPending ? (connect.variables?.connector as { uid?: string } | undefined)?.uid : undefined;

  const options = useMemo(
    () => (open ? walletOptions(connectors, { hidePasskey, hasInjectedProvider: hasInjectedProvider() }) : []),
    [connectors, hidePasskey, open],
  );

  const stopListening = useCallback(() => {
    unsubscribe.current?.();
    unsubscribe.current = null;
  }, []);

  // Fresh state each time the sheet opens; stop listening for WalletConnect links when it closes.
  useEffect(() => {
    if (open) return;
    stopListening();
    const t = setTimeout(() => {
      setQrUri(null);
      reset();
    }, 400); // after the exit animation
    return () => clearTimeout(t);
  }, [open, reset, stopListening]);

  useEffect(() => stopListening, [stopListening]);

  const choose = (option: WalletOption) => {
    const connector = connectors.find((c) => c.uid === option.connector.uid);
    if (!connector) return;
    stopListening();
    if (option.kind === "walletconnect") {
      // The connector announces its pairing link; we draw our own QR (desktop) or hand the link
      // to the phone so it can open a wallet app.
      const onMessage = ({ type, data }: { type: string; data?: unknown }) => {
        if (type !== "display_uri" || typeof data !== "string") return;
        if (desktop) setQrUri(data);
        else window.location.href = data;
      };
      connector.emitter.on("message", onMessage);
      unsubscribe.current = () => connector.emitter.off("message", onMessage);
    }
    connect.mutate(
      { connector, chainId: targetChain.id },
      {
        onSuccess: () => {
          stopListening();
          // The account chip appearing in the nav is the confirmation; a toast would cover it.
          onOpenChange(false);
        },
      },
    );
  };

  const error = connect.error ? explainError(connect.error) : null;
  const passkeys = options.filter((o) => o.kind === "passkey");
  const wallets = options.filter((o) => o.kind !== "passkey");
  const showQr = Boolean(qrUri) && connect.isPending;

  const viewMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: fade }
    : {
        initial: { opacity: 0, x: 16 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -16 },
        transition: spring.smooth,
      };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={showQr ? "Scan with your phone" : "Connect a wallet"}
      description={
        showQr
          ? "Open your wallet app and scan this code."
          : "Your wallet is how you vote and collect prizes. Connecting is free."
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {showQr && qrUri ? (
          <motion.div key="qr" {...viewMotion} className="flex flex-col items-center">
            {/* The code draws its own white quiet zone so it scans in dark mode too. */}
            <div className="squircle overflow-hidden rounded-md shadow-md">
              <QRCodeSVG value={qrUri} size={240} level="M" marginSize={3} title="WalletConnect pairing code" />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(qrUri).then(
                    () => toast({ tone: "success", title: "Link copied" }),
                    () => toast({ tone: "error", title: "Couldn't copy the link" }),
                  );
                }}
                className="text-footnote text-fg-muted hover:text-fg hover:bg-fg/6 inline-flex h-11 items-center gap-1.5 rounded-full px-3 transition-colors"
              >
                <Copy className="size-4" strokeWidth={1.75} aria-hidden />
                Copy link
              </button>
              <button
                type="button"
                onClick={() => {
                  stopListening();
                  setQrUri(null);
                  reset();
                }}
                className="text-footnote text-fg-muted hover:text-fg hover:bg-fg/6 inline-flex h-11 items-center gap-1.5 rounded-full px-3 transition-colors"
              >
                <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />
                Other wallets
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="list" {...viewMotion} className="flex flex-col gap-4">
            {wallets.length > 0 ? (
              <OptionGroup label="Wallets">
                {wallets.map((o) => (
                  <OptionRow
                    key={o.connector.uid}
                    option={o}
                    pending={pendingUid === o.connector.uid}
                    disabled={connect.isPending && pendingUid !== o.connector.uid}
                    onSelect={() => choose(o)}
                  />
                ))}
              </OptionGroup>
            ) : (
              <NoWallet />
            )}

            {passkeys.length > 0 ? (
              <OptionGroup label="New to wallets?">
                {passkeys.map((o) => (
                  <OptionRow
                    key={o.connector.uid}
                    option={o}
                    pending={pendingUid === o.connector.uid}
                    disabled={connect.isPending && pendingUid !== o.connector.uid}
                    onSelect={() => choose(o)}
                  />
                ))}
              </OptionGroup>
            ) : null}

            <div aria-live="polite" className="empty:hidden">
              {error ? (
                <div role="alert" className="bg-danger/8 rounded-sm px-3.5 py-3">
                  <p className="text-callout text-danger-text">{error.title}</p>
                  {error.detail ? <p className="text-footnote text-fg-muted mt-0.5">{error.detail}</p> : null}
                </div>
              ) : null}
            </div>

            <WhatsAWallet />
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ pieces */

function OptionGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label}>
      <h3 className="text-caption-caps text-fg-muted mb-2 px-1">{label}</h3>
      <ul className="bg-fg/4 divide-border squircle divide-y overflow-hidden rounded-md">{children}</ul>
    </section>
  );
}

function OptionIcon({ option }: { option: WalletOption }) {
  const { icon } = option.connector;
  if (icon && option.kind === "browser") {
    // Wallet icons are data: URIs announced by the wallet itself (EIP-6963), not optimisable images.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon.trim()} alt="" className="size-8 shrink-0 rounded-xs" />;
  }
  const Icon =
    option.kind === "passkey"
      ? ScanFace
      : option.kind === "walletconnect"
        ? QrCode
        : option.kind === "test"
          ? FlaskConical
          : Wallet;
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-xs",
        option.kind === "passkey" ? "bg-accent text-accent-fg" : "bg-fg/8 text-fg",
      )}
    >
      <Icon className="size-4.5" strokeWidth={1.75} />
    </span>
  );
}

function OptionRow({
  option,
  pending,
  disabled,
  onSelect,
}: {
  option: WalletOption;
  pending: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <motion.button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-busy={pending || undefined}
        data-wallet={option.kind}
        whileTap={disabled ? undefined : { scale: 0.985 }}
        transition={spring.snappy}
        className="hover:bg-fg/5 flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-[background-color,opacity] disabled:opacity-45"
      >
        <OptionIcon option={option} />
        <span className="min-w-0 flex-1">
          <span className="text-callout text-fg block truncate">{option.label}</span>
          {option.description ? (
            <span className="text-footnote text-fg-muted block truncate">
              {pending ? "Confirm in your wallet" : option.description}
            </span>
          ) : pending ? (
            <span className="text-footnote text-fg-muted block">Confirm in your wallet</span>
          ) : null}
        </span>
        {pending ? (
          <Spinner className="text-fg-muted" />
        ) : (
          <ChevronRight className="text-fg-subtle size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        )}
      </motion.button>
    </li>
  );
}

function NoWallet() {
  return (
    <div className="bg-fg/4 squircle rounded-md px-4 py-5 text-center">
      <span aria-hidden className="bg-fg/8 text-fg mx-auto mb-3 grid size-10 place-items-center rounded-full">
        <Wallet className="size-5" strokeWidth={1.75} />
      </span>
      <p className="text-callout text-fg">No wallet found in this browser</p>
      <p className="text-footnote text-fg-muted mx-auto mt-1 max-w-xs text-pretty">
        Install a wallet app or browser extension, then come back and connect.
      </p>
      <a
        href="https://ethereum.org/en/wallets/find-wallet/"
        target="_blank"
        rel="noreferrer"
        className="text-footnote text-accent mt-3 inline-flex h-11 items-center underline-offset-4 hover:underline"
      >
        Find a wallet
      </a>
    </div>
  );
}

function WhatsAWallet() {
  return (
    <details className="group">
      <summary className="text-footnote text-fg-muted hover:text-fg flex h-11 cursor-pointer list-none items-center gap-1.5 px-1 transition-colors [&::-webkit-details-marker]:hidden">
        What&rsquo;s a wallet?
        <ChevronDown
          className="size-4 transition-transform duration-200 group-open:rotate-180"
          strokeWidth={1.75}
          aria-hidden
        />
      </summary>
      <div className="text-footnote text-fg-muted flex flex-col gap-2 px-1 pb-1">
        <p>
          A wallet is an app that holds your account. You use it to approve things like casting a vote, and
          prizes are paid straight into it.
        </p>
        <p>
          Arena never sees your passwords or recovery phrase.
          {isTestnet ? " Everything here uses free test ETH, so no real money is involved." : null}
        </p>
      </div>
    </details>
  );
}
