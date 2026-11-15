import { describe, expect, it } from "vitest";
import { e2eIpfsEnabled } from "./e2e-ipfs";

describe("e2eIpfsEnabled", () => {
  it("is on only in E2E mode (which already implies the local chain)", () => {
    expect(e2eIpfsEnabled({ e2e: true, vercelEnv: undefined })).toBe(true);
    expect(e2eIpfsEnabled({ e2e: false, vercelEnv: undefined })).toBe(false);
  });
  it("is never on for a production deployment", () => {
    expect(e2eIpfsEnabled({ e2e: true, vercelEnv: "production" })).toBe(false);
  });
  it("follows the env by default (off in tests)", () => {
    expect(e2eIpfsEnabled()).toBe(false);
  });
});
