import { baseAccount, walletConnect } from "wagmi/connectors";
import {
  cookieStorage,
  createConfig,
  createStorage,
  http,
  injected,
  mock,
  type CreateConnectorFn,
} from "wagmi";
import { switchChain } from "wagmi/actions";
import type { Address } from "viem";
import { ANVIL_ADDRESSES, e2eIndex } from "@/lib/burner";
import { env } from "./env";
import { chains, isE2E, rpcUrl } from "./network";

const APP_NAME = "Arena";
const E2E_ACCOUNTS: readonly Address[] = ANVIL_ADDRESSES;

/**
 * Accounts for the E2E mock connector, with the one picked by `?e2eAccount=n` first (the mock
 * connector connects as its first account). Anvil accounts 0..2.
 */
export function e2eAccountsFor(search: string): Address[] {
  const idx = e2eIndex(search, "e2eAccount");
  if (idx === null || idx >= E2E_ACCOUNTS.length) return [...E2E_ACCOUNTS];
  return [E2E_ACCOUNTS[idx], ...E2E_ACCOUNTS.filter((_, i) => i !== idx)];
}

type ConnectorFlags = {
  e2e: boolean;
  baseAccount: boolean;
  walletConnectProjectId?: string;
  search: string;
  origin: string;
};

/** Which connectors the app offers. Pure, so the flag combinations can be tested. */
export function buildConnectors(flags: ConnectorFlags): CreateConnectorFn[] {
  if (flags.e2e) return [mock({ accounts: e2eAccountsFor(flags.search) as [Address, ...Address[]] })];

  const out: CreateConnectorFn[] = [injected()];
  if (flags.walletConnectProjectId) {
    out.push(
      walletConnect({
        projectId: flags.walletConnectProjectId,
        showQrModal: false,
        metadata: {
          name: APP_NAME,
          description: "Contests decided by the people in the room.",
          url: flags.origin,
          icons: [],
        },
      }),
    );
  }
  if (flags.baseAccount) out.push(baseAccount({ appName: APP_NAME }));
  return out;
}

/**
 * viem stamps every client and transport with a `Math.random()` id. Built during a server prerender
 * that trips Cache Components' `blocking-prerender-random-client`, and the id is never rendered or
 * compared, so the server pass borrows a fixed value for the synchronous construction and puts the
 * real one back straight after. The browser keeps the real `Math.random`.
 */
export function withStableRandom<T>(build: () => T): T {
  if (typeof window !== "undefined") return build();
  const real = Math.random;
  Math.random = () => 0.5;
  try {
    return build();
  } finally {
    Math.random = real;
  }
}

function makeConfig() {
  const browser = typeof window !== "undefined";
  return withStableRandom(() => createConfig({
    chains,
    transports: Object.fromEntries(chains.map((c) => [c.id, http(rpcUrl(c.id))])),
    connectors: buildConnectors({
      e2e: isE2E,
      baseAccount: env.NEXT_PUBLIC_ENABLE_BASE_ACCOUNT,
      walletConnectProjectId: env.NEXT_PUBLIC_WC_PROJECT_ID,
      search: browser ? window.location.search : "",
      origin: browser ? window.location.origin : "http://localhost:3000",
    }),
    multiInjectedProviderDiscovery: true, // EIP-6963: lists every installed wallet
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
    pollingInterval: 4_000,
  }));
}

type ArenaConfig = ReturnType<typeof makeConfig>;
let browserConfig: ArenaConfig | undefined;

/**
 * The wagmi config. On the server it builds a fresh one per call (no state leaks between requests);
 * in the browser it is a singleton. Use the same factory for `cookieToInitialState(getConfig(), cookie)`
 * and for `<WagmiProvider config={getConfig()}>`.
 */
export function getConfig(): ArenaConfig {
  if (typeof window === "undefined") return makeConfig();
  if (!browserConfig) {
    browserConfig = makeConfig();
    if (isE2E) exposeE2EHooks(browserConfig);
  }
  return browserConfig;
}

/**
 * E2E only (`isE2E`): lets a test move the mock wallet to another configured chain, the
 * way a user switches networks in their wallet, to exercise the wrong-network prompt
 * (docs/testing.md, errors.spec.ts).
 */
function exposeE2EHooks(config: ArenaConfig) {
  window.__arenaSwitchChain = async (chainId: number) => {
    await switchChain(config, { chainId: chainId as ArenaConfig["chains"][number]["id"] });
    return true;
  };
}

declare global {
  interface Window {
    __arenaSwitchChain?: (chainId: number) => Promise<boolean>;
  }
}

declare module "wagmi" {
  interface Register {
    config: ArenaConfig;
  }
}
