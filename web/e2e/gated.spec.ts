import { parseEther } from "viem";
import { arenaAbi } from "../src/generated";
import {
  ACCOUNTS,
  ARENA,
  Presence,
  balanceOf,
  castRead,
  createContest,
  expect,
  getEntries,
  injectBeacon,
  openAs,
  openVoting,
  presenceChip,
  publicClient,
  stagePayload,
  startStage,
  test,
  waitForInjector,
} from "./helpers";

/**
 * F4 — door check-in (docs/testing.md spec 4). A fresh Gated contest with a 0.003 drip: account 0
 * organises (Manage + Stage), the Gate runs with `?e2eBurner=2` (Anvil account 2's key), account 1
 * votes. The pass QR text comes from the panel's `data-pass` and goes to the Gate through
 * `window.__arenaGateScan`, standing in for the camera.
 */
test("gate authorised by the organiser checks a voter in; vote is refused before and works after", async ({
  page,
  newContext,
}) => {
  const gateAddress = ACCOUNTS[2];
  const voter = ACCOUNTS[1];
  const c = await createContest({
    presence: Presence.Gated,
    dripEth: "0.003",
    title: `E2E Gated ${Date.now().toString(36)}`,
    entries: [
      { payee: ACCOUNTS[5], name: "Door Prize Robot" },
      { payee: ACCOUNTS[6], name: "Hallway Hologram" },
    ],
  });
  await openVoting(c.votingStart);
  const id = c.id;

  // The Gate device shows its address and waits to be authorised.
  const gateCtx = await newContext({ viewport: { width: 1280, height: 800 } });
  const gate = await gateCtx.newPage();
  await gate.goto(`/c/${id}/gate?e2eBurner=2`);
  await expect(gate.getByRole("heading", { name: "Authorise this gate" })).toBeVisible({ timeout: 30_000 });

  // The organiser authorises it from Manage.
  const orgCtx = await newContext({ viewport: { width: 1440, height: 900 } });
  const organiser = await orgCtx.newPage();
  await openAs(organiser, `/c/${id}/manage`, 0);
  await organiser.getByLabel("Gate address").fill(gateAddress);
  await organiser.getByRole("button", { name: "Authorise this gate" }).click();
  await expect.poll(() => castRead("isGatekeeper(uint256,address)(bool)", id, gateAddress), { timeout: 30_000 }).toBe("true");
  await expect(gate.getByRole("status").filter({ hasText: /camera|Ready/ })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => gate.evaluate(() => typeof window.__arenaGateScan === "function")).toBe(true);

  // The room signal is on (Gated needs the beacon too).
  const stage = await startStage(newContext, id);

  // The voter sees the door pass, not the vote.
  await openAs(page, `/c/${id}`, 1);
  const pass = page.locator("[data-pass-state]");
  await expect(pass).toBeVisible();
  await page.locator("[data-entry-card]").first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Check in at the door, then join the room to vote.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Vote for / })).toBeDisabled();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();

  // Get the pass (one signature), hand its QR text to the Gate.
  const before = balanceOf(voter);
  await pass.getByRole("button", { name: "Get my pass" }).click();
  await expect(pass).toHaveAttribute("data-pass", /.+/, { timeout: 30_000 });
  const text = (await pass.getAttribute("data-pass"))!;
  await gate.evaluate((t) => window.__arenaGateScan!(t), text);
  await expect(gate.getByText("Checked in").first()).toBeVisible({ timeout: 30_000 });

  // Once the check-in lands the pass gives way to the room chip (Gated needs both); the drip arrived.
  await expect.poll(() => castRead("voterState(uint256,address)(uint32,bool)", id, voter), { timeout: 30_000 }).toMatch(
    /^0\s+true$/m,
  );
  await expect(pass).toHaveCount(0, { timeout: 30_000 });
  await expect(presenceChip(page)).toHaveAttribute("data-state", "idle");
  expect(balanceOf(voter) - before).toBe(parseEther("0.003"));

  // Checked in, now the room: inject the Stage's token and vote.
  await waitForInjector(page);
  expect(await injectBeacon(page, await stagePayload(stage))).toBe(true);
  await expect(presenceChip(page)).toHaveAttribute("data-state", "in-room", { timeout: 15_000 });
  await page.locator("[data-entry-card]").first().click();
  await sheet.getByRole("button", { name: /^Vote for / }).click();
  await expect(page.getByText(/^You voted for/).first()).toBeVisible({ timeout: 30_000 });
  const entries = await getEntries(id);
  expect(entries[0].votes).toBe(1);
});

test("a wallet that hasn't checked in can't vote, even with a live room token", async ({
  page,
  newContext,
}) => {
  const c = await createContest({
    presence: Presence.Gated,
    title: `E2E Gated refuse ${Date.now().toString(36)}`,
    entries: [{ payee: ACCOUNTS[5], name: "Door Prize Robot" }],
  });
  await openVoting(c.votingStart);
  const stage = await startStage(newContext, c.id);

  await openAs(page, `/c/${c.id}`, 2);
  await expect(page.locator("[data-pass-state]")).toBeVisible();
  // Not checked in: the page never offers the vote, whatever the room says.
  await waitForInjector(page).catch(() => undefined);
  await injectBeacon(page, await stagePayload(stage));
  await page.locator("[data-entry-card]").first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/Check in at the door/)).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Vote for / })).toBeDisabled();
  expect(castRead("voterState(uint256,address)(uint32,bool)", c.id, ACCOUNTS[2])).toMatch(/^0\s+false$/m);

  // And the contract itself refuses it with the live token: NotCheckedIn.
  const live = await stagePayload(stage);
  const beacon = { slot: Number.parseInt(live.slice(12, 20), 16), token: `0x${live.slice(20)}` as const };
  const err = await publicClient
    .simulateContract({
      address: ARENA,
      abi: arenaAbi,
      functionName: "vote",
      args: [BigInt(c.id), 1, beacon, []],
      account: ACCOUNTS[2],
    })
    .then(() => null, (e: unknown) => e);
  expect(String(err)).toContain("NotCheckedIn");
});
