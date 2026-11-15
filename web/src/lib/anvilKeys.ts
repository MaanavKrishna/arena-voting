import type { Hex } from "viem";

/**
 * Anvil's default dev accounts 0..2. These keys are public and well known (they appear in Foundry's
 * docs) and only ever hold test funds on a local chain. Loaded only through `loadAnvilKeys()` in
 * `burner.ts`, behind the E2E flags, so production bundles never contain them.
 */
export const ANVIL_KEYS: readonly Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
];
