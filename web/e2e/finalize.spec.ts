import { formatEther, parseEther } from "viem";
import {
  ACCOUNTS,
  balanceOf,
  castRead,
  chainNow,
  createContest,
  expect,
  getContest,
  isPhone,
  openAs,
  openVoting,
  startStage,
  withAccount,
  test,
  timeTravel,
  voteOnChain,
} from "./helpers";

/**
 * F5 — finalise and claim (docs/testing.md spec 5). Runs in its own projects after everything else
 * (playwright.config.ts) because it moves the chain clock past a contest's end.
 *
 * A fresh 5-minute Anywhere contest with a 0.04 prize: "Comet Club" (payee: account 2) gets two
 * votes, "Paper Plane" one. After the clock passes the end, the organiser finalises from the Stage,
 * the reveal names the real winner, and account 2 collects the prize (phone: from /me; desktop: from
 * the contest page's claim card). `cast` confirms the balance moved.
 */
test("time travel past the end, finalise on the Stage, reveal the winner, payee claims", async ({
  page,
  newContext,
}) => {
  const payee = ACCOUNTS[2];
  const prize = parseEther("0.04");
  const c = await createContest({
    title: `E2E Finale ${Date.now().toString(36)}`,
    prizeEth: "0.04",
    duration: 300,
    entries: [
      { payee: ACCOUNTS[4], name: "Paper Plane" },
      { payee, name: "Comet Club" },
    ],
  });
  await openVoting(c.votingStart);
  await voteOnChain(ACCOUNTS[3], c.id, 2);
  await voteOnChain(ACCOUNTS[5], c.id, 2);
  await voteOnChain(ACCOUNTS[6], c.id, 1);

  // Past the end.
  await timeTravel(c.votingEnd - (await chainNow()) + 5);
  expect(await chainNow()).toBeGreaterThan(c.votingEnd);
  const claimableBefore = BigInt(castRead("claimable(address)(uint256)", payee).split(" ")[0]);

  // The organiser's Stage offers Finalise; the reveal shows the real winner.
  const stage = await startStageForEnded(newContext, c.id);
  await stage.getByRole("button", { name: "Finalise and reveal" }).click();
  const card = stage.getByTestId("winner-card");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card).toContainText("Comet Club");
  const view = await getContest(c.id);
  expect(view.finalized).toBe(true);
  const claimable = BigInt(castRead("claimable(address)(uint256)", payee).split(" ")[0]);
  expect(claimable - claimableBefore).toBe(prize);

  // The payee collects.
  const before = balanceOf(payee);
  const where = isPhone(page) ? "/me" : `/c/${c.id}`;
  await openAs(page, where, 2);
  const claim = page.getByRole("button", { name: "Collect prize" });
  await expect(claim).toBeVisible({ timeout: 30_000 });
  await claim.click();
  await expect(page.getByText("Sent to your wallet").first()).toBeVisible({ timeout: 30_000 });

  await expect.poll(() => castRead("claimable(address)(uint256)", payee), { timeout: 30_000 }).toBe("0");
  const gained = balanceOf(payee) - before;
  // The whole claimable amount arrived, minus a little network fee.
  expect(gained).toBeGreaterThan(claimable - parseEther("0.001"));
  expect(gained).toBeLessThanOrEqual(claimable);
  test.info().annotations.push({ type: "claimed", description: `${formatEther(gained)} ETH to ${payee}` });
});

/**
 * The organiser's Stage for an ended contest: the "Voting closed" panel, no beacon. The kiosk has no
 * nav, so the Finalise button itself offers "Connect wallet" until the mock wallet is connected.
 */
async function startStageForEnded(newContext: Parameters<typeof startStage>[0], id: string) {
  const ctx = await newContext({ viewport: { width: 1440, height: 900 } });
  const stage = await ctx.newPage();
  await stage.goto(withAccount(`/c/${id}/stage`, 0));
  await expect(stage.getByText("The votes are in.")).toBeVisible({ timeout: 30_000 });
  const finalise = stage.getByRole("button", { name: "Finalise and reveal" });
  const connectBtn = stage.getByRole("button", { name: "Connect wallet", exact: true });
  await expect(finalise.or(connectBtn).first()).toBeVisible();
  if (await connectBtn.isVisible()) {
    await connectBtn.click();
    await stage.getByRole("button", { name: /^Test wallet/ }).click();
  }
  await expect(finalise).toBeEnabled({ timeout: 15_000 });
  return stage;
}
