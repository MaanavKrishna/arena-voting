import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type ConsoleMessage,
  type Page,
} from "@playwright/test";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { foundry } from "viem/chains";
import { arenaAbi } from "../src/generated";

/* ------------------------------------------------------------------ chain */

export const RPC = "http://127.0.0.1:8545";
export const APP = "http://localhost:3000";
/**
 * Arena's address on a fresh Anvil (first deployment from account 0, nonce 0). global-setup.ts
 * checks src/deployments/31337.json agrees, so specs don't need that file at load time.
 */
export const ARENA: Address = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

/** Anvil's default accounts (public test keys; local chain only). The mock wallet offers 0..2. */
export const ACCOUNTS = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
  "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
  "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
  "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
] as const satisfies readonly Address[];

export const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });
/** Anvil's accounts are unlocked, so this sends `eth_sendTransaction` with no key. */
const wallet = createWalletClient({ chain: foundry, transport: http(RPC) });

const FOUNDRY_BIN = path.join(process.env.HOME ?? "", ".foundry/bin");

/** Runs `cast` against the local chain and returns its trimmed stdout. */
export function cast(...args: string[]): string {
  return execFileSync("cast", [...args, "--rpc-url", RPC], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${FOUNDRY_BIN}:${process.env.PATH ?? ""}` },
  }).trim();
}

/** `cast balance` in wei. */
export const balanceOf = (address: Address) => BigInt(cast("balance", address));

/** A `cast call` read on the Arena contract, e.g. `castRead("claimable(address)(uint256)", addr)`. */
export const castRead = (signature: string, ...args: string[]) => cast("call", ARENA, signature, ...args);

export async function rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result as T;
}

/** Latest block timestamp. */
export async function chainNow(): Promise<number> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  return Number(block.timestamp);
}

/**
 * Moves the chain clock forward and mines a block. The chain stays ahead of the wall clock
 * afterwards, which the app's chain-time offset absorbs (see stage.spec.ts for the skew chip).
 */
export async function timeTravel(seconds: number): Promise<void> {
  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine");
}

export enum Presence {
  Anywhere = 0,
  Room = 1,
  Gated = 2,
}

export type NewContest = {
  organiser?: Address;
  title?: string;
  presence?: Presence;
  prizeEth?: string;
  /** Seconds from the current chain time until entries close and voting opens. */
  opensIn?: number;
  /** Voting length in seconds (min 5 min). */
  duration?: number;
  openSubmissions?: boolean;
  dripEth?: string;
  /** Entries the organiser adds straight away (curated): payee and display name. */
  entries?: { payee: Address; name: string }[];
  gatekeepers?: Address[];
};

async function send(from: Address, functionName: string, args: readonly unknown[], value = 0n) {
  const hash = await wallet.writeContract({
    address: ARENA,
    abi: arenaAbi,
    // The ABI is the generated one; the call is checked by the simulation in the node.
    functionName: functionName as "createContest",
    args: args as never,
    account: from,
    value,
    chain: foundry,
  } as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  return receipt;
}

/**
 * Creates a contest straight on the chain (no UI), adds entries and gatekeepers, and returns its id
 * as a string. Voting opens `opensIn` seconds after now; call `openVoting` to jump there.
 */
export async function createContest(opts: NewContest = {}): Promise<{ id: string; votingStart: number; votingEnd: number }> {
  const organiser = opts.organiser ?? ACCOUNTS[0];
  const now = await chainNow();
  const votingStart = now + (opts.opensIn ?? 120);
  const votingEnd = votingStart + (opts.duration ?? 3600);
  const receipt = await send(
    organiser,
    "createContest",
    [
      {
        title: opts.title ?? `E2E contest ${Date.now().toString(36)}`,
        metadataURI: "",
        submissionEnd: BigInt(votingStart),
        votingStart: BigInt(votingStart),
        votingEnd: BigInt(votingEnd),
        presence: opts.presence ?? Presence.Anywhere,
        openSubmissions: opts.openSubmissions ?? false,
        ticketRoot: `0x${"0".repeat(64)}` as Hex,
        ticketListURI: "",
        dripPerCheckIn: parseEther(opts.dripEth ?? "0"),
      },
    ],
    parseEther(opts.prizeEth ?? "0.01"),
  );
  const [log] = parseEventLogs({ abi: arenaAbi, eventName: "ContestCreated", logs: receipt.logs });
  const id = log.args.contestId;
  for (const e of opts.entries ?? []) {
    const uri = await uploadJson({ version: 1, name: e.name, tagline: `${e.name} tagline`, description: "" });
    await send(organiser, "submitEntry", [id, e.payee, uri, []]);
  }
  for (const gk of opts.gatekeepers ?? []) await send(organiser, "setGatekeeper", [id, gk, true]);
  return { id: id.toString(), votingStart, votingEnd };
}

export const getContest = (id: string) =>
  publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "getContest", args: [BigInt(id)] });

export const getEntries = (id: string) =>
  publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "getEntries", args: [BigInt(id)] });

/** Stores JSON in the app's E2E IPFS stub (the same PUT the upload flow uses) and returns `ipfs://<cid>`. */
export async function uploadJson(value: unknown): Promise<string> {
  const res = await fetch(`${APP}/api/e2e-ipfs/upload?kind=json&mime=application/json`, {
    method: "PUT",
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`E2E IPFS stub upload failed: ${res.status}`);
  const { cid } = (await res.json()) as { cid: string };
  return `ipfs://${cid}`;
}

/** Jumps the chain clock to just past `votingStart` (no-op if already there). */
export async function openVoting(votingStart: number): Promise<void> {
  const now = await chainNow();
  if (now <= votingStart) await timeTravel(votingStart - now + 2);
}

/** A vote straight on the chain (Anywhere contests only: no beacon, no proof). */
export async function voteOnChain(from: Address, contestId: string, entryId: number) {
  await send(from, "vote", [BigInt(contestId), entryId, { slot: 0, token: `0x${"0".repeat(32)}` }, []]);
}

/* ------------------------------------------------------------------ wallet */

/** Adds `?e2eAccount=n` (the mock wallet's account) to a path, keeping any other params. */
export function withAccount(pathname: string, account: number): string {
  const [p, q = ""] = pathname.split("?");
  const params = new URLSearchParams(q);
  params.set("e2eAccount", String(account));
  return `${p}?${params.toString()}`;
}

/**
 * Connects the E2E mock wallet. The mock connector doesn't reconnect after a full page load (wagmi's
 * mock `isAuthorized()` is false unless `features.reconnect` is set), so call this after every
 * `goto`/reload. The account is whichever `?e2eAccount=n` the page was loaded with.
 */
export async function connectWallet(page: Page): Promise<void> {
  const account = page.getByRole("button", { name: /^Account 0x/ }).first();
  const connectBtn = page.getByRole("button", { name: "Connect", exact: true }).first();
  await expect(account.or(connectBtn).first()).toBeVisible({ timeout: 30_000 });
  if (await account.isVisible()) return;
  await connectBtn.click();
  await page.getByRole("button", { name: /^Test wallet/ }).click();
  await expect(account).toBeVisible({ timeout: 15_000 });
}

/** `goto` with `?e2eAccount=n`, then connect the mock wallet. */
export async function openAs(page: Page, pathname: string, account: number): Promise<void> {
  await page.goto(withAccount(pathname, account));
  await connectWallet(page);
}

/* ------------------------------------------------------------------ console guard */

/**
 * Console messages that are known, benign dev noise. Everything else logged at `error` level fails
 * the test. Keep each entry narrow and say why it is harmless.
 */
const BENIGN: { why: string; test: (text: string, url: string) => boolean }[] = [
  {
    // Seed.s.sol gives the three demo contests and their entries placeholder metadata URIs
    // (ipfs://bafyseed…) that exist on no gateway. The app falls back to "Entry n" / no description;
    // the browser still logs each failed gateway fetch as "Failed to load resource: 404".
    why: "seeded placeholder metadata",
    test: (text, url) => /bafyseed/.test(text) || /bafyseed/.test(url),
  },
];

export type ConsoleProblem = { kind: "console" | "pageerror"; text: string; url: string };

export function watchConsole(target: Page | BrowserContext, sink: ConsoleProblem[]) {
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    const url = msg.location().url ?? "";
    if (BENIGN.some((b) => b.test(text, url))) return;
    sink.push({ kind: "console", text, url });
  };
  if ("newPage" in target) {
    target.on("console", onConsole);
    target.on("weberror", (e) => sink.push({ kind: "pageerror", text: String(e.error()), url: e.page()?.url() ?? "" }));
  } else {
    target.on("console", onConsole);
    target.on("pageerror", (e) => sink.push({ kind: "pageerror", text: String(e), url: target.url() }));
  }
}

/**
 * Keeps the suite off the internet: anything not on this machine (the public IPFS gateways the app
 * falls back to, a public RPC) answers 404 locally, with CORS so browsers log a plain 404 rather
 * than a CORS failure. An unexpected outside request therefore shows up as a console error.
 */
async function offline(ctx: BrowserContext) {
  await ctx.route(
    (url) => url.protocol.startsWith("http") && url.hostname !== "localhost" && url.hostname !== "127.0.0.1",
    (route) => route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" }, body: "offline" }),
  );
}

type Fixtures = {
  consoleProblems: ConsoleProblem[];
  /** A second browser context (another person/device) whose console is checked too. */
  newContext: (opts?: BrowserContextOptions) => Promise<BrowserContext>;
};

/**
 * `test` with a console guard: any `console.error` or uncaught page error in any page of the test
 * (including contexts made with `newContext`) fails it, after the body has run.
 */
// Fixture callbacks name Playwright's `use` argument `provide`, so the React hooks lint rule doesn't
// mistake it for React's `use`.
export const test = base.extend<Fixtures>({
  consoleProblems: [
    async ({ context }, provide) => {
      const problems: ConsoleProblem[] = [];
      await offline(context);
      watchConsole(context, problems);
      await provide(problems);
      expect(problems, `console errors:\n${problems.map((p) => `${p.kind}: ${p.text} (${p.url})`).join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],
  newContext: async ({ browser, consoleProblems }, provide, testInfo) => {
    const made: BrowserContext[] = [];
    await provide(async (opts) => {
      const ctx = await (browser as Browser).newContext({
        baseURL: testInfo.project.use.baseURL,
        ...opts,
      });
      await offline(ctx);
      watchConsole(ctx, consoleProblems);
      made.push(ctx);
      return ctx;
    });
    for (const c of made) await c.close();
  },
});

export { expect };

/** True on the phone project (390 px). */
export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

/* ------------------------------------------------------------------ stage + presence */

export const STAGE_VIEWPORT = { width: 1440, height: 900 };

/**
 * Opens the Stage for `contestId` as the organiser (mock account `organiser`) in its own desktop
 * context, sets up the room signal if needed (two signatures, then the "Save signal" transaction)
 * and starts the beacon. Resolves once the Stage exposes a payload in `data-beacon-payload`.
 */
export async function startStage(
  newContext: Fixtures["newContext"],
  contestId: string,
  opts: {
    organiser?: number;
    query?: string;
    /** Defaults to a 1440 × 900 projector. */
    viewport?: { width: number; height: number } | null;
    /** Runs on the new page before it loads (e.g. to set its clock). */
    beforeLoad?: (stage: Page) => Promise<void>;
  } = {},
): Promise<Page> {
  const { organiser = 0, query = "", beforeLoad } = opts;
  const ctx = await newContext({ viewport: opts.viewport ?? STAGE_VIEWPORT });
  const stage = await ctx.newPage();
  await beforeLoad?.(stage);
  await stage.goto(withAccount(`/c/${contestId}/stage${query ? `?${query}` : ""}`, organiser));
  const root = stage.locator("[data-stage-root]");
  await expect(root).toBeVisible({ timeout: 30_000 });

  const setup = stage.getByTestId("beacon-setup");
  const start = stage.getByRole("button", { name: "Start beacon" });
  await expect(setup.or(start).first()).toBeVisible({ timeout: 30_000 });
  if (await setup.isVisible()) {
    const connectBtn = setup.getByRole("button", { name: "Connect", exact: true });
    if (await connectBtn.isVisible()) {
      await connectBtn.click();
      await stage.getByRole("button", { name: /^Test wallet/ }).click();
    }
    await setup.getByRole("button", { name: /Continue in wallet|Try again/ }).click();
    await setup.getByRole("button", { name: /Save signal/ }).click({ timeout: 60_000 });
  }
  await start.click({ timeout: 60_000 });
  await expect(root).toHaveAttribute("data-beacon-payload", /^0x01[0-9a-f]{48}$/, { timeout: 30_000 });
  return stage;
}

/** Splits a 25-byte beacon payload (0x01 | contestId u32 | slot u32 | token 16 bytes). */
export function decodePayload(hex: string): { contestId: number; slot: number; token: Hex } {
  return {
    contestId: Number.parseInt(hex.slice(4, 12), 16),
    slot: Number.parseInt(hex.slice(12, 20), 16),
    token: `0x${hex.slice(20)}`,
  };
}

export const stagePayload = async (stage: Page) =>
  (await stage.locator("[data-stage-root]").getAttribute("data-beacon-payload")) ?? "";

/** Feeds a beacon payload to the phone as if the sound decoder heard it. */
export const injectBeacon = (page: Page, hex: string) =>
  page.evaluate((h) => window.__arenaInjectBeacon?.(h) ?? false, hex);

/** The presence chip the visitor can see (phone: pinned; desktop: in the action area; sheet: inline). */
export const presenceChip = (page: Page) => page.locator("[data-presence-chip]:visible").first();

/** Waits for the page's presence hook to install the E2E injector. */
export async function waitForInjector(page: Page) {
  await expect.poll(() => page.evaluate(() => typeof window.__arenaInjectBeacon === "function"), { timeout: 20_000 }).toBe(true);
}
