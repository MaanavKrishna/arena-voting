# Frontend — Next.js app (`web/`)

Next.js **16.4** App Router, React 19.3, TypeScript 6.0, Tailwind 4.3, motion 14, wagmi 3 + viem 2. Versions and reasons: [architecture.md](architecture.md#tech-stack-pinned-verified-latest-compatible-on-2026-11-15).

> Next 16 changed several APIs relative to older docs and model training data. **Before writing Next-specific code, read the matching page in `web/node_modules/next/dist/docs/`** (bundled with the installed version). Known changes that matter here: Turbopack is the default bundler; `middleware.ts` is now `proxy.ts`; `next lint` was removed (run `eslint` directly); `headers()`, `cookies()` and route `params` are async.

## Folder tree
```
web/
  package.json  next.config.ts  tsconfig.json  eslint.config.mjs
  wagmi.config.ts                 @wagmi/cli: foundry plugin → src/generated.ts
  vitest.config.ts  playwright.config.ts
  public/
    vendor/ggwave/                ggwave.js + .wasm copied by a postinstall script (if the spike says so)
    og/                           static OG fallbacks
  src/
    app/
      layout.tsx                  fonts, <Providers>, theme script, metadata
      globals.css                 @import "tailwindcss"; @theme tokens; @utility type styles
      page.tsx                    / landing
      explore/page.tsx
      create/page.tsx
      c/[id]/page.tsx             contest
      c/[id]/submit/page.tsx
      c/[id]/stage/page.tsx
      c/[id]/gate/page.tsx
      c/[id]/manage/page.tsx
      me/page.tsx
      system/page.tsx             design system
      api/upload/route.ts         Pinata signed upload URL (only server code)
      not-found.tsx  error.tsx  loading.tsx
    components/
      ui/                         design-system primitives (design-system.md §8)
      fx/                         motion utilities (TiltCard, NumberTicker, ListeningOrb)
      fx/hero/                    hero + celebration effects (Spotlight, Aurora, BorderBeam, VoteBeam, Confetti)
      contest/                    ContestHeader, EntryGallery, EntrySheet, VotePanel, ResultsPanel, ClaimCard
      create/                     CreateWizard, steps/*, PreviewCard
      stage/                      StageView, BeaconController, WinnerReveal
      gate/                       GateView, PassScanner, CheckInQueue
      manage/                     ChecklistCard, EntriesAdmin, BeaconCard, GatekeepersCard, TicketListCard
      presence/                   PresenceChip, PassQR, BeaconQRScanner
      wallet/                     ConnectSheet, AccountMenu, NetworkGuard
      providers.tsx               WagmiProvider + QueryClientProvider + MotionConfig + Toasts
    config/
      network.ts                  targetChain, chains, currency label, isTestnet — the ONLY place a network is chosen
      wagmi.ts                    createConfig (chains, transports, connectors, ssr, storage)
      contracts.ts                arenaAddress(chainId), deployment block — reads src/deployments/<chainId>.json
    deployments/                  copied from contracts/deployments/ by `pnpm gen` (11155111.json committed)
      env.ts                      zod-validated public env (each var read literally)
      env.server.ts               server-only env (PINATA_JWT, SEPOLIA_RPC_URL) — import "server-only"
    hooks/
      useContests.ts  useContest.ts  useEntries.ts  useVoterState.ts  useLiveContest.ts
      useNow.ts  useChainTime.ts  useMetadata.ts  useTicketList.ts  useArenaWrite.ts
      usePresence.ts              presence state machine (sound + QR + validity check)
      useGate.ts                  burner key, scan → verify → queue
    lib/
      generated.ts → (in src/generated.ts)
      beacon/chain.ts             hash chain (must match Solidity)
      beacon/payload.ts           25-byte encode/decode, base64url
      beacon/sound.ts             interface: startTransmit / startReceive / stop
      beacon/sound.worker.ts      ggwave WASM in a Worker
      beacon/chain.worker.ts      builds the hash chain off the main thread
      burner.ts                   Stage/Gate burner keys (localStorage) + funded wallet client
      beacon/seed.ts              seed message + derivation
      pass.ts                     CheckInRequest typed data, live tick sign/verify, QR payload
      tickets.ts                  parse list, build StandardMerkleTree, proofFor
      ipfs.ts                     upload (via /api/upload), fetch with gateway fallback
      metadata.ts                 zod schemas for Contest/Entry/TicketList JSON
      errors.ts                   custom error → copy (see below)
      phase.ts                    contest phase from timestamps
      hemicycle.ts                seat layout geometry
      format.ts                   ETH, addresses, relative time
      motion.ts                   spring tokens
      cn.ts
    test/                         vitest setup, fixtures
  e2e/                            Playwright specs
```

## Rendering model
- Pages are **server components that render a client island** (`"use client"` component does the wallet work). Server parts: layout, static copy, `generateMetadata`.
- `generateMetadata` for `/c/[id]` may read the contest title with a server-side viem public client using the **server-only `SEPOLIA_RPC_URL`** (the public key is origin-restricted and would be refused server-side). Wrap in try/catch, 2 s timeout, fall back to "Arena contest" — never fail the page.
- The root layout reads cookies (`await headers()`) for wallet hydration, which makes routes dynamic. That's expected; there is still no stored server state.
- Do not pass `bigint` across the server → client boundary; pass ids as strings and parse with `BigInt()` in the client.
- Browser-only modules (ggwave, camera, `AudioContext`, `localStorage`) load inside client components with `next/dynamic(() => import(...), { ssr: false })` or inside `useEffect`.
- Workers: `new Worker(new URL("../lib/beacon/sound.worker.ts", import.meta.url), { type: "module" })`. If Turbopack can't bundle the WASM glue, serve `public/vendor/ggwave/ggwave.js` and load it in a classic worker with `importScripts`. Record the choice in decisions.md.

## Wallet and chain config (`config/wagmi.ts`)
```ts
createConfig({
  chains: env.NEXT_PUBLIC_ENABLE_ANVIL ? [foundry, sepolia] : [sepolia],
  transports: { [sepolia.id]: http(env.NEXT_PUBLIC_SEPOLIA_RPC_URL), [foundry.id]: http("http://127.0.0.1:8545") },
  connectors: isE2E   // config/network.ts: NEXT_PUBLIC_E2E && NEXT_PUBLIC_ENABLE_ANVIL (throws otherwise)
    ? [mock({ accounts: ANVIL_ADDRESSES })]   // addresses only; the keys load lazily in E2E (lib/anvilKeys.ts)
    : [injected(), walletConnect({ projectId: env.NEXT_PUBLIC_WC_PROJECT_ID, showQrModal: false, metadata }), baseAccount({ appName: "Arena" })],
  multiInjectedProviderDiscovery: true,   // EIP-6963: lists every installed wallet
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
  pollingInterval: 4_000,
});
```
- Root layout passes `cookieToInitialState(config, (await headers()).get("cookie"))` to `<Providers>` so the connected state doesn't flash on load.
- The RPC URL is public (`NEXT_PUBLIC_`). Restrict it to the production domain + localhost in the Alchemy/Infura dashboard.
- **Verify in Task 2:** confirm exact wagmi 3 connector names/options (`injected`, `walletConnect`, `baseAccount`, `mock`) against `node_modules/@wagmi/connectors` types, and confirm Base Account supports Ethereum Sepolia. If not, hide the Face ID option on Sepolia and note it.
- **Network config in one file:** `web/src/config/network.ts` exports `targetChain`, the `chains` list, the currency label and `isTestnet`. Current phase: `sepolia` (+ `foundry` in dev). Nothing else in the app hard-codes a chain id or "Sepolia" — components read from this file, so a later mainnet phase only changes config. Don't add `mainnet` in this phase (the only exception is the E2E-only wrong-network test). While `isTestnet`, a small persistent **"Testnet"** badge sits in the nav and amounts read "Sepolia ETH".
- `targetChain = env.NEXT_PUBLIC_ENABLE_ANVIL ? foundry : sepolia`. `NetworkGuard`: if connected to any other chain, every `TxButton` becomes "Switch to {targetChain.name}" (`useSwitchChain`). Reads still work without a wallet (public client on `targetChain`).
- In **Gated** contests the Connect sheet hides the Base Account (Face ID) option — passkey signatures don't fit the Pass QR (decision D-13).
- **Env parsing:** Next only inlines `process.env.NEXT_PUBLIC_X` when written literally, so `env.ts` reads each variable by name (`NEXT_PUBLIC_E2E: process.env.NEXT_PUBLIC_E2E`) and parses flags as `v === "1"` (never `z.coerce.boolean`, which makes "0" true).

## Data layer
All contract access goes through the generated ABI (`src/generated.ts`, `arenaAbi`) and these hooks. Components never call `readContract` directly.

| Hook | Returns | Source / refresh |
|---|---|---|
| `useContests({ tab, search })` | `ContestView[]` | Loads **all** contests (`getContests` pages of 50 until empty — fine up to a few hundred), filters tabs/search client-side; refetch on `ContestCreated` |
| `useContest(id)` | `ContestView` + derived `phase` | `getContest`; refetch on any event for this id |
| `useEntries(id)` | `EntryView[]` + metadata | `getEntries` + `useMetadata` per entry |
| `useVoterState(id)` | `{ votedEntryId, isCheckedIn }` | `voterState` for connected account |
| `useLiveContest(id)` | — | `useWatchContractEvent` for `VoteCast`, `CheckedIn`, `EntrySubmitted`, `EntryWithdrawn`, `ContestFinalized`, `BeaconSet`, `BeaconAdvanced`, `TicketListSet`, `GatekeeperSet` (`LIVE_EVENTS`) filtered by `contestId` → `queryClient.invalidateQueries` on the contest key (plus the `GatekeeperSet` log history for `GatekeeperSet`) |
| `useNow()` | `bigint` seconds | 1 s tick (shared, single interval) |
| `useChainTime()` | `{ now, offset, skewWarning }` | max-of-fresh-samples offset, poll every 2 s (algorithm in ground-presence.md#timing); warning if `|offset| > 15 s` |
| `useMetadata(uri)` | parsed JSON or fallback | react-query, `staleTime: Infinity`, gateways in order: Pinata dedicated → `ipfs.io` → `dweb.link` |
| `useTicketList(id)` | tree + `proofFor(addr)` | IPFS JSON → `StandardMerkleTree.load`; verify `tree.root === ticketRoot` |
| `usePresence(id)` | state machine (below) | sound worker + QR scanner + `isBeaconTokenValid` |
| `useArenaWrite(fn)` | `{ simulate, write, status, error }` | `useSimulateContract` → `useWriteContract` → `useWaitForTransactionReceipt` |
| `useLogs(event, args)` | decoded logs | `getLogs` from the deployment block in **chunks of 500 blocks** (auto-halve on a range error, cache per chunk) — used by `/me`, gatekeeper list, ticket/beacon history |

`useArenaWrite` **simulates before asking the wallet**, so a doomed vote shows "You've already voted" instead of a wallet pop-up that then fails. It also handles optimistic UI (e.g. the voted entry gets a "Sending…" state immediately).

### Presence state machine (`usePresence`)
```
idle ──tap Listen──► requesting-mic ──granted──► listening ──token decoded──► validating
  ▲                        │denied                    │15 s no token            │isBeaconTokenValid
  │                        ▼                          ▼                         ▼
  └────────────── mic-denied (offer QR) ◄──── offer-qr (still listening)    in-room ✓ (keeps listening, swaps to newer tokens)
                                                                               │no newer token for 60 s (performance.now age)
                                                                               ▼
                                                                             stale → listening
```
The vote button uses the newest token at the moment of simulation and re-checks `isBeaconTokenValid` immediately before opening the wallet.

## Error copy
`lib/errors.ts` exports `explainError(err: unknown): { title: string; detail?: string; action?: "retry" | "switch-network" | "connect" }`. It decodes viem `ContractFunctionRevertedError` by `errorName`, detects user rejection (`UserRejectedRequestError`), wrong chain, insufficient funds, and RPC timeouts. A unit test iterates **every error in `arenaAbi`** and fails if one has no copy.

| Error | Title |
|---|---|
| `AlreadyVoted` | You've already voted in this contest. |
| `CannotVoteForOwnEntry` | You can't vote for your own team's entry. |
| `NotCheckedIn` | Check in at the door first. |
| `NotOnTicketList` | This wallet isn't on the guest list. |
| `CheckInsStarted` | The guest list is locked because check-in has started. |
| `VotingNotOpen` | Voting isn't open right now. |
| `BeaconExpired` / `InvalidBeaconToken` / `BeaconGapTooLarge` | We lost the room signal — listening again. |
| `BeaconNotSet` | The organiser hasn't started the room signal yet. |
| `EntryRemoved` / `EntryNotFound` | That entry isn't in this contest anymore. |
| `SubmissionsClosed` | Submissions have closed. |
| `NothingToClaim` | Nothing to claim yet. |
| user rejected | You cancelled in your wallet. |
| insufficient funds | Your wallet needs a little Sepolia ETH for the network fee. (link to faucet list) |
| other create/setup errors | Specific field message from the create form; generic: "Something went wrong. Try again." |

## Forms
- `react` state + zod schemas that mirror contract limits **exactly** (byte length via `new TextEncoder().encode(s).length`, not `.length`).
- Inline validation on blur; submit button explains what's missing.
- Create wizard keeps a draft in `sessionStorage` so a refresh doesn't lose work.
- Times: input in local time, display the timezone, convert to unix seconds. Validate against chain time (`useChainTime`), not the device clock.

## IPFS upload (`app/api/upload/route.ts`)
- `POST { kind: "image" | "json", size, mime }` → returns a short-lived **Pinata signed upload URL** (60 s, size and MIME limited: images ≤ 4 MB `image/png|jpeg|webp|gif`, JSON ≤ 64 KB). The client uploads directly to Pinata with that URL, then stores `ipfs://<cid>`.
- `PINATA_JWT` is server-only (no `NEXT_PUBLIC_`). Check the current pinata SDK method names in its docs at implementation time — they changed between v1 and v2.
- Abuse limits: size + MIME limits and the 60 s signed-URL expiry only. **No rate limiter** (an in-memory one doesn't work on serverless, and a KV store would add server state). Note this in the README's limits.
- **Same-site only:** the route answers 403 unless `Origin` (or, without it, `Referer`) is the request's own host, the production host (`VERCEL_PROJECT_PRODUCTION_URL`), or `http://localhost:3000` outside production (`app/api/_lib/origin.ts`).
- **E2E mode** (`isE2E`: `NEXT_PUBLIC_E2E=1` with `NEXT_PUBLIC_ENABLE_ANVIL=1`): the route returns a deterministic fake CID (sha-256 of the content) and writes the content to `web/.e2e-ipfs/<cid>` (gitignored); `/api/e2e-ipfs/[cid]` serves it, and `useMetadata` tries that path first. Never enabled on a production deployment (`VERCEL_ENV=production`), and E2E mode on any non-local chain throws at config load.
- Images are resized client-side to max 1600 px (canvas) before upload.

## Scripts
Root `package.json` (pnpm workspace with `web` only; Foundry isn't an npm package):
```json
{
  "scripts": {
    "dev": "pnpm -C web dev",
    "build": "pnpm -C web build",
    "test": "pnpm test:contracts && pnpm test:web",
    "test:contracts": "cd contracts && forge test",
    "test:web": "pnpm -C web test",
    "e2e": "pnpm -C web e2e",
    "lint": "pnpm -C web lint && cd contracts && forge fmt --check",
    "typecheck": "pnpm -C web typecheck",
    "gen": "cd contracts && forge build && cd .. && mkdir -p web/src/deployments && cp contracts/deployments/*.json web/src/deployments/ 2>/dev/null; pnpm -C web wagmi generate",
    "chain": "anvil --block-time 2",
    "deploy:local": "bash contracts/script/deploy-local.sh"
  }
}
```
`contracts/script/deploy-local.sh`: runs `Deploy.s.sol` then `Seed.s.sol` with `--rpc-url http://127.0.0.1:8545 --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (Anvil's unlocked default account — no key needed), then `cast rpc evm_increaseTime 70 && cast rpc evm_mine`, then `SeedVotes.s.sol` (votes need voting to be open, which a single script can't wait for). `pnpm gen` copies `contracts/deployments/*.json` into `web/src/deployments/`.

`web/package.json`: `dev` = `next dev --port 3000`, `build` = `next build`, `lint` = `eslint .`, `typecheck` = `next typegen && tsc --noEmit` (route types like `LayoutProps` are generated), `test` = `vitest run`, `e2e` = `playwright test`.
Use `anvil --block-time 2` (not instant mining) so time-based behaviour resembles a real chain.

## Gotchas (keep this list updated)
1. **Next 16 APIs differ from older docs** — read `node_modules/next/dist/docs/`.
2. **TypeScript must stay on 6.0.x** until typescript-eslint supports 7.
3. **RainbowKit/ConnectKit don't support wagmi 3** — don't add them.
4. **Mic/camera need HTTPS** on phones. `localhost` works only on the dev machine.
5. **Voice processing kills ultrasound** — always pass `echoCancellation/noiseSuppression/autoGainControl: false`.
6. **Autoplay policy** — the Stage must click **Start beacon** before audio plays; same for phone `AudioContext.resume()`.
7. **BigInt + JSON** — `JSON.stringify` throws on bigint; use viem's `stringify` or convert.
8. **Byte lengths** — validate strings with `TextEncoder`, emoji are 4 bytes.
9. **Polling, not WebSockets** — wagmi watches events by polling every 4 s on HTTP RPC; fine for Sepolia. Don't open WebSockets per component.
10. **OneDrive** — the repo sits in OneDrive. `node_modules` sync is slow and can hit cloud-only placeholders. Keep the folder "Always Keep on This Device"; consider excluding `node_modules`/`.next` from sync.
11. **pnpm build scripts** — pnpm ≥ 10 asks before running dependency build scripts; approve only what's needed (`pnpm approve-builds`).
12. **Env files** — Foundry reads the root `.env`; Next only reads `web/.env.local`. Two example files: root `.env.example` (contracts) and `web/.env.example` (app).
13. **Tunnels and allowlists** — a cloudflared/ngrok URL is a new origin: add it to the Alchemy origin allowlist and the Reown domain allowlist while testing, or test on a Vercel preview instead.
14. **Vercel root is `web/`** — the app must not import from `../contracts`; that's why `pnpm gen` copies deployments into `web/src/deployments/`.
15. **Cache Components is on** (`cacheComponents: true`, Next 16.4 default). Anything reading cookies/headers or other request data must sit inside `<Suspense>`; read the bundled docs on Cache Components before building layouts.
16. **Base Account (Face ID wallet) is behind `NEXT_PUBLIC_ENABLE_BASE_ACCOUNT=1`** (off by default) until Sepolia support is confirmed on a real device (D-25).
17. **Lightning CSS drops `backdrop-filter`** if you also write `-webkit-backdrop-filter` beside it — write only the unprefixed property.
18. **Use `useReducedMotionPref` from `components/ui/hooks.ts`**, not motion's `useReducedMotion`, to avoid hydration mismatches.
19. Headless browsers report the tab as hidden, so `fx/` effects look paused in automated screenshots; motion logs a "Reduced Motion enabled" dev warning under reduced motion — not an error.
20. **Deployment files may not exist** — `web/src/deployments/31337.json` is gitignored (made by `pnpm deploy:local` + `pnpm gen`) and `11155111.json` doesn't exist until the first public deploy. A plain `require("./11155111.json")` fails the Turbopack build when the file is missing (even inside try/catch), so `config/contracts.ts` discovers the files with `require.context("../deployments", false, /^\.\/\d+\.json$/)`, which is fine with zero, one or many files (`web/src/deployments/.gitkeep` keeps the folder in git). A missing or malformed file becomes "not deployed on this network": `arenaAddress()` / `deploymentBlock()` return `undefined`, `useArena().deployed` is false, and every data hook reports `notDeployed` instead of failing the build or throwing. After running `pnpm gen` or a deploy while `next dev` is running, restart the dev server if the address doesn't show up.
21. **Playwright starts `webServer` entries before `globalSetup`.** `next dev` must see a fresh `31337.json` and `generated.ts`, so the chain (anvil + `deploy:local` + `gen`) is the *first* web server (`web/e2e/chain.ts`, ready line `Arena E2E chain ready`); `global-setup.ts` only checks the stack and warms up routes. To iterate on specs against a stack you started yourself, run with `PW_EXISTING_STACK=1`.
22. **The E2E mock wallet doesn't reconnect after a full page load** (wagmi's mock `isAuthorized()` is false without `features.reconnect`). Specs call `connectWallet`/`openAs` from `e2e/helpers.ts` after every `goto`; the account is whichever `?e2eAccount=n` the page loaded with (only 0–2 exist).
23. **The local chain runs ahead of the wall clock** after any time travel (`deploy:local` alone jumps +70 s), so the Stage shows "This computer's clock is N s behind" on a local stack. Expected; `stage.spec.ts` pins the device clock with Playwright's `page.clock.setSystemTime` relative to the latest block to test both sides.
24. **Seeded contests use placeholder metadata URIs** (`ipfs://bafyseed…`) that exist nowhere, so browsers log 404s for them. The E2E console guard allowlists exactly those; every other `console.error` fails a test. The suite also answers every non-local request with a local 404, so an unexpected outside request shows up as a console error instead of quietly hitting the internet.
25. **`NumberTicker` duplicates digits in `textContent`** (rolling columns), so `toContainText("2 votes")` fails. Assert on accessible names instead (`img "Results: Entry 1 1 vote, …"`, entry buttons "Entry 1, 1 vote").
26. **The mock wallet can't reject a transaction.** `errors.spec.ts` answers its `eth_sendTransaction` with JSON-RPC error 4001 through `page.route`, which viem turns into `UserRejectedRequestError`. Wrong network: `window.__arenaSwitchChain(chainId)` (E2E builds only, `config/wagmi.ts`) moves the mock to Sepolia, the second configured chain.
27. **`getByRole("button", { name: "Next" })` also matches the Next.js dev-tools button** in `next dev`; use `exact: true`.
28. **Gated: the door pass gives way to the room chip the moment the check-in lands** (`PresenceSlot` swaps on `isCheckedIn`, which `GetPassPanel` also reads), so the pass panel's own "You're in ✓" view never shows on the contest page. Tests wait for the chain's `voterState` and the room chip instead.
29. **Anything that labels a contest's phase must use chain time** (`useChainTime().now`), never `useNow()` alone: the explore tabs filter by chain time, so a card on the device clock could sit in "Live" while saying "Taking entries". `ContestCard` had exactly this bug (found by the E2E suite, whose chain runs ahead of the wall clock); `useNow()` is only for device-side timers such as the door pass expiry.
30. **E2E-only code reads `isE2E`, never `env.NEXT_PUBLIC_E2E`.** `isE2E` (`config/network.ts`) is on only with the local chain and throws at load otherwise. The one exception is `loadAnvilKeys()` in `lib/burner.ts`, which reads both flags literally so the bundler drops the `lib/anvilKeys.ts` chunk from non-E2E builds; never import `anvilKeys.ts` statically from app code (tests may).
