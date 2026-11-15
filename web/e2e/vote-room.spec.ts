import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Room voting with the beacon (docs/testing.md "vote-room.spec.ts"). Expects the local E2E stack
 * (Anvil + `next dev` with NEXT_PUBLIC_E2E=1) and a Room contest with voting open and the beacon
 * set, id in `E2E_ROOM_CONTEST`. Account 0 organises (and runs the Stage); the voter is
 * `E2E_ROOM_VOTER` (default account 2), who must not have voted yet and must not be a payee.
 *
 * Headless browsers have no speakers or microphone, so the test reads the Stage's current payload
 * from `data-beacon-payload` and hands it to the phone with `window.__arenaInjectBeacon`, which
 * feeds the same path the sound decoder does.
 */
const CONTEST = process.env.E2E_ROOM_CONTEST ?? "2";
const VOTER = process.env.E2E_ROOM_VOTER ?? "2";

async function connect(page: Page) {
  await page.getByRole("button", { name: "Connect" }).first().click();
  await page.getByRole("button", { name: /Test wallet A/ }).click();
  await expect(page.getByRole("button", { name: /^Account 0x/ })).toBeVisible();
}

/** Opens the Stage as the organiser, restores (or sets) the beacon and starts it. */
async function startStage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const stage = await ctx.newPage();
  await stage.goto(`/c/${CONTEST}/stage?e2eAccount=0`);
  const root = stage.locator("[data-stage-root]");
  await expect(root).toBeVisible();
  if (await stage.getByRole("button", { name: "Connect" }).isVisible()) await connect(stage);
  const resume = stage.getByRole("button", { name: /Continue in wallet|Set up the room signal|Start the room signal/ });
  if (await resume.isVisible()) await resume.click();
  await stage.getByRole("button", { name: "Start beacon" }).click();
  await expect(root).toHaveAttribute("data-beacon-payload", /^0x01[0-9a-f]{48}$/, { timeout: 30_000 });
  return stage;
}

const payloadOf = async (stage: Page) =>
  (await stage.locator("[data-stage-root]").getAttribute("data-beacon-payload"))!;

const inject = (page: Page, hex: string) => page.evaluate((h) => window.__arenaInjectBeacon?.(h) ?? false, hex);

/** The chip the visitor can see (phone: pinned; desktop: in the action area; sheet: inline). */
const chip = (page: Page) => page.locator("[data-presence-chip]:visible").first();

test.describe("room voting", () => {
  test("idle chip, junk and other-contest payloads ignored, live token → in the room → vote lands live", async ({
    page,
    browser,
  }) => {
    const stage = await startStage(browser);

    await page.goto(`/c/${CONTEST}?e2eAccount=${VOTER}`);
    await connect(page);
    await expect(chip(page)).toHaveAttribute("data-state", "idle");
    await expect(chip(page)).toContainText("Prove you're in the room");

    // Before the room: the vote button explains.
    await page.locator("[data-entry-card]").first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Join the room to vote.")).toBeVisible();
    await sheet.getByRole("button", { name: "Close" }).click();

    // Junk and other contests are dropped.
    expect(await inject(page, "0xdeadbeef")).toBe(false);
    const live = await payloadOf(stage);
    const otherContest = `0x01${(Number(CONTEST) + 100).toString(16).padStart(8, "0")}${live.slice(12)}`;
    expect(await inject(page, otherContest)).toBe(false);

    // The Stage's token gets you in.
    expect(await inject(page, live)).toBe(true);
    await expect(chip(page)).toHaveAttribute("data-state", "in-room", { timeout: 15_000 });
    await expect(chip(page)).toContainText("In the room");

    // Second viewer sees the seat appear without reloading.
    const watcher = await (await browser.newContext()).newPage();
    await watcher.goto(`/c/${CONTEST}`);
    const before = Number((await watcher.getByText(/^\d+$/).first().textContent()) ?? "0");

    const card = page.locator("[data-entry-card]").first();
    await card.click();
    await sheet.getByRole("button", { name: /^Vote for / }).click();
    await expect(page.getByText(/^You voted for/)).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(async () => Number((await watcher.getByText(/^\d+$/).first().textContent()) ?? "0"), { timeout: 20_000 })
      .toBeGreaterThan(before);

    // Second vote is blocked with copy.
    await card.click();
    await expect(
      sheet.getByText("You voted for this entry").or(sheet.getByText("You've already voted in this contest.")),
    ).toBeVisible();
  });

  test("a token older than the window is refused with friendly copy", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const stage = await startStage(browser);
    const old = await payloadOf(stage);
    // Accepted until 120 s after its 10 s slot ends; wait past that.
    await page.waitForTimeout(140_000);

    await page.goto(`/c/${CONTEST}?e2eAccount=1`);
    expect(await inject(page, old)).toBe(true);
    await expect(chip(page)).toContainText("That signal is too old.", { timeout: 15_000 });
    await expect(chip(page)).not.toHaveAttribute("data-state", "in-room");
  });
});
