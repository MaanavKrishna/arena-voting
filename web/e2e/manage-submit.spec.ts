import { parseEther } from "viem";
import {
  ACCOUNTS,
  Presence,
  balanceOf,
  castRead,
  createContest,
  expect,
  getContest,
  getEntries,
  openAs,
  test,
} from "./helpers";

/**
 * F7 — organiser control room and entry submission (docs/testing.md spec 7). Each test makes its own
 * contest with voting a while off (entries can still change). Account 0 organises, account 1 visits.
 */
const GATE = ACCOUNTS[3];
const GUEST_A = ACCOUNTS[1];
const GUEST_B = ACCOUNTS[2];

const curatedGated = () =>
  createContest({ presence: Presence.Gated, opensIn: 3600, title: `E2E Manage ${Date.now().toString(36)}` });

test.describe("organiser control room", () => {
  test("a visitor sees a friendly message instead of the controls", async ({ page }) => {
    const { id } = await curatedGated();
    await openAs(page, `/c/${id}/manage`, 1);
    await expect(page.getByRole("heading", { name: "This is the organiser's page" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the contest" })).toBeVisible();
  });

  test("organiser adds an entry, sets a guest list, authorises and funds a gate, removes the entry", async ({
    page,
  }) => {
    const { id } = await curatedGated();
    await openAs(page, `/c/${id}/manage`, 0);
    await expect(page.getByRole("heading", { name: "Get ready" })).toBeVisible();

    // Add an entry through the sheet; a bad link is explained first.
    await page.getByRole("button", { name: "Add entry" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Name", { exact: true }).fill("E2E Rocket Cart");
    await sheet.getByLabel(/^Tagline/).fill("Fast and loud");
    await sheet.getByRole("button", { name: "Add a link" }).click();
    await sheet.getByLabel("Label").fill("Demo");
    await sheet.getByLabel("Link", { exact: true }).fill("http://nope");
    await sheet.getByLabel("Link", { exact: true }).blur();
    await expect(sheet.getByLabel("Link", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(sheet.getByLabel("Link", { exact: true })).toHaveAccessibleDescription(/https:\/\//);
    await sheet.getByLabel("Link", { exact: true }).fill("https://example.com");
    await sheet.getByLabel("Prize wallet").fill(GUEST_B);
    await sheet.getByRole("button", { name: "Submit entry" }).click();
    await expect(page.getByText("E2E Rocket Cart").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /Add entries: done/ })).toBeVisible();
    await expect.poll(async () => (await getEntries(id)).length, { timeout: 15_000 }).toBe(1);
    expect((await getEntries(id))[0].payee).toBe(GUEST_B);

    // Guest list: a bad line blocks, then publish sets the root on chain.
    const list = page.getByLabel(/Wallet addresses|Replace the list/);
    await list.fill(`${GUEST_A}\nnot-an-address`);
    await expect(page.getByText(/isn't a wallet address/)).toBeVisible();
    await list.fill(`${GUEST_A}, ${GUEST_B}`);
    await page.getByRole("button", { name: /(Save|Replace) guest list/ }).click();
    await expect(page.getByText("2 wallets on the list.")).toBeVisible({ timeout: 30_000 });
    const withList = await getContest(id);
    expect(withList.ticketRoot).not.toBe(`0x${"0".repeat(64)}`);
    expect(withList.ticketListURI).toMatch(/^ipfs:\/\//);

    // Gate: authorise, then fund.
    const gateBefore = balanceOf(GATE);
    await page.getByLabel("Gate address").fill(GATE);
    await page.getByRole("button", { name: "Authorise this gate" }).click();
    await expect(page.getByRole("link", { name: /Set up the gate: done/ })).toBeVisible({ timeout: 30_000 });
    expect(castRead("isGatekeeper(uint256,address)(bool)", id, GATE)).toBe("true");
    await page.getByRole("button", { name: "Fund gate" }).click();
    await page.getByRole("button", { name: "Send to the gate" }).click();
    await expect(page.getByText(/Sent 0\.05 .* to the gate/)).toBeVisible({ timeout: 30_000 });
    expect(balanceOf(GATE) - gateBefore).toBe(parseEther("0.05"));

    // Remove the entry, with confirmation.
    await page.getByRole("button", { name: "Remove E2E Rocket Cart" }).click();
    await page.getByRole("button", { name: "Remove entry" }).click();
    await expect(page.getByText("Entry removed.")).toBeVisible({ timeout: 30_000 });
    expect((await getEntries(id))[0].removed).toBe(true);
  });
});

test.describe("entry submission", () => {
  test("curated contests tell visitors only the organiser adds entries", async ({ page }) => {
    const { id } = await curatedGated();
    await openAs(page, `/c/${id}/submit`, 1);
    await expect(page.getByRole("heading", { name: "Only the organiser adds entries here" })).toBeVisible();
  });

  test("validation explains what to fix before the button enables", async ({ page }) => {
    const { id } = await curatedGated();
    await openAs(page, `/c/${id}/submit`, 0);
    await expect(page.getByRole("button", { name: "Submit entry" })).toBeDisabled();
    await page.getByLabel("Name", { exact: true }).fill("Team");
    await page.getByRole("button", { name: "Add a team member" }).click();
    const member = page.getByRole("textbox", { name: "Team member 1" });
    await member.fill("0xnope");
    await member.blur();
    await expect(member).toHaveAttribute("aria-invalid", "true");
    await expect(member).toHaveAccessibleDescription(/doesn't look like a wallet address/);
    await expect(page.getByRole("button", { name: "Submit entry" })).toBeDisabled();
  });

  test("open contests let a stranger submit an entry", async ({ page }) => {
    const { id } = await createContest({ openSubmissions: true, opensIn: 3600, title: `E2E Open ${Date.now().toString(36)}` });
    await openAs(page, `/c/${id}/submit`, 1);
    await expect(page.getByRole("heading", { name: "Submit your entry" })).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill("Stranger Danger");
    await page.getByLabel(/^Tagline/).fill("Walked in off the street");
    // The prize wallet defaults to the connected one.
    await expect(page.getByLabel("Prize wallet")).toHaveValue(new RegExp(GUEST_A, "i"));
    await page.getByRole("button", { name: "Submit entry" }).click();
    await expect.poll(async () => (await getEntries(id)).length, { timeout: 30_000 }).toBe(1);
    const [entry] = await getEntries(id);
    expect(entry.payee).toBe(GUEST_A);
    expect(entry.submitter).toBe(GUEST_A);
    // The app moves on to the contest page, where the new entry shows. (Not page.goto: cutting the
    // page's in-flight chain reads makes WebKit log a page error.)
    await expect(page).toHaveURL(new RegExp(`/c/${id}(\\?|$)`), { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Stranger Danger" })).toBeVisible();
  });
});
