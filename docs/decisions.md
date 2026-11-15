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
- **Library findings (2026-11-15, desk-checked, no real devices yet):** ggwave 0.4.0 is one UMD file with the WASM embedded as base64 (no separate .wasm). `encode`/`decode` accept and return **raw `Uint8Array`**, so the 25-byte payload goes as binary (no base64url). Set sample formats to F32 and `payloadLength = 25`; feed `decode` 1024-sample Float32 chunks viewed as `Int8Array`; copy outputs (static buffers). Protocol names: `ProtocolId.GGWAVE_PROTOCOL_{AUDIBLE,ULTRASOUND,DT}_{NORMAL,FAST,FASTEST}`. 25-byte waveform at 48 kHz: ULTRASOUND_FASTEST 0.77 s, FAST 1.54 s, NORMAL 2.30 s, AUDIBLE_FASTEST 0.77 s. `encode` logs to console on every call (silence it in the worker).
- **Bundling (Task 14):** Turbopack can't bundle the ggwave UMD in a module worker (its Node branch requires `fs`). The unmodified `ggwave.js` from the same npm package is copied to `web/public/vendor/ggwave/` and loaded with `importScripts` in a classic worker (`new Worker(new URL("./sound.worker.ts", import.meta.url))`, no `type`); console output silenced. `public/vendor/**` is lint-ignored. Measured: 25-byte payload → 0.768 s waveform at 48 kHz; Node round-trip decode exact for ultrasound and audible fastest.
- **Spike results (devices):** _owner runs `spikes/sound` — fill in devices, protocols, distances, decode times, verdict (ultrasound / audible / QR primary)._
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

## D-21 · Sepolia testnet for now; mainnet is a later, owner-only phase
- **Context:** The project runs on an Ethereum testnet for now. Mainnet may follow.
- **Decision:** Ship on Sepolia. Keep the network config-driven (`web/src/config/network.ts`; `ALLOWED_CHAINS` in deploy scripts) so switching is a config change. Agents never enable mainnet on their own.
- **Mainnet readiness checklist (all required before adding chain id 1):**
  1. Owner's explicit go-ahead in writing.
  2. Independent security review/audit of `Arena.sol` and `BeaconChain.sol` (real prize money will be escrowed).
  3. Re-check gas costs at mainnet prices (beacon hash steps, check-in drips) and revisit `MAX_DRIP`, the drip default and `MAX_HASH_STEPS`.
  4. Revisit the trust model with real money: organiser-held beacon seed and gatekeeper keys, burner wallets on kiosk devices.
  5. Fresh deployer key held by the owner (hardware wallet), never in `.env` on a shared machine.
  6. Mainnet RPC + Etherscan verification, separate Vercel environment, copy updated (no "Testnet" badge, real-value warnings on prize funding).
  7. `Seed.s.sol` stays testnet-only.

## D-22 · Use the machine's installed Node 26.7.0 and pnpm 10.34.9
- **Context (2026-11-15):** No Node version manager or Corepack on the owner's Mac; latest LTS is 26.13.1 and latest pnpm is 12.21.0.
- **Decision:** Don't change global tools. `.nvmrc` 26.7.0, `engines.node >=26.7.0 <27`, `packageManager pnpm@10.34.9`. Package dependencies stay exactly pinned.
- **Consequence:** Upgrade later with a version manager if the owner wants; nothing in the app depends on 26.13-specific features.

## D-23 · ESLint 9.39.5, not 10
- **Context:** eslint-config-next 16.4.6 pulls eslint-plugin-import/react/jsx-a11y whose peer range stops at ESLint 9.
- **Decision:** Pin the latest ESLint 9.

## D-24 · Tailwind via the Turbopack loader
- **Context:** create-next-app 16.4.6 configures `@tailwindcss/turbopack` in `next.config.ts` instead of PostCSS.
- **Decision:** Keep the generated setup (pinned to 4.3.5); no `postcss.config.mjs`. Vitest doesn't process Tailwind.

## D-25 · Base Account behind a flag
- **Context:** Base Account's Sepolia support couldn't be confirmed from the package alone.
- **Decision:** `NEXT_PUBLIC_ENABLE_BASE_ACCOUNT=1` shows the Face ID option; off by default. Owner tests on a phone, then flips it.

## D-26 · Solidity libraries are installed, not committed
- **Decision:** `contracts/lib/` is gitignored; `pnpm setup:contracts` installs forge-std v1.17.0 and OpenZeppelin v5.7.0 at pinned tags.

## D-27 · Wallet state restored on the client, no server `initialState`
- **Context:** With Cache Components on, reading cookies in the root layout forces a Suspense boundary around the whole app and makes every page dynamic.
- **Decision:** `<WalletProviders>` sits in the client `Providers` without `initialState`; wagmi's cookie storage + reconnect restores the connection after hydration. Pages stay static.
- **Consequence:** A brief "Connect" → connected flicker on first paint; components show a skeleton until `useConnection` settles. `serverExternalPackages: ["@base-org/account", "@coinbase/cdp-sdk"]` in `next.config.ts` keeps the Base Account SDK's optional deps out of the server bundle.

## D-28 · Stable `Math.random` while building the wagmi config on the server
- **Context:** Under Cache Components, viem's `http()` transport stamps a `Math.random()` uid during server prerender, which Next reports as `blocking-prerender-random-client`.
- **Decision:** `config/wagmi.ts` builds the config inside `withStableRandom()` on the server only (swaps `Math.random` for a constant during synchronous construction, restores it in `finally`). The browser path is untouched and the uid is never rendered.
- **Revisit:** if viem/wagmi expose a way to pass a transport uid, or Next adds an opt-out for this case.
