import type { Page } from "@playwright/test";
import {
  ACCOUNTS,
  Presence,
  chainNow,
  createContest,
  decodePayload,
  expect,
  openVoting,
  stagePayload,
  startStage,
  test,
  voteOnChain,
} from "./helpers";

/**
 * F8 — the Stage (docs/testing.md spec 8), at the project's width (it is built for projectors, but
 * must still work on a small screen): the beacon payload rotates every 10 s slot, and a device
 * clock that disagrees with the chain by 40 s shows the skew chip (and the Stage keeps following the
 * chain). The chain clock is set by Playwright's `clock.setSystemTime`, relative to the latest block,
 * because the local chain itself already runs ahead of the wall clock after the suite's time travel.
 */
async function roomContest() {
  const c = await createContest({
    presence: Presence.Room,
    title: `E2E Stage ${Date.now().toString(36)}`,
    entries: [{ payee: ACCOUNTS[7], name: "Rocket Cart" }],
  });
  await openVoting(c.votingStart);
  return c.id;
}

/** Sets the page's device clock to chain time plus `skewSeconds` (negative: the device is behind). */
async function deviceClock(page: Page, skewSeconds: number) {
  const chainMs = (await chainNow()) * 1000;
  await page.clock.setSystemTime(chainMs + skewSeconds * 1000);
}

const skewChip = (stage: Page) => stage.getByText(/This computer.s clock is \d+ s (behind|ahead)/);

test("the beacon payload rotates every slot and the room code is on screen", async ({ newContext, viewport }) => {
  const id = await roomContest();
  const stage = await startStage(newContext, id, { viewport, beforeLoad: (p) => deviceClock(p, 0) });
  const first = decodePayload(await stagePayload(stage));
  expect(first.contestId).toBe(Number(id));

  await expect.poll(async () => decodePayload(await stagePayload(stage)).slot, { timeout: 30_000 }).toBeGreaterThan(first.slot);
  const next = decodePayload(await stagePayload(stage));
  expect(next.token).not.toBe(first.token);

  const bar = stage.getByRole("contentinfo", { name: "Room signal" });
  await expect(bar).toContainText(/Signal on/);
  await expect(bar.getByLabel("Room signal code")).toBeVisible();
  // In step with the chain: no clock warning.
  await expect(skewChip(stage)).toHaveCount(0);
});

test("a device clock 40 s behind the network shows the skew chip", async ({ newContext, viewport }) => {
  const id = await roomContest();
  const stage = await startStage(newContext, id, { viewport, beforeLoad: (p) => deviceClock(p, -40) });
  await expect(skewChip(stage)).toBeVisible({ timeout: 20_000 });
  await expect(skewChip(stage)).toHaveText(/clock is (3[89]|4[0-3]) s behind · following the network/);
  // It still broadcasts the chain's current slot, not the device's.
  const { slot } = decodePayload(await stagePayload(stage));
  expect(slot).toBeGreaterThanOrEqual(0);
});

test("reveal preview shows the leader as the winner without touching the chain", async ({ page }) => {
  const c = await createContest({
    title: `E2E Reveal ${Date.now().toString(36)}`,
    entries: [
      { payee: ACCOUNTS[4], name: "Paper Plane" },
      { payee: ACCOUNTS[5], name: "Glass Bridge" },
    ],
  });
  await openVoting(c.votingStart);
  await voteOnChain(ACCOUNTS[1], c.id, 1);
  await voteOnChain(ACCOUNTS[2], c.id, 1);
  await voteOnChain(ACCOUNTS[3], c.id, 2);

  await page.goto(`/c/${c.id}/stage?preview=reveal`);
  await expect(page.getByText("Final results").first()).toBeVisible({ timeout: 30_000 });
  const card = page.getByTestId("winner-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText("Paper Plane");
});
