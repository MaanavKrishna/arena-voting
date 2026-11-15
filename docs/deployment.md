# Deployment and environment

## Accounts the project owner must create (cannot be automated)
| Service | What to get | Env var |
|---|---|---|
| Alchemy (or Infura) | **Two** Sepolia keys: a private one (deploys + server-side reads) and a public one restricted to the Vercel domain + `localhost` (+ tunnel domains while testing) | `SEPOLIA_RPC_URL` (root + web server), `NEXT_PUBLIC_SEPOLIA_RPC_URL` |
| New deployer wallet | A **fresh** wallet used only for deploying (never a personal wallet). Fund with Sepolia ETH | `DEPLOYER_PRIVATE_KEY` |
| Sepolia faucet | ~0.5 Sepolia ETH total: deploy + seed (~0.05), organiser prize/demo (~0.1), gate drips for ~100 people (0.3 + gas). Faucets often require a mainnet balance or limit per day — **start collecting early** | — |
| Etherscan | API key (v2 API covers Sepolia) | `ETHERSCAN_API_KEY` |
| Reown Cloud (WalletConnect) | Project ID; add the Vercel domain + localhost to the allowlist | `NEXT_PUBLIC_WC_PROJECT_ID` |
| Pinata | JWT (server), dedicated gateway domain | `PINATA_JWT`, `NEXT_PUBLIC_PINATA_GATEWAY` |
| Vercel | Project linked to the repo, root directory `web` | set all `NEXT_PUBLIC_*` + `PINATA_JWT` |

> **Security:** private keys and JWTs live only in `.env` (gitignored) and Vercel's encrypted env settings. Never paste them into code, docs, issues or chat logs. The deployer key only ever holds testnet ETH.

## Env files (two of them)
Foundry reads the **root** `.env`; Next.js only reads **`web/.env.local`**. Both are gitignored; both have committed examples.

Root `.env.example`:
```bash
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-private-key
DEPLOYER_PRIVATE_KEY=0xyour-fresh-testnet-only-key
ETHERSCAN_API_KEY=your-etherscan-key
```
`web/.env.example`:
```bash
# public (inlined into the browser bundle)
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-public-origin-restricted-key
NEXT_PUBLIC_WC_PROJECT_ID=your-reown-project-id
NEXT_PUBLIC_PINATA_GATEWAY=your-subdomain.mypinata.cloud
NEXT_PUBLIC_ENABLE_ANVIL=0
NEXT_PUBLIC_E2E=0
# server only
PINATA_JWT=your-pinata-jwt
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-private-key
```
`web/src/config/env.ts` (public) and `env.server.ts` (server-only) validate these with zod and fail loudly with the missing variable's name. Flags are `"1"` = on, anything else = off.

## Local chain
```bash
pnpm chain            # anvil --block-time 2 on :8545
pnpm deploy:local     # deploy + seed + time-travel + seed votes; writes contracts/deployments/31337.json (gitignored)
pnpm gen              # forge build, copy deployments into web/src/deployments/, wagmi generate → web/src/generated.ts
pnpm dev              # http://localhost:3000 with NEXT_PUBLIC_ENABLE_ANVIL=1
```
Import Anvil account #0 into a browser wallet for manual testing (its key is the public Anvil default — never use it on a real network).

## Sepolia deploy
```bash
cd contracts
source ../.env
forge script script/Deploy.s.sol --rpc-url "$SEPOLIA_RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast --verify --etherscan-api-key "$ETHERSCAN_API_KEY"
```
- `Deploy.s.sol` writes `contracts/deployments/<chainId>.json` = `{ "address": "0x…", "block": 123 }` (needs `fs_permissions` read-write on `./deployments`). Commit `11155111.json`; `31337.json` is gitignored. `pnpm gen` copies them into `web/src/deployments/`, which `config/contracts.ts` reads (the block is the `fromBlock` for log queries).
- Proof of done: the Etherscan page shows **"Contract Source Code Verified"**. Paste the URL into the ledger and README.
- If verification fails during the broadcast, rerun `forge verify-contract <address> src/Arena.sol:Arena --chain sepolia --watch`.
- **Redeploying** creates a new address and empties all contests. Do it only before the demo data is created; then `pnpm gen`, commit, and redeploy the web app.
- `Seed.s.sol` on Sepolia: creates one demo contest per presence mode with short windows, using the deployer as organiser. Optional.

## Vercel
- Root directory: `web`. Install command: `pnpm install --frozen-lockfile`. Build: `pnpm build`. Node: 26 (Vercel picks the major; `engines.node` pins 26.13.1 locally).
- Env vars: everything in `web/.env.example`. `NEXT_PUBLIC_ENABLE_ANVIL=0`, `NEXT_PUBLIC_E2E=0`.
- Ensure `web/src/generated.ts` and `web/src/deployments/11155111.json` are committed (Vercel doesn't run Foundry, and the app never imports from `../contracts`).
- After deploy: open the production URL at 390 px and 1440 px, run the browse + vote flow on Sepolia with a real wallet, check the console.

## Demo-day runbook (organiser)
1. Night before: Sepolia ETH on the organiser wallet; create the contest; add entries; open `/c/[id]/stage` once to set the beacon (signature + `setBeacon`); fund the Stage burner and the Gate burner(s) from `/manage`. Use a regular wallet (EOA) as organiser so the beacon can be recovered by re-signing.
2. Stage laptop: plugged in, sleep off, Chrome, volume 60–80%, projector mirrored. Open `/c/[id]/stage` → **Start beacon**. Check the skew chip is green.
3. Gate device(s): `/c/[id]/gate`, authorised and funded; camera at chest height; good light.
4. Test with your own phone: check in, see "In the room ✓", don't vote (or vote in a test contest).
5. After voting closes: press **Finalise** on the Stage → Winner reveal → winners claim from their phones.
