import { expect, test, type Page } from "@playwright/test";

/**
 * Organiser control room and entry submission. Expects the local E2E stack (Anvil + `next dev` with
 * NEXT_PUBLIC_E2E=1) and a freshly created contest whose id is in `E2E_MANAGE_CONTEST` (curated,
 * Gated, voting not yet open). Account 0 is the organiser, account 1 a visitor.
 */
const CONTEST = process.env.E2E_MANAGE_CONTEST ?? "5";
const GATE = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const GUEST_A = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const GUEST_B = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

async function connect(page: Page, path: string, wallet: "A" | "B" | "C" = "A") {
  await page.goto(path);
  await page.getByRole("button", { name: "Connect" }).first().click();
  await page.getByRole("button", { name: new RegExp(`Test wallet ${wallet}`) }).click();
  await expect(page.getByRole("button", { name: /^Account 0x/ })).toBeVisible();
}

test.describe("organiser control room", () => {
  test("a visitor sees a friendly message instead of the controls", async ({ page }) => {
    await connect(page, `/c/${CONTEST}/manage`, "B");
    await expect(page.getByRole("heading", { name: "This is the organiser's page" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the contest" })).toBeVisible();
  });

  test("organiser adds an entry, sets a guest list, authorises and funds a gate, removes the entry", async ({ page }) => {
    await connect(page, `/c/${CONTEST}/manage`, "A");
    await expect(page.getByRole("heading", { name: "Get ready" })).toBeVisible();

    // add an entry through the sheet
    await page.getByRole("button", { name: "Add entry" }).click();
    await page.getByLabel("Name", { exact: true }).fill("E2E Rocket Cart");
    await page.getByLabel(/^Tagline/).fill("Fast and loud");
    await page.getByRole("button", { name: "Add a link" }).click();
    await page.getByLabel("Label").fill("Demo");
    await page.getByLabel("Link", { exact: true }).fill("http://nope");
    await expect(page.getByText("Links must start with https://")).toBeVisible();
    await page.getByLabel("Link", { exact: true }).fill("https://example.com");
    await page.getByLabel("Prize wallet").fill(GUEST_B);
    await page.getByRole("button", { name: "Submit entry" }).click();
    await expect(page.getByText("E2E Rocket Cart")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /Add entries: done/ })).toBeVisible();

    // guest list: bad line blocks, then publish
    const list = page.getByLabel(/Wallet addresses|Replace the list/);
    await list.fill(`${GUEST_A}\nnot-an-address`);
    await expect(page.getByText(/isn't a wallet address/)).toBeVisible();
    await list.fill(`${GUEST_A}, ${GUEST_B}`);
    await page.getByRole("button", { name: /(Save|Replace) guest list/ }).click();
    await expect(page.getByText("2 wallets on the list.")).toBeVisible({ timeout: 30_000 });

    // gate: authorise then fund
    await page.getByLabel("Gate address").fill(GATE);
    await page.getByRole("button", { name: "Authorise this gate" }).click();
    await expect(page.getByRole("link", { name: /Set up the gate: done/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Fund gate" }).click();
    await page.getByRole("button", { name: "Send to the gate" }).click();
    await expect(page.getByText(/Sent 0\.05 .* to the gate/)).toBeVisible({ timeout: 30_000 });

    // remove the entry with confirmation
    await page.getByRole("button", { name: "Remove E2E Rocket Cart" }).click();
    await page.getByRole("button", { name: "Remove entry" }).click();
    await expect(page.getByText("Entry removed.")).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("entry submission", () => {
  test("curated contests tell visitors only the organiser adds entries", async ({ page }) => {
    await connect(page, `/c/${CONTEST}/submit`, "B");
    await expect(page.getByRole("heading", { name: "Only the organiser adds entries here" })).toBeVisible();
  });

  test("validation explains what to fix before the button enables", async ({ page }) => {
    await connect(page, `/c/${CONTEST}/submit`, "A");
    await expect(page.getByRole("button", { name: "Submit entry" })).toBeDisabled();
    await page.getByLabel("Name", { exact: true }).fill("Team");
    await page.getByRole("button", { name: "Add a team member" }).click();
    await page.getByLabel("Team member 1").fill("0xnope");
    await page.getByLabel("Team member 1").blur();
    await expect(page.getByText(/doesn't look like a wallet address/)).toBeVisible();
  });
});
