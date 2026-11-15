import type { Page } from "@playwright/test";
import { toFunctionSelector } from "viem";
import { sepolia } from "viem/chains";
import {
  ACCOUNTS,
  createContest,
  expect,
  getEntries,
  openAs,
  openVoting,
  test,
  voteOnChain,
} from "./helpers";

/** Any request to the local chain's JSON-RPC endpoint. */
const RPC_URL = /^http:\/\/127\.0\.0\.1:8545\/?$/;

/**
 * F6 — error copy (docs/testing.md spec 6). Fresh Anywhere contests; the voter is account 1.
 */
async function anywhereContest() {
  const c = await createContest({
    title: `E2E errors ${Date.now().toString(36)}`,
    entries: [
      { payee: ACCOUNTS[4], name: "Paper Plane" },
      { payee: ACCOUNTS[5], name: "Glass Bridge" },
    ],
  });
  await openVoting(c.votingStart);
  return c.id;
}

/** Counts transactions the wallet sends to the chain (`eth_sendTransaction` from the mock). */
async function countSends(page: Page) {
  const sends: string[] = [];
  await page.route(RPC_URL, async (route) => {
    const body = route.request().postDataJSON() as { method?: string } | null;
    if (body?.method === "eth_sendTransaction") sends.push(body.method);
    await route.fallback();
  });
  return sends;
}

test("a second vote is stopped with copy before the wallet is asked", async ({ page }) => {
  const id = await anywhereContest();
  // Already voted, from this wallet, before the page loaded.
  await voteOnChain(ACCOUNTS[1], id, 2);
  await openAs(page, `/c/${id}`, 1);
  const sends = await countSends(page);
  const sheet = page.getByRole("dialog");

  await page.locator("[data-entry-card]").first().click();
  await expect(sheet.getByText("You've already voted in this contest.").first()).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Vote for / })).toBeDisabled();
  expect(sends).toEqual([]);
});

test("a vote made elsewhere after the page loaded is caught by the simulation, not the wallet", async ({ page }) => {
  const id = await anywhereContest();
  // Keep this page's view of the wallet stale ("hasn't voted"), as if the other vote landed a moment
  // ago: answer its voterState reads with (0, false). Everything else, including the vote
  // simulation, reaches the chain.
  const voterState = toFunctionSelector("voterState(uint256,address)");
  await page.route(RPC_URL, async (route) => {
    const body = route.request().postDataJSON() as { id?: number; method?: string; params?: [{ data?: string }] } | null;
    if (body?.method === "eth_call" && body.params?.[0]?.data?.startsWith(voterState)) {
      return route.fulfill({
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ jsonrpc: "2.0", id: body.id ?? 1, result: `0x${"0".repeat(128)}` }),
      });
    }
    return route.fallback();
  });
  await openAs(page, `/c/${id}`, 1);
  const sends = await countSends(page);
  const sheet = page.getByRole("dialog");

  await page.locator("[data-entry-card]").first().click();
  await expect(sheet.getByRole("button", { name: /^Vote for / })).toBeEnabled();
  await voteOnChain(ACCOUNTS[1], id, 2);
  await sheet.getByRole("button", { name: /^Vote for / }).click();

  await expect(sheet.getByText("You've already voted in this contest.").first()).toBeVisible({ timeout: 20_000 });
  expect(sends).toEqual([]);
  const entries = await getEntries(id);
  expect(entries.map((e) => e.votes)).toEqual([0, 1]);
});

test("cancelling in the wallet shows friendly copy and nothing is sent", async ({ page }) => {
  const id = await anywhereContest();
  await openAs(page, `/c/${id}`, 1);
  // The mock wallet has no "reject transaction" switch, so answer its eth_sendTransaction the way a
  // wallet does when the user cancels: JSON-RPC error 4001.
  const reject = async (route: Parameters<Parameters<Page["route"]>[1]>[0]) => {
    const body = route.request().postDataJSON() as { id?: number; method?: string } | null;
    if (body?.method !== "eth_sendTransaction") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ jsonrpc: "2.0", id: body.id ?? 1, error: { code: 4001, message: "User rejected the request." } }),
    });
  };
  await page.route(RPC_URL, reject);

  const sheet = page.getByRole("dialog");
  await page.locator("[data-entry-card]").first().click();
  await sheet.getByRole("button", { name: /^Vote for / }).click();
  await expect(sheet.getByText("You cancelled in your wallet.").first()).toBeVisible({ timeout: 20_000 });
  const entries = await getEntries(id);
  expect(entries.every((e) => e.votes === 0)).toBe(true);

  // Trying again (wallet now approves) works.
  await page.unroute(RPC_URL, reject);
  await sheet.getByRole("button", { name: /^(Vote for |Try again)/ }).first().click();
  await expect(page.getByText(/^You voted for/).first()).toBeVisible({ timeout: 30_000 });
});

test("a wallet on another network is asked to switch before any action", async ({ page }) => {
  const id = await anywhereContest();
  await openAs(page, `/c/${id}`, 1);

  // The user moves their wallet to another network.
  await expect.poll(() => page.evaluate(() => typeof window.__arenaSwitchChain === "function")).toBe(true);
  await page.evaluate((chainId) => window.__arenaSwitchChain!(chainId), sepolia.id);

  const guard = page.getByRole("region", { name: "Network" });
  await expect(guard).toBeVisible();
  await expect(guard).toContainText("Foundry");

  const sheet = page.getByRole("dialog");
  await page.locator("[data-entry-card]").first().click();
  const action = sheet.getByRole("button", { name: "Switch to Foundry" });
  await expect(action).toBeVisible();
  await action.click();

  await expect(guard).toBeHidden();
  await expect(sheet.getByRole("button", { name: /^Vote for / })).toBeEnabled();
});
