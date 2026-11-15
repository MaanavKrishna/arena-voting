import { z } from "zod";

/**
 * Public env. Next only inlines NEXT_PUBLIC_* values that are written literally,
 * so every variable is read by name here. Flags are "1" = on.
 */
const schema = z.object({
  NEXT_PUBLIC_SEPOLIA_RPC_URL: z.string().url().optional(),
  NEXT_PUBLIC_WC_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_PINATA_GATEWAY: z.string().optional(),
  NEXT_PUBLIC_ENABLE_ANVIL: z.boolean(),
  NEXT_PUBLIC_E2E: z.boolean(),
  NEXT_PUBLIC_ENABLE_BASE_ACCOUNT: z.boolean(),
});

export const env = schema.parse({
  NEXT_PUBLIC_SEPOLIA_RPC_URL: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || undefined,
  NEXT_PUBLIC_WC_PROJECT_ID: process.env.NEXT_PUBLIC_WC_PROJECT_ID || undefined,
  NEXT_PUBLIC_PINATA_GATEWAY: process.env.NEXT_PUBLIC_PINATA_GATEWAY || undefined,
  NEXT_PUBLIC_ENABLE_ANVIL: process.env.NEXT_PUBLIC_ENABLE_ANVIL === "1",
  NEXT_PUBLIC_E2E: process.env.NEXT_PUBLIC_E2E === "1",
  NEXT_PUBLIC_ENABLE_BASE_ACCOUNT: process.env.NEXT_PUBLIC_ENABLE_BASE_ACCOUNT === "1",
});
