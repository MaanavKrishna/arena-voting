import { rm } from "node:fs/promises";
import path from "node:path";

/**
 * Clears the E2E IPFS stub store (web/.e2e-ipfs, gitignored) so runs don't pile up files. Anvil and
 * `next dev` are stopped by Playwright itself after this (they are `webServer` entries).
 */
export default async function globalTeardown() {
  if (process.env.PW_EXISTING_STACK === "1") return;
  const dir = path.resolve(__dirname, "../.e2e-ipfs");
  await rm(dir, { recursive: true, force: true });
}
