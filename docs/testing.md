# Testing strategy

Work is **done only when verified**: every change ends with a command or a browser check whose output proves it.

| Layer | Tool | Command | Must cover |
|---|---|---|---|
| Contract unit | Foundry | `pnpm test:contracts` | Every function, every revert (exact error), every boundary |
| Contract fuzz + invariants | Foundry | same (runs = 1000 in CI profile) | The 5 invariants in [contracts.md](contracts.md#invariants-fuzzinvariant-tests-in-arenainvarianttsol) |
| Cross-language parity | Foundry + Vitest | both | Hash chain, payload, Merkle tree, typed data hash match byte-for-byte |
| Web unit | Vitest + jsdom | `pnpm test:web` | Everything in `lib/`, hooks with logic (`usePresence` reducer), error copy completeness |
| Component | Vitest + Testing Library | same | `TxButton` states (Task 9), `Hemicycle` seat count/order (Task 12), `PresenceChip` states (Task 15) |
| E2E | Playwright + Anvil + mock connector | `pnpm e2e` | Flows F1–F7 at 390 px and 1440 px (8 specs below) |
| Visual / UX | headless browser screenshots (Playwright) | manual | Screens saved to `./.shots/`, console clean |
| Real devices | phones + laptop | manual checklist | Sound beacon, Pass QR, camera, wallet apps |

## Contract tests (`contracts/test/`)
Use a shared `ArenaBase.t.sol` with helpers: `_createContest(Presence)`, `_addEntries(n)`, `_warpToVoting()`, `_beaconToken(slot)` (builds the chain in Solidity from a fixed seed), `_checkIn(voter)`.

Ticket-list helper: `ArenaBase` loads `test/fixtures/tickets.json` (4 Anvil addresses, root, proofs) generated once by `web/scripts/make-ticket-fixture.ts` with `@openzeppelin/merkle-tree` (Task 5); Task 8 folds it into `parity.json`.

Required cases (names are the spec; add more freely):
- **Create:** stores every field; emits; each revert in the createContest list with boundary values (title 80 vs 81 bytes; duration 5 min vs 4:59; lead time 60 days vs +1 s; drip 0.01 vs 0.01+1 wei; drip on non-Gated; ticket root/URI mismatch both directions).
- **Entries:** organiser adds in curated; stranger reverts `NotOrganiser`; open allows stranger; 64th ok / 65th reverts; `test_submit_removingEntryFreesLiveSlot` (64 live, remove one, 65th push ok, next reverts); `test_submit_totalCap128` (129th push reverts `TooManyEntries` with a live slot free); `getEntries` returns all 128; per-submitter quota: stranger 3 ok / 4th reverts `TooManyEntriesFromSubmitter`, organiser exempt, separate submitters each get 3, quota is per contest, removal doesn't refund it; `test_submit_griefedContestRecoversAfterRemoval`; pairwise `tooManyEntriesBeatsSubmitterLimit` and `submitterLimitBeatsInvalidPayee`; Arena as payee reverts `InvalidPayee` and as member `InvalidMember`; members 8 ok / 9 reverts; duplicate member and payee-as-member revert `InvalidMember`; submission at `submissionEnd - 1` ok / at `submissionEnd` reverts; remove before votingStart ok / at votingStart reverts; `submitter` stored.
- **Ticket list setter:** organiser only; set/clear; mismatch both directions; `VotingAlreadyStarted` at `votingStart`; `CheckInsStarted` after one check-in (Task 7).
- **Vote (Anywhere):** counts and emits; double vote; own entry as payee, as member, and as non-organiser submitter (reverts); organiser who submitted a curated entry **can** vote for it; removed entry; window `votingStart - 1`, `votingStart`, `votingEnd - 1`, `votingEnd`; ticket list ok/outsider/wrong proof.
- **Check order (pairwise):** `test_order_removedBeatsAlreadyVoted`, `test_order_alreadyVotedBeatsOwnEntry`, `test_order_notCheckedInBeatsBeacon`, `test_order_contestNotFoundFirst` (for every contest-scoped function).
- **Beacon:** current slot ok; `test_beacon_acceptsAtSlotStartMinus30` / `rejectsAtSlotStartMinus31`; `test_beacon_acceptsTokenUpTo120sAfterSlot` (at `slotEnd + 120`) / `test_beacon_rejectsAtSlotEndPlus121`; slot ≥ length; wrong token; gap > 4096 reverts `BeaconGapTooLarge`; `test_advanceBeacon_bridgesGapInHops` (warp 12 h with no votes, advance in two hops of ≤ 4096 with expired links, then a fresh vote works); `advanceBeacon` rejects future slots and tokens not newer than the cache; older-than-cache token accepted by `vote` within the window; cache only moves forward; `beaconStatus`/`isBeaconTokenValid` return statuses instead of reverting; `NotSet` for Anywhere contests; rotation increments `beaconRotation` and invalidates old tokens; `setBeacon` with `start >= votingEnd` reverts `InvalidBeacon`.
- **Gate:** non-gatekeeper reverts; revoke works; double check-in; ticket list enforced at check-in; drip delivered; `test_checkIn_dripToRejectingContract_defers`; `test_checkIn_dripToGasGriefer_defers` (receiver burns all gas); `test_checkIn_dripReturnBomb_defers` (receiver reverts with a huge payload); `msg.value > dripPerCheckIn` reverts; Gated vote without check-in reverts `NotCheckedIn`; Gated vote requires beacon too.
- **Finalize:** single winner gets full prize; 3-way tie splits with dust to organiser; zero votes refunds organiser; removed entries excluded; before `votingEnd` reverts; twice reverts; `withdraw` sends, zeroes, reverts `NothingToClaim`; reentrancy attempt via malicious payee fails. `withdrawTo` sends to the recipient and emits `Withdrawn(caller, amount)`; zero address reverts `InvalidPayee` (before `NothingToClaim`); an ETH-rejecting payee contract routes its prize out; a rejecting recipient reverts `TransferFailed` with the balance kept; reentrancy via `withdrawTo` and cross-function (`withdrawTo` → `withdraw`) both fail. Gas at the 128-entry bound is logged: `test_gas_finalize128EntriesTie` (64-way tie, < 3M) and `test_gas_finalize128EntriesSingleWinner` (< 1M).
- **Fuzz:** `testFuzz_voteCountsMatch(uint8 voters, uint8 entries)`, `testFuzz_tieSplitConservesPrize(uint96 prize, uint8 winners)` — use `bound()` (`winners` 1..64, `entries` 1..64, `voters` 0..200).
- **Invariant:** handler contract with actions create/submit/remove/vote/checkIn/finalize/withdraw/withdrawTo and time warps (submitters at their quota hand over to the organiser); assert invariants 1–5.
- **Scripts:** `Deploy.t.sol` (reverts on chain 1 and unlisted chains, deploys on Anvil); `Seed.t.sol` (`isSeedChain` allows only 11155111/31337, fuzzed; `Seed.run` reverts on chain 1 even with Deploy mocked to allow it; `SeedVotes.run` reverts off Anvil).
- `forge coverage --report summary`: `Arena.sol` and `BeaconChain.sol` ≥ 95% lines, 90% branches.
- `forge snapshot` checked in (`.gas-snapshot`) so gas regressions show in diffs.

## Parity fixtures (the bugs that would kill the demo)
`contracts/test/fixtures/parity.json`, generated **once** by `web/scripts/make-fixtures.ts` and read by both test suites:
```json
{
  "seed": "0x…32 bytes…",
  "chain": { "length": 20, "anchor": "0x…16", "tokensBySlot": { "0": "0x…", "7": "0x…", "19": "0x…" } },
  "payload": { "contestId": 3, "slot": 7, "hex": "0x01…", "base64url": "AQ…" },
  "tickets": { "addresses": ["0x…", "…"], "root": "0x…", "proofs": { "0x…": ["0x…"] } },
  "pass": { "chainId": 31337, "arena": "0x5FbDB2315678afecb367f032d93F642f64180aa3", "contestId": 3, "voter": "0x…", "sessionKey": "0x…", "issuedAt": 1700000000, "typedDataHash": "0x…", "tick": 850000000, "tickDigest": "0x…" }
}
```
Solidity reads it with `vm.readFile` + `vm.parseJson*`; Vitest imports it. Both must pass. If either side changes, regenerate and both must still pass.

## Web unit tests (`web/src/**/*.test.ts`)
- `beacon/chain.test.ts` — chain matches fixture (`tokensBySlot`); `tokenForSlot` = `chain[chain.length - 2 - slot]`; `slotAt(start, now)` returns `null` when `now < start` or past the chain; 60k-link build < 2 s.
- `beacon/payload.test.ts` — roundtrip; rejects wrong version, wrong length, wrong contest.
- `pass.test.ts` — matches the `pass` fixture; binary QR roundtrip is exactly 187 bytes; tick ±2 accepted, ±3 rejected; issuedAt `now - 10 min` ok / `-10 min - 1 s` rejected / `now + 31 s` rejected; tampered `voter`/`contestId`/`sessionKey` fail the tick signature (checked first), tampered `issuedAt` fails the wallet signature; wrong length rejected.
- `tickets.test.ts` — parse with commas/spaces/newlines; mixed case → checksummed; duplicates removed; invalid lines reported with line numbers; > 2000 rejected; root matches fixture.
- `errors.test.ts` — every error in `arenaAbi` has copy (needs `pnpm gen`, done at the start of Task 8); user rejection; unknown.
- `useChainTime` — 40 s offset → warning; normal Sepolia lag (blocks seen 0–12 s late) with a correct clock → **no** warning and offset within 2 s.
- `phase.test.ts` — `submissions | upcoming | voting | ended | finalized` at every boundary.
- `hemicycle.test.ts` — `perSeat = 1` and seats = n for n ∈ {1, 7, 100, 600}; n = 601 → `perSeat = 2`, seats = Σ ceil(groupVotes / 2); n = 0 → placeholder state, 0 seats; order groups entries contiguously; every entry with ≥ 1 vote gets ≥ 1 seat; colour assignment stable by id for ≤ 8 entries, top-7 + Others above.
- `metadata.test.ts` — invalid JSON → fallback, never throws.
- `usePresence` reducer — every transition in the diagram in [frontend.md](frontend.md#presence-state-machine-usepresence).

## E2E (`web/e2e/`)
Setup (`web/playwright.config.ts`): Playwright starts web servers before `globalSetup`, so the first `webServer` is `e2e/chain.ts`: it refuses to run if port 8545 is already taken, starts `anvil --block-time 2 --port 8545`, runs `pnpm deploy:local` (Deploy → Seed → +70 s → SeedVotes) and `pnpm gen` (the app reads `src/deployments/31337.json`), then prints `Arena E2E chain ready`, which Playwright waits for. The second `webServer` is `next dev --port 3000` with `NEXT_PUBLIC_E2E=1 NEXT_PUBLIC_ENABLE_ANVIL=1` (port 3000 must be free; `reuseExistingServer` is off). `e2e/global-setup.ts` checks the stack (Arena at the expected address, chain id 31337, the 3 seeded contests) and warms up every route; `e2e/global-teardown.ts` clears the IPFS stub store (`web/.e2e-ipfs`) unless `PW_EXISTING_STACK=1`. `PW_EXISTING_STACK=1` skips both web servers and reuses a chain + dev server you started yourself (`pnpm chain`, `pnpm deploy:local`, `pnpm gen`, then `next dev` with the two E2E flags). Tests run one at a time (`workers: 1`, `retries: 0`, 120 s per test, 15 s per expect) on the shared chain in two projects, `phone` (iPhone 15 at 390×844) and `desktop` (Desktop Chrome at 1440×900); `finalize.spec.ts` runs last in its own projects (`phone-finalize`, then `desktop-finalize`) because it moves the chain clock past a contest's end. Traces are kept and screenshots taken only on failure.

**E2E mode is tied to the local chain.** Every E2E-only path reads one switch, `isE2E` in `web/src/config/network.ts` (`NEXT_PUBLIC_E2E=1` **and** `NEXT_PUBLIC_ENABLE_ANVIL=1`). Setting `NEXT_PUBLIC_E2E=1` without the local chain, or on a production deployment, throws at config load. The Anvil dev keys live in `web/src/lib/anvilKeys.ts` and are loaded with a dynamic import behind a literal env check, so non-E2E builds don't contain them (check: after `pnpm -C web build`, grepping `web/.next/static` for Anvil key 0 finds nothing).

Helpers (`e2e/helpers.ts`): mock-wallet connect (reconnects after full loads), contest creation straight on the chain, time travel, `cast` reads, and a console guard that fails a test on any `console.error` except the documented seed-placeholder 404s. The mock connector uses Anvil accounts 0–2 (select with `?e2eAccount=1`). **Gate/Stage burners in E2E:** `?e2eBurner=<n>` makes the burner module use Anvil account n's well-known key (E2E mode only), already funded by Anvil. **IPFS in E2E:** the stub described in frontend.md (fake CIDs, `/api/e2e-ipfs/[cid]`, never on a production deployment). Time travel with `cast rpc evm_increaseTime <s>` + `evm_mine` via a helper.

Sound can't be tested in a headless browser, so E2E uses a **test-only beacon injector**: in E2E mode, `window.__arenaInjectBeacon(payloadHex)` feeds the presence state machine as if the sound worker had decoded it. The Stage page exposes the current payload as `data-beacon-payload` for the test to read. Other E2E-only hooks: `window.__arenaGateScan(text)` (the Gate's camera), `window.__arenaSwitchChain(chainId)` (moves the mock wallet to another configured chain), `data-pass` on the Pass QR, and `?preview=reveal|closed` on the Stage.

Specs (each runs in the `phone` and `desktop` projects; 22 tests, 44 runs):
1. `browse.spec.ts` — no wallet: landing shows live contests and links into explore; explore tabs and search filter; contest results visible and voting asks for a wallet; unknown contest shows the not-found page.
2. `create.spec.ts` — create a Room contest with a prize; validation errors for bad inputs; lands on manage; stored on chain.
3. `vote-room.spec.ts` — idle chip; junk and other-contest payloads ignored; Stage payload injected → in the room → vote lands live in a second browser context without reload; a token older than the acceptance window is refused with friendly copy.
4. `gated.spec.ts` — Gate with `?e2eBurner=2`, authorised by the organiser; the voter's Pass (QR text read from `data-pass`) is handed to `__arenaGateScan`; vote refused before check-in, works after; a wallet that hasn't checked in can't vote even with a live room token.
5. `finalize.spec.ts` — time travel past the end; finalise on the Stage; winner reveal; the payee claims and the balance increases.
6. `errors.spec.ts` — a second vote is stopped with copy before the wallet opens; a vote made elsewhere after load is caught by the simulation; cancelling in the wallet (the test answers the mock's `eth_sendTransaction` with a 4001 error, since the mock has no reject switch) shows friendly copy and sends nothing, then trying again works; a wallet moved to Sepolia with `__arenaSwitchChain` gets the "Switch to Foundry" prompt before any action.
7. `manage-submit.spec.ts` — a visitor sees a friendly message instead of the controls; organiser adds an entry, sets a guest list, authorises and funds a gate, removes the entry; curated contests tell visitors only the organiser adds entries; submit validation; open contests let a stranger submit.
8. `stage.spec.ts` — the beacon payload rotates every slot and the room code is on screen; a device clock 40 s behind the network shows the skew chip; `?preview=reveal` shows the leader as winner without touching the chain.

Each spec asserts **no console errors** (`page.on("console")` filter for `error`).

## Visual verification (definition of done for UI tasks)
For each changed screen: open at **390 px** and **1440 px**, both themes, click through every changed flow, confirm the console is clean, save screenshots to `./.shots/<task>-<screen>-<width>-<theme>.png` (gitignored). Run a design review pass (hierarchy, spacing, contrast, focus, states, copy) before marking a UI task done.

## Real devices
Phones need HTTPS for mic/camera: run `pnpm dev`, then `cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`) and open the HTTPS URL on the phone. The tunnel URL is a new origin — add it to the Alchemy and Reown allowlists while testing. Simpler alternative: a Vercel preview deployment against Sepolia.

Checklist before the demo:
- [ ] iPhone Safari + MetaMask mobile (in-app browser) and WalletConnect from Safari: connect, vote.
- [ ] Android Chrome + MetaMask/Rabby: connect, vote.
- [ ] Base Account (passkey) on iPhone and Android, if supported on Sepolia.
- [ ] Beacon heard at 1/5/10 m, quiet and noisy, on each phone (protocol from the spike).
- [ ] QR beacon fallback scanned from the projector at the back of the room.
- [ ] Gate laptop webcam reads Pass QR in < 1 s; a screenshot of a pass is rejected.
- [ ] Gate keeps working with 10 rapid check-ins (queue, no nonce errors).
- [ ] Stage runs 30 min without memory growth (Chrome task manager) and with the laptop plugged in, sleep disabled.
