import {
  ACCOUNTS,
  Presence,
  createContest,
  expect,
  getEntries,
  injectBeacon,
  openAs,
  openVoting,
  presenceChip,
  stagePayload,
  startStage,
  test,
  timeTravel,
  waitForInjector,
} from "./helpers";

/**
 * F3 — Room voting with the beacon (docs/testing.md spec 3). Each test makes its own Room contest
 * (account 0 organises and runs the Stage; account 1 votes; payees are accounts 7 and 8).
 *
 * Headless browsers have no speakers or microphone, so the test reads the Stage's current payload
 * from `data-beacon-payload` and hands it to the phone with `window.__arenaInjectBeacon`, which
 * feeds the same path the sound decoder does.
 */
async function roomContest() {
  const c = await createContest({
    presence: Presence.Room,
    title: `E2E Room vote ${Date.now().toString(36)}`,
    entries: [
      { payee: ACCOUNTS[7], name: "Rocket Cart" },
      { payee: ACCOUNTS[8], name: "Comet Club" },
    ],
  });
  await openVoting(c.votingStart);
  return c.id;
}

test.describe("room voting", () => {
  test("idle chip, junk and other-contest payloads ignored, live token → in the room → vote lands live", async ({
    page,
    newContext,
  }) => {
    const id = await roomContest();
    const stage = await startStage(newContext, id);

    await openAs(page, `/c/${id}`, 1);
    await expect(presenceChip(page)).toHaveAttribute("data-state", "idle");
    await expect(presenceChip(page)).toContainText("Prove you're in the room");

    // Before the room: the vote button explains.
    await page.locator("[data-entry-card]").first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Join the room to vote.")).toBeVisible();
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();

    // Junk and other contests are dropped.
    await waitForInjector(page);
    expect(await injectBeacon(page, "0xdeadbeef")).toBe(false);
    const live = await stagePayload(stage);
    const otherContest = `0x01${(Number(id) + 100).toString(16).padStart(8, "0")}${live.slice(12)}`;
    expect(await injectBeacon(page, otherContest)).toBe(false);

    // The Stage's token gets you in.
    expect(await injectBeacon(page, await stagePayload(stage))).toBe(true);
    await expect(presenceChip(page)).toHaveAttribute("data-state", "in-room", { timeout: 15_000 });
    await expect(presenceChip(page)).toContainText("In the room");

    // A second viewer sees the vote arrive without reloading.
    const watcher = await (await newContext()).newPage();
    await watcher.goto(`/c/${id}`);
    const tally = watcher.getByRole("region", { name: "Results" }).getByRole("img", { name: /^Results/ });
    await expect(tally).toBeVisible();
    await expect(tally).not.toHaveAccessibleName(/1 vote/);

    await page.locator("[data-entry-card]").first().click();
    await sheet.getByRole("button", { name: /^Vote for / }).click();
    await expect(page.getByText(/^You voted for/).first()).toBeVisible({ timeout: 30_000 });

    await expect(tally).toHaveAccessibleName(/1 vote/, { timeout: 20_000 });
    const entries = await getEntries(id);
    expect(entries.reduce((n, e) => n + e.votes, 0)).toBe(1);

    // A second vote is blocked with copy.
    await page.locator("[data-entry-card]").nth(1).click();
    await expect(sheet.getByText("You've already voted in this contest.").or(sheet.getByText(/You voted for/)).first()).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^Vote for / })).toBeDisabled();
  });

  test("a token older than the acceptance window is refused with friendly copy", async ({ page, newContext }) => {
    const id = await roomContest();
    const stage = await startStage(newContext, id);
    const old = await stagePayload(stage);
    // Tokens are accepted until 120 s after their 10 s slot ends; move the chain past that.
    await timeTravel(150);

    await openAs(page, `/c/${id}`, 2);
    await waitForInjector(page);
    expect(await injectBeacon(page, old)).toBe(true);
    await expect(presenceChip(page)).toContainText("That signal is too old.", { timeout: 15_000 });
    await expect(presenceChip(page)).not.toHaveAttribute("data-state", "in-room");
  });
});
