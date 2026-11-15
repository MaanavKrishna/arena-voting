import { formatEther } from "viem";
import { ACCOUNTS, Presence, expect, getContest, openAs, test } from "./helpers";

/** F2 — create a Room contest with a prize through the wizard (docs/testing.md spec 2). */
test("create a Room contest: validation, prize, lands on manage, stored on chain", async ({ page }) => {
  const title = `E2E Room ${Date.now().toString(36)}`;
  await openAs(page, "/create", 0);
  const next = page.getByRole("button", { name: "Next", exact: true });

  // Step 1: a name is required.
  await next.click();
  await expect(page.getByText("Give your contest a name.")).toBeVisible();
  await page.getByRole("textbox", { name: "Contest name" }).fill(title);
  await page.getByRole("textbox", { name: "Description (optional)" }).fill("Made by the E2E suite.");
  await expect(page.getByText("Give your contest a name.")).toHaveCount(0);
  await next.click();

  // Step 2: bad timing is explained, a quick start fixes it.
  await expect(page.getByRole("heading", { name: "When does it happen?" })).toBeVisible();
  await page.getByRole("button", { name: /^Demo day today/ }).click();
  const opens = await page.getByRole("textbox", { name: "Voting opens" }).inputValue();
  await page.getByRole("textbox", { name: "Voting closes" }).fill(opens);
  await next.click();
  await expect(page.getByText("Voting has to close after it opens.")).toBeVisible();
  await page.getByRole("button", { name: /^Demo day today/ }).click();
  await expect(page.getByText("Voting has to close after it opens.")).toHaveCount(0);
  await next.click();

  // Step 3: Room is the default.
  await expect(page.getByRole("heading", { name: "Who can vote?" })).toBeVisible();
  const where = page.getByRole("radiogroup", { name: "Where people vote from" });
  await where.getByRole("radio", { name: "Room" }).click();
  await expect(where.getByRole("radio", { name: "Room" })).toBeChecked();
  await next.click();

  // Step 4: a bad prize is explained, then a real one.
  await expect(page.getByRole("heading", { name: "Set the prize" })).toBeVisible();
  const prize = page.getByRole("textbox", { name: "Prize" });
  await prize.fill("lots");
  await prize.blur();
  await expect(page.getByText("Enter an amount like 0.05, or 0 for no prize.")).toBeVisible();
  await prize.fill("0.02");
  await expect(page.getByText("Enter an amount like 0.05, or 0 for no prize.")).toHaveCount(0);
  const review = page.getByRole("region", { name: "Check everything" });
  await expect(review).toContainText(title);
  await expect(review).toContainText("People in the room");
  await expect(review).toContainText("0.02");

  await page.getByRole("button", { name: "Create contest" }).click();
  await expect(page).toHaveURL(/\/c\/\d+\/manage$/, { timeout: 45_000 });
  const id = /\/c\/(\d+)\/manage/.exec(page.url())![1];
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(title).first()).toBeVisible();

  // The chain agrees: organiser, presence Room (1), prize 0.02.
  const view = await getContest(id);
  expect(view.organiser).toBe(ACCOUNTS[0]);
  expect(view.title).toBe(title);
  expect(view.presence).toBe(Presence.Room);
  expect(formatEther(view.prize)).toBe("0.02");
});
