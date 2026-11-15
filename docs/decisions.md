# Decision log

Format: context → decision → alternatives rejected → consequences. Add a new entry whenever a choice in these docs changes; never silently edit an old decision — mark it *Superseded by D-xx*.

## D-01 · Product angle: contests decided in the room ("Arena" + "Ground")
- **Context:** The brief (create polls, connect wallet, vote, view results) produces generic apps. Needed a unique angle that's demoable and still uses Ethereum for real.
- **Decision:** Contest voting with on-chain prize escrow and payout, plus presence-verified voting.
- **Rejected:** Generic polls (not distinctive); sealed commit-reveal ballots as the core (needs a second "reveal" visit, which hurts seamlessness — kept as a possible stretch); quadratic/budget voting (harder to explain in a 2-minute demo).
- **Consequence:** Scope is bigger than a poll app; strict cut order in [product.md](product.md#scope).

## D-02 · Presence without a server
- **Context:** Requirement: built on Ethereum. A backend "presence oracle" would move trust off-chain.
- **Decision:** All presence rules verified by the contract: hash-chain beacon (Room) + gatekeeper check-in (Gated).
- **Rejected:** Backend oracle signing passes; GPS (trivially spoofed, can't be verified on-chain); NFC NTAG 424 SUN tags (verification needs a secret AES key — can't live in a contract); rotating QR alone (photographed and forwarded).
- **Consequence:** Organiser is trusted for presence (documented). No server to run on demo day.

## D-03 · Hash chain instead of signatures for beacon tokens
- **Context:** Data-over-sound carries tens of bytes per second. A signed token is ~73 bytes.
- **Decision:** One-way keccak hash chain, 16-byte tokens, 25-byte payload, 10 s slots, verified on-chain with a cached link.
- **Rejected:** ECDSA-signed tokens (3× longer transmission, lower reliability); HMAC (needs a shared secret on-chain).
- **Consequence:** Contract has a bounded hashing loop (≤ 4096 steps) and an `advanceBeacon` helper.

## D-04 · Wallet UI: wagmi 3 + our own Connect sheet
- **Context (checked 2026-11-15):** RainbowKit 2.2.11 peer-requires wagmi ^2.9; ConnectKit 1.9.2 requires wagmi 2 and React ≤ 18. wagmi latest is 3.7.11.
- **Decision:** wagmi 3 + custom `ConnectSheet` (EIP-6963 injected wallets, WalletConnect with our QR, Base Account passkeys).
- **Rejected:** Downgrade to wagmi 2 for RainbowKit (old major, conflicts with "latest dependencies"); Reown AppKit (works with wagmi 3 but imposes its own visual style and weight).
- **Consequence:** More UI work, full design control. Revisit if RainbowKit ships wagmi 3 support.

## D-05 · TypeScript 6.0.3, not 7
- **Context:** TypeScript 7.0.2 is latest, but typescript-eslint 8.72.2 supports `<6.1.0`.
- **Decision:** Pin `typescript@6.0.3`.
- **Consequence:** Revisit when typescript-eslint supports 7.

## D-06 · Sound transport — ggwave, pending the device spike
- **Context:** ggwave 0.4.0 is the only mature browser data-over-sound library but is unmaintained since 2022.
- **Decision:** Use it behind `lib/beacon/sound.ts`, in a Worker. Protocol and binary vs text payload chosen by the spike.
- **Spike results:** _fill in after Task 1: devices, protocols, distances, decode times, verdict (ultrasound / audible / QR primary)._
- **Consequence:** If the spike fails, QR beacon becomes primary and sound an optional extra — the contract doesn't change.

## D-07 · Gas for voters: drip at check-in
- **Context:** Attendees won't have Sepolia ETH; faucets are a terrible first experience.
- **Decision:** Gatekeeper forwards up to `dripPerCheckIn` (default 0.003 ETH, max 0.01) inside `checkIn`.
- **Rejected:** ERC-4337 paymaster (third-party service and extra setup; stretch only); meta-transactions via a relayer (needs a server).
- **Consequence:** Only Gated mode gets free gas. Room-mode voters need their own Sepolia ETH (copy links to a faucet).

## D-08 · Live Pass QR with a session key
- **Context:** A static signed pass can be screenshotted and shown by someone else.
- **Decision:** Wallet signs once over an in-memory session key; the QR animates every 2 s with a tick signed by that key.
- **Consequence:** Gate needs ±2-tick clock tolerance; phone and Gate clocks only need to agree within ~4 s (both use device time; acceptable).

## D-09 · Pull payments for prizes
- **Decision:** `finalize` credits `claimable`; winners `withdraw`. Ties split equally, dust to organiser, no votes = refund.
- **Rejected:** Pushing prizes inside `finalize` (one reverting payee blocks everyone).

## D-10 · Off-chain metadata on IPFS through one route handler
- **Decision:** Entry/contest descriptions and images on IPFS via Pinata signed upload URLs from `/api/upload`; only the URI on-chain.
- **Rejected:** Everything on-chain (expensive); client-side Pinata key (leaks the secret).
- **Consequence:** One small piece of server code; metadata availability depends on IPFS gateways (fallback list).

## D-11 · Next.js 16 instead of Vite
- **Context:** Owner's choice (Next.js + TypeScript + Tailwind + motion.dev).
- **Decision:** Next 16.4 App Router, client islands for wallet code, route handler for uploads, `generateMetadata` for share previews.

## D-12 · Exact version pins
- **Decision:** No `^` ranges in package.json; update deliberately with `pnpm outdated` and re-run all tests.
- **Consequence:** Reproducible builds; agents must not "upgrade while passing through".

## D-13 · Gated mode needs a regular wallet (EOA)
- **Context:** Passkey smart wallets (Base Account) produce WebAuthn / ERC-6492 signatures of hundreds of bytes to kilobytes; the Pass QR must stay ~190 bytes to scan in under a second.
- **Decision:** Binary 187-byte Pass; Gated contests hide the Face ID option in the Connect sheet. Room/Anywhere contests still offer it.
- **Rejected:** Multi-frame animated QR for large signatures (slow, fragile at a busy door).
- **Consequence:** Spike records a real Base Account signature size to confirm.

## D-14 · `advanceBeacon` bridges gaps without the freshness window
- **Context:** Without it, more than 4096 quiet slots (~11 h) would make the beacon permanently unverifiable.
- **Decision:** `advanceBeacon` checks the chain link but not token age, rejects future slots, only moves the cache forward, and is called by the Stage burner every 60 s and in ≤ 4096-slot hops after a gap.
- **Consequence:** Old links become public; harmless, since any newer token already reveals them.

## D-15 · Beacon recovery from on-chain state
- **Decision:** Store `rotation`, `start`, `length` on-chain; a restarted Stage rebuilds from those and only calls `setBeacon` when it was never set or the organiser explicitly rotates.

## D-16 · Burner wallets for the Stage and Gate
- **Decision:** Both kiosk pages hold a localStorage burner key funded by the organiser, so live-event actions (`advanceBeacon`, `checkIn`) never trigger wallet pop-ups.
- **Consequence:** Keys are hot; they can only advance the beacon or check people in, and the organiser can revoke gatekeepers.

## D-17 · Drip uses a gas cap and no return data
- **Decision:** 30,000 gas, assembly call without copying return data; failures go to `claimable`.
- **Rejected:** Forwarding all gas (a griefing contract could make every check-in revert).

## D-18 · Submitter is also banned from self-voting (except the organiser)
- **Context:** In open contests a submitter could name a friend as payee and vote for their own entry.
- **Decision:** Store `submitter`; ban payee, members and non-organiser submitter.

## D-19 · Deployments per chain, copied into the web app
- **Decision:** `contracts/deployments/<chainId>.json`; only Sepolia is committed; `pnpm gen` copies into `web/src/deployments/` because Vercel's root is `web/`.

## D-20 · Ticket list frozen at the first check-in
- **Decision:** `setTicketList` reverts `CheckInsStarted` once anyone has checked in, so admitted wallets can't drift from the list.
