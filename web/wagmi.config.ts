import { defineConfig } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";

// `pnpm gen` runs `forge build` first, so the plugin only reads artifacts.
export default defineConfig({
  out: "src/generated.ts",
  contracts: [],
  plugins: [
    foundry({
      project: "../contracts",
      include: ["Arena.json"],
      forge: { build: false },
    }),
  ],
});
