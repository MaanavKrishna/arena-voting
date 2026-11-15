import { createHash } from "node:crypto";
import path from "node:path";
import { env } from "@/config/env";

/**
 * E2E stand-in for IPFS: content is stored on disk under a content-derived id and served by
 * `/api/e2e-ipfs/<cid>`. Only on when `NEXT_PUBLIC_E2E=1`, and never on a production deployment.
 */
export function e2eIpfsEnabled(): boolean {
  return env.NEXT_PUBLIC_E2E && process.env.VERCEL_ENV !== "production";
}

export const E2E_IPFS_DIR = path.join(process.cwd(), ".e2e-ipfs");

/** Deterministic fake CID: alphanumeric (so `ipfs://` URIs parse), derived from the sha-256 of the content. */
export function e2eCid(content: Uint8Array): string {
  return `bafe2e${createHash("sha256").update(content).digest("hex")}`;
}

export const E2E_CID_PATTERN = /^bafe2e[0-9a-f]{64}$/;
