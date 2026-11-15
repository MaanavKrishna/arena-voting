import { expect, test } from "./helpers";

/**
 * F1 — browsing with no wallet (docs/testing.md spec 1). Uses the three seeded contests:
 * 1 "Campus Hack Night demo" (Anywhere, 2 seed votes), 2 "Lecture Hall showdown" (Room),
 * 3 "Demo Day finals" (Gated).
 */
test.describe("browse without a wallet", () => {
  test("landing shows the live contests and links into explore", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Arena" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect", exact: true }).first()).toBeVisible();

    // The strip shows the three newest live contests (on a fresh chain: the seeded ones; later in
    // the run, contests other specs made).
    const live = page.getByRole("region", { name: "Live contests" });
    const cards = live.getByRole("link", { name: /^Live / });
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeLessThanOrEqual(3);
    await expect(live.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/explore");

    await page.getByRole("link", { name: "Explore" }).first().click();
    await expect(page).toHaveURL(/\/explore/);
    await expect(page.getByRole("heading", { level: 1, name: "Explore" })).toBeVisible();
  });

  test("explore tabs and search filter the list", async ({ page }) => {
    await page.goto("/explore");
    const tabs = page.getByRole("radiogroup", { name: "Contest status" });
    await expect(tabs.getByRole("radio", { name: "Live" })).toBeChecked();
    const panel = page.getByRole("tabpanel");
    for (const title of ["Campus Hack Night demo", "Lecture Hall showdown", "Demo Day finals"]) {
      await expect(panel.getByRole("link", { name: new RegExp(title) })).toBeVisible();
    }

    // Search narrows the live list.
    await page.getByRole("searchbox", { name: "Search contests" }).fill("Lecture");
    await expect(panel.getByRole("link", { name: /Lecture Hall showdown/ })).toBeVisible();
    await expect(panel.getByRole("link", { name: /Campus Hack Night demo/ })).toHaveCount(0);
    await page.getByRole("searchbox", { name: "Search contests" }).fill("");

    // The other tabs switch the panel; none of the seeded contests has ended yet.
    await tabs.getByRole("radio", { name: "Ended" }).click();
    await expect(tabs.getByRole("radio", { name: "Ended" })).toBeChecked();
    await expect(page.getByRole("tabpanel")).toBeVisible();
    await expect(page.getByRole("tabpanel").getByRole("link", { name: /Campus Hack Night demo/ })).toHaveCount(0);

    await tabs.getByRole("radio", { name: "Upcoming" }).click();
    await expect(tabs.getByRole("radio", { name: "Upcoming" })).toBeChecked();
    await expect(page.getByRole("tabpanel").getByRole("link", { name: /Campus Hack Night demo/ })).toHaveCount(0);

    await tabs.getByRole("radio", { name: "Live" }).click();
    await page.getByRole("tabpanel").getByRole("link", { name: /Campus Hack Night demo/ }).click();
    await expect(page).toHaveURL(/\/c\/1$/);
  });

  test("contest results are visible and voting asks for a wallet", async ({ page }) => {
    await page.goto("/c/1");
    await expect(page.getByRole("heading", { level: 1, name: "Campus Hack Night demo" })).toBeVisible();

    const results = page.getByRole("region", { name: "Results" });
    await expect(results).toBeVisible();
    await expect(results.getByRole("img", { name: "Results: Entry 1 1 vote, Entry 2 1 vote." })).toBeVisible();
    await expect(results.getByRole("list", { name: "Ranking" }).getByRole("listitem")).toHaveCount(3);

    await page.locator("[data-entry-card]").first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Entry 1" })).toBeVisible();
    await sheet.getByRole("button", { name: "Connect wallet" }).click();
    // The Connect sheet opens with the test wallet on offer.
    await expect(page.getByRole("dialog", { name: "Connect a wallet" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Test wallet/ })).toBeVisible();
  });

  test("an unknown contest shows a friendly not-found page", async ({ page }) => {
    await page.goto("/c/999999");
    await expect(page.getByText(/couldn.t find|doesn.t exist/i).first()).toBeVisible();
  });
});
