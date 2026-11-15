import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite (docs/testing.md#e2e-webe2e). One shared Anvil chain and one `next dev`, so tests run
 * one at a time (workers: 1). finalize.spec.ts moves the chain clock past a contest's end, so it
 * runs in its own projects after everything else.
 */
const phone = { ...devices["iPhone 15"], viewport: { width: 390, height: 844 } };
const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };
const LAST = /finalize\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "phone", use: phone, testIgnore: LAST },
    { name: "desktop", use: desktop, testIgnore: LAST },
    { name: "phone-finalize", use: phone, testMatch: LAST, dependencies: ["phone", "desktop"] },
    { name: "desktop-finalize", use: desktop, testMatch: LAST, dependencies: ["phone-finalize"] },
  ],
  // PW_EXISTING_STACK=1 reuses a chain + dev server you started yourself (pnpm chain, deploy:local,
  // gen, then next dev with the E2E env) — handy while writing specs.
  webServer: process.env.PW_EXISTING_STACK === "1" ? undefined : [
    {
      // Anvil + deploy:local + gen, before the app starts (e2e/chain.ts explains the order).
      name: "chain",
      command: "pnpm exec tsx e2e/chain.ts",
      wait: { stdout: /Arena E2E chain ready/ },
      timeout: 240_000,
      stdout: "pipe",
      gracefulShutdown: { signal: "SIGTERM", timeout: 2_000 },
    },
    {
      name: "next",
      command: "pnpm exec next dev --port 3000",
      url: "http://localhost:3000/",
      reuseExistingServer: false,
      timeout: 180_000,
      env: { NEXT_PUBLIC_E2E: "1", NEXT_PUBLIC_ENABLE_ANVIL: "1" },
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
