import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";

/**
 * Where the Arena contract lives on each chain. Files are `src/deployments/<chainId>.json`
 * (`{ "address": "0x…", "block": 123 }`), copied there by `pnpm gen`. The 31337 file is gitignored
 * and the 11155111 file doesn't exist until the first public deploy, so every file is loaded inside
 * a guarded `require`: a missing file is the "not deployed on this network" state, never a build
 * failure. The module paths must stay string literals so the bundler can see them.
 */

const DeploymentFile = z.object({
  address: z.string().refine((a) => isAddress(a, { strict: false }), "invalid address"),
  block: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
});

export type Deployment = { address: Address; block: bigint };
export type DeploymentState =
  | ({ status: "deployed" } & Deployment)
  | { status: "not-deployed"; reason: "missing" | "invalid" };

/** Returns the loader for a chain's deployment file, or `undefined` when there isn't one. */
export type DeploymentLoaders = (chainId: number) => (() => unknown) | undefined;

type RequireContext = { keys(): string[]; (id: string): unknown };

/**
 * `require.context` is how the bundler (Turbopack and Webpack) learns "every `<chainId>.json` in
 * this folder": it handles zero, one or many files, which a plain `require("./31337.json")` can't
 * (a missing literal path fails the build). It doesn't exist outside a bundler (unit tests), in
 * which case there are simply no files.
 */
function bundledFiles(): RequireContext | undefined {
  try {
    // @ts-expect-error `require.context` is a bundler feature without a Node typing
    return require.context("../deployments", false, /^\.\/\d+\.json$/);
  } catch {
    return undefined;
  }
}

const fileLoaders: DeploymentLoaders = (chainId) => {
  const files = bundledFiles();
  const key = `./${chainId}.json`;
  return files && files.keys().includes(key) ? () => files(key) : undefined;
};

/** Pure resolver, exported so the missing/invalid cases can be tested without touching the disk. */
export function resolveDeployment(chainId: number, loaders: DeploymentLoaders): DeploymentState {
  const load = loaders(chainId);
  if (!load) return { status: "not-deployed", reason: "missing" };
  let raw: unknown;
  try {
    raw = load();
  } catch {
    return { status: "not-deployed", reason: "missing" };
  }
  const parsed = DeploymentFile.safeParse(raw);
  if (!parsed.success) return { status: "not-deployed", reason: "invalid" };
  return {
    status: "deployed",
    address: getAddress(parsed.data.address),
    block: BigInt(parsed.data.block),
  };
}

export function deploymentState(chainId: number): DeploymentState {
  return resolveDeployment(chainId, fileLoaders);
}

/** The Arena address on this chain, or `undefined` when it isn't deployed there. */
export function arenaAddress(chainId: number): Address | undefined {
  const d = deploymentState(chainId);
  return d.status === "deployed" ? d.address : undefined;
}

/** The block the contract was deployed in (start of log queries), or `undefined` when not deployed. */
export function deploymentBlock(chainId: number): bigint | undefined {
  const d = deploymentState(chainId);
  return d.status === "deployed" ? d.block : undefined;
}

export function isDeployed(chainId: number): boolean {
  return deploymentState(chainId).status === "deployed";
}
