import "server-only";
import { z } from "zod";

const schema = z.object({
  PINATA_JWT: z.string().optional(),
  SEPOLIA_RPC_URL: z.string().url().optional(),
});

export const serverEnv = schema.parse({
  PINATA_JWT: process.env.PINATA_JWT || undefined,
  SEPOLIA_RPC_URL: process.env.SEPOLIA_RPC_URL || undefined,
});
