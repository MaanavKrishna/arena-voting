# Product spec — Arena

## One line
Contests decided by the people actually in the room — votes, prize money and payout enforced by an Ethereum smart contract.

## Problem
1. **Online contest voting is easy to rig.** Anyone can vote from anywhere, with as many accounts as they like.
2. **Organisers are trusted with the prize.** Winners wait for (or never get) the payout, and nobody can audit the count.
3. **Crypto voting is unusable for normal people.** Extensions, seed phrases, gas, confusing pop-ups.

## Solution
- **Ethereum contract holds the rules and the money.** Prize ETH is locked at creation; the contract tallies votes and pays the winner. Anyone can audit on Etherscan.
- **Ground: proof you're in the room.** A door check-in binds your wallet to "was physically here"; an inaudible sound beacon from the stage proves you're still here when you vote. Both are verified by the contract.
- **Seamless voting.** One "Connect" sheet (MetaMask, any browser wallet, WalletConnect, or a passkey smart wallet with Face ID). In Gated contests, check-in drips a little Sepolia ETH so voters never visit a faucet; in other modes voters need a little Sepolia ETH of their own (the app links a faucet).

## Required features (from the brief) and where they live
| Brief requirement | Arena feature |
|---|---|
| Creating polls | Create Contest wizard (`/create`) |
| Connecting an Ethereum wallet | Connect sheet (wagmi v3: injected/EIP-6963, WalletConnect, Base Account passkey) |
| Casting votes | Vote on an entry (`/c/[id]`) — on-chain `vote()` |
| Viewing results | Live hemicycle + ranked list (`/c/[id]`, `/c/[id]/stage`), final results + payout |

## Users
- **Organiser** — runs a hackathon demo day, college fest, design contest. Creates the contest, funds the prize, runs the Stage and Gate devices, finalises.
- **Entrant** — a team or creator. Submits an entry, receives the prize.
- **Voter** — an attendee with a phone. May have never used crypto. Can't vote for an entry they are payee, member or submitter of.
- **Spectator** — anyone browsing results without a wallet.

## Contest settings (organiser chooses)
| Setting | Options | Default |
|---|---|---|
| Submissions | Open (anyone submits) / Curated (organiser adds entries) | Curated |
| Ticket list | Off / On (paste or CSV of wallet addresses, ≤ 2000; frozen once voting or check-in starts) | Off |
| Presence ("Ground") | **Anywhere** (no presence) / **Room** (beacon required) / **Gated** (check-in + beacon) | Room |
| Prize | 0 ETH or any amount, paid by the contract | 0 |
| Gas drip at check-in | 0 – 0.01 ETH per voter (Gated only) | 0.003 |
| Timing | Submissions close → Voting opens → Voting closes | — |

## Core user flows

### F1 — Create a contest (organiser)
1. `/create` → step 1 *Basics*: title (≤ 80 bytes), description (≤ 1000 bytes), cover image (optional, IPFS). All limits are UTF-8 bytes.
2. Step 2 *Timing*: submission close, voting open, voting close (presets: "Demo day today", "This weekend", custom). Validation mirrors [contracts.md](contracts.md) exactly.
3. Step 3 *Who can vote*: presence mode, ticket list, gas drip (the drip field only appears for Gated and is sent as 0 otherwise — the contract rejects a non-zero drip outside Gated).
4. Step 4 *Prize*: amount in ETH (shows USD estimate only if a price source is added later — not in scope).
5. Review card (live preview on desktop, sheet on phone) → **Create** → wallet confirms `createContest` with `value = prize`.
6. Success: redirect to `/c/[id]/manage` with a checklist: add entries, set up Stage (beacon), set up Gate, share link.

### F2 — Submit an entry (entrant or organiser)
1. `/c/[id]/submit`: name, tagline, description, image, links, payee address (defaults to connected wallet), team member addresses (≤ 8).
2. Metadata JSON + image uploaded to IPFS via `/api/upload` (the only server code).
3. `submitEntry` tx → entry appears in the gallery live.
4. Curated contests: only the organiser sees this page; open contests: anyone, until submissions close.

### F3 — Check in at the door (Gated only)
1. Voter opens the contest link (from the poster QR) → Connect sheet → wallet connected.
2. Taps **Get my pass** → wallet approves once (no fee) → phone shows a big **animated Pass QR** that changes every 2 s, so screenshots are useless.
3. Holds the phone up to the Gate device's camera. Gate verifies signature + ticket list off-chain, then sends `checkIn` from its gatekeeper wallet, dripping gas ETH.
4. Voter's phone flips to **"You're in ✓"** when the `CheckedIn` event lands (~12 s); Gate shows a green flash immediately and is ready for the next person (it does not wait for confirmation).

### F4 — Vote (voter)
1. `/c/[id]` shows the entries gallery (3D tilt cards on desktop, stacked cards on phone).
2. Room/Gated: a **presence chip** at the bottom: "Listening for the room…" → "In the room ✓" when a valid beacon token is heard. Mic permission is asked on first tap of **Listen**, with a one-line reason.
3. Tap an entry → detail sheet → **Vote for this** → wallet confirm → optimistic "Vote sent" → confirmed state with a beam animation into the hemicycle.
4. Fallback if the mic fails: "Can't hear the room? **Scan the screen**" — opens the camera to read the beacon QR shown on the Stage.

### F5 — Watch results (anyone)
- `/c/[id]`: hemicycle (one seat per vote, coloured by entry) + ranked list with number tickers. Updates live (poll every 4 s).
- `/c/[id]/stage`: projector mode. Left: hemicycle and top 5. Right: big join QR and counters (votes; plus checked-in wallets in Gated mode — Room mode has no on-chain count of listeners). Bottom: beacon status. When voting closes: **Winner reveal** sequence.

### F6 — Finalise and get paid
1. After voting closes, anyone presses **Finalise** (or the Stage triggers it for the organiser).
2. Contract computes winner(s); ties split equally; no votes → prize refunded to the organiser.
3. Winners see **Claim prize** on `/c/[id]` and `/me` → `withdraw()`.

### F7 — Organiser control room (`/c/[id]/manage`)
- Entries: add (curated), remove (only before voting opens).
- Stage: open `/c/[id]/stage` on the projector laptop → it generates the beacon chain → organiser confirms `setBeacon`.
- Gate: open `/c/[id]/gate` on the door device → shows its burner address → organiser presses **Authorise this gate** (`setGatekeeper`) and **Fund gate** (sends ETH to the burner).
- Stage: the Stage page also creates a burner key for `advanceBeacon`; **Fund stage** sends it ~0.02 Sepolia ETH.
- Ticket list: paste/CSV → `setTicketList` (only before voting opens and before the first check-in).
- Live stats: checked in, votes, beacon health (last token time), gate balance.

## Pages
| Route | Purpose |
|---|---|
| `/` | Landing: hero, how it works (3 steps), live contests strip |
| `/explore` | All contests: tabs Live / Upcoming / Ended, search |
| `/create` | Create contest wizard |
| `/c/[id]` | Contest: gallery, vote, live results, claim |
| `/c/[id]/submit` | Submit entry |
| `/c/[id]/stage` | Projector + beacon |
| `/c/[id]/gate` | Check-in kiosk |
| `/c/[id]/manage` | Organiser control room |
| `/me` | My contests, entries, votes, claimable prizes |
| `/system` | Living design system page |

## Copy and voice
Plain, warm, short. Never say "transaction", "gas", "sign", "hash" in primary copy — say "confirm in your wallet", "network fee", "approve". Technical detail goes in a "Details" disclosure (tx hash, block, Etherscan link). Error messages say what happened and what to do next.

## Scope

**Core (must ship):** F1, F2 (curated + open), F4 in *Anywhere* and *Room* modes, QR beacon, F5, F6, Connect sheet, design system, `/system`, Sepolia deploy, Vercel deploy.

Room mode needs **at least one beacon transport**: the QR beacon is core (it always works); sound is the upgrade.

**Core-plus (ship if the device spike passes):** F3 Gated mode, gas drip, Stage beacon over sound.

**Stretch:** `/me` page polish, judge-weighted votes, ENS names/avatars, winner reveal sequence with confetti, sponsored gas (ERC-4337 paymaster), Blind mode (hide live tallies in the UI).

**Network (current phase):** Ethereum **Sepolia testnet** (chain id `11155111`); local development on Anvil (`31337`). All ETH in the app — prizes, drips, fees — is free test ETH with no real value, and the UI says so. Mainnet is a possible later phase, only by the owner's decision and after the checklist in decisions D-21.

**Non-goals (this phase):** mainnet deployment, multiple-choice/ranked ballots, token prizes (ERC-20), private ballots, moderation tooling beyond pre-voting removal, mobile native apps.

**Cut order if behind:** Stretch items → `/me` → sound beacon (keep QR beacon) → Gated mode (keep Room) → open submissions (keep curated). Never cut: the four brief requirements, prize payout, Room mode, design quality.

## Honest limits (repeat in README)
- One wallet is not one human. Ticket lists and Gated mode limit abuse; proof-of-personhood is future work.
- The organiser is trusted for **presence** (they hold the beacon seed and gatekeeper keys) but not for **tallies or payouts**, which the contract enforces.
- A decoded beacon token is data and can be forwarded within its ~2-minute window. Gated mode means only wallets that physically checked in can use it. See [ground-presence.md](ground-presence.md#threat-model).
- Votes are public on-chain (who voted for what).
