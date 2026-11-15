import type { FullConfig } from "@playwright/test";
import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";
import { arenaAbi } from "../src/generated";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ARENA } from "./helpers";

/**
 * Runs after the web servers (Playwright starts `webServer` entries first: the chain in
 * e2e/chain.ts, then `next dev`). Checks the stack is the one the specs expect, then compiles every
 * route once so the first test of each spec doesn't spend its timeout on a cold `next dev` compile.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3000";
  const client = createPublicClient({ chain: foundry, transport: http("http://127.0.0.1:8545") });

  const file = path.resolve(__dirname, "../src/deployments/31337.json");
  const deployment = JSON.parse(await readFile(file, "utf8")) as { address: string };
  if (deployment.address.toLowerCase() !== ARENA.toLowerCase()) {
    throw new Error(`Arena deployed at ${deployment.address}, specs expect ${ARENA} (is the chain fresh?)`);
  }

  const chainId = await client.getChainId();
  if (chainId !== foundry.id) throw new Error(`Expected the local Anvil chain (31337), got ${chainId}`);
  const count = await client.readContract({
    address: ARENA,
    abi: arenaAbi,
    functionName: "contestCount",
  });
  if (count < 3n) throw new Error(`Expected the 3 seeded contests at ${deployment.address}, found ${count}`);

  const routes = ["/", "/explore", "/create", "/me", "/c/1", "/c/1/manage", "/c/1/submit", "/c/2/stage", "/c/3/gate"];
  for (const r of routes) {
    const res = await fetch(`${baseURL}${r}`);
    if (res.status >= 500) throw new Error(`${r} answered ${res.status} during warm-up`);
  }
}
