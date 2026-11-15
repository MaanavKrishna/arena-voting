# Changelog

All notable changes to Arena are listed here. Versions follow [Semantic Versioning](https://semver.org); the format follows [Keep a Changelog](https://keepachangelog.com).

## [0.1.2] — 2026-11-15

Security patch from the first CodeQL and Dependabot scans. No contract changes.

### Security
- Image previews only accept `https:`, `blob:` and same-site URLs, so a crafted link can't run script.
- CSP violation reports have control characters stripped before logging, so a report can't forge log lines.
- Patched `minimatch` (dev tooling) to 11.0.8; `pnpm audit` now reports no known vulnerabilities, including dev dependencies.
- Two CodeQL findings reviewed and dismissed with reasons on record: a dedicated Web Worker's message handler, and the test-only IPFS stub that is disabled in production.

## [0.1.1] — 2026-11-15

Security and reliability update. No contract changes; the Sepolia deployment is unchanged.

### Security
- Browser security headers on every page: frame blocking (clickjacking), no MIME sniffing, strict referrer policy, and a permissions policy that allows the microphone and camera only for Arena.
- Content Security Policy in report-only mode, with violations reported to `/api/csp-report`, ahead of enforcing it.
- Uploads are only accepted from Arena's own pages, and the hosting firewall rate-limits the upload endpoint (20 requests per minute per IP).
- Patched vulnerable transitive dependencies (`zod` 4.6.7, `uuid` 11.1.1); `pnpm audit` reports no known vulnerabilities.
- Test-only code paths are locked to the local test chain, and the public local-chain test keys are no longer in the production bundle.
- IPFS links with `..` or similar path tricks are rejected; guest lists match addresses regardless of letter case and are validated on load.
- Repository: secret scanning with push protection, Dependabot alerts and security updates, CodeQL code scanning, private vulnerability reporting, and a `SECURITY.md`.

### Fixed
- Phones now pick up a new room signal straight away after the organiser rotates the beacon.
- The Stage catches up after a long quiet period in one go instead of one step per minute.
- Switching wallets no longer shows the previous wallet's vote.
- A failed door check-in no longer leaves the guest marked as checked in at the Gate.
- Contest pages refresh when entries are withdrawn, the guest list or gatekeepers change, or the beacon is reset.
- History views (My activity, gatekeepers) load faster by reading in parallel.

## [0.1.0] — 2026-11-15

First public release. Live at **[arena-voting.vercel.app](https://arena-voting.vercel.app)** on the Ethereum Sepolia testnet.

### Highlights
- **Contests decided by the people in the room.** Organisers lock a prize in the contract, teams submit entries, attendees vote from their phones, and the contract pays the winner.
- **Ground presence, verified on-chain.** A Stage laptop broadcasts a short-lived room signal (sound, with a QR fallback); an optional door check-in issues a live animated pass. The contract checks both, with no server in between.
- **Live hemicycle results.** Every vote is a seat in a parliament-style chamber, updating on phones and the projector.

### Smart contract (`contracts/`)
- `Arena.sol` with prize escrow, curated or open entries, three presence modes (Anywhere, Room, Gated), optional Merkle guest list, and pull-payment payouts (ties split equally, no votes refunds the organiser).
- `BeaconChain.sol`: one-way hash-chain verification for the room signal, with a time window that tolerates slow wallets and a catch-up path after quiet periods.
- Gated check-in with a capped-gas test-ETH drip that never blocks the door.
- Guards against junk-entry flooding (per-submitter limit, live-entry cap), self-voting (payee, members, submitter), unreceivable payees, and a guest list that can't change once check-ins start.
- Deployed and verified on Sepolia: [`0x2dC9d04Dd8f724C936aE7C200F73763e20662c34`](https://sepolia.etherscan.io/address/0x2dC9d04Dd8f724C936aE7C200F73763e20662c34#code).

### Web app (`web/`)
- Next.js 16 app with a custom design system (`/system`): tokens, materials, spring motion, contrast-checked colours, light and dark themes, reduced-motion support.
- Pages: landing, explore, create wizard, contest page with voting and live results, organiser control room, entry submission, Stage (projector + room signal), Gate (door kiosk), My activity.
- Wallets: any browser wallet (EIP-6963) and WalletConnect, through one Connect sheet; network guard and plain-English errors for every contract error.
- Winner reveal on the Stage with confetti; the room signal stops by itself when voting closes.
- Content pages: How it works, For organisers, FAQ, Trust, Privacy, Terms.
- Sitemap (including contests), robots rules, web app manifest, icons, and share images per contest.

### Quality
- 227 contract tests (unit, fuzz, invariant; 100% line and branch coverage on `Arena.sol` and `BeaconChain.sol`).
- 659 web unit and component tests.
- 44 end-to-end tests across iPhone-sized WebKit and desktop Chromium, covering create, room voting, door check-in, finalise, reveal, claim, errors and organiser tools.
- Shared test vectors keep the TypeScript and Solidity hash-chain, pass and guest-list code byte-identical.

### Known limits
- Testnet only; the contract is not audited.
- One wallet is not one person. Guest lists and door check-in limit abuse; proof of personhood is future work.
- The organiser is trusted for presence (room signal and door devices), not for tallies or payouts.
- Votes are public on-chain.

[0.1.2]: https://github.com/MaanavKrishna/arena-voting/releases/tag/v0.1.2
[0.1.1]: https://github.com/MaanavKrishna/arena-voting/releases/tag/v0.1.1
[0.1.0]: https://github.com/MaanavKrishna/arena-voting/releases/tag/v0.1.0
