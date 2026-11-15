import { createHash } from "node:crypto";
import path from "node:path";
import { isE2E } from "@/config/network";

/**
 * E2E stand-in for IPFS: content is stored on disk under a content-derived id and served by
 * `/api/e2e-ipfs/<cid>`. Only on in E2E mode (`isE2E`, which requires the local chain), and never
 * on a production deployment.
 */
export function e2eIpfsEnabled(
  o: { e2e: boolean; vercelEnv: string | undefined } = { e2e: isE2E, vercelEnv: process.env.VERCEL_ENV },
): boolean {
  return o.e2e && o.vercelEnv !== "production";
}

export const E2E_IPFS_DIR = path.join(process.cwd(), ".e2e-ipfs");

/** Deterministic fake CID: alphanumeric (so `ipfs://` URIs parse), derived from the sha-256 of the content. */
export function e2eCid(content: Uint8Array): string {
  return `bafe2e${createHash("sha256").update(content).digest("hex")}`;
}

export const E2E_CID_PATTERN = /^bafe2e[0-9a-f]{64}$/;
