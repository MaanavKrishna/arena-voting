# Security policy

Arena runs on the **Ethereum Sepolia testnet** only. Prizes, fees and drips are free test ETH with no real value, and the contracts are **not audited**.

## Reporting a vulnerability

Please report privately through GitHub: **Security → Report a vulnerability** on this repository ([direct link](https://github.com/MaanavKrishna/arena-voting/security/advisories/new)). Don't open a public issue for security problems.

Include what you found, how to reproduce it, and the impact you expect. You'll get a reply within a few days.

## Scope

- Smart contracts in `contracts/src` (deployed at [`0x2dC9d04Dd8f724C936aE7C200F73763e20662c34`](https://sepolia.etherscan.io/address/0x2dC9d04Dd8f724C936aE7C200F73763e20662c34#code) on Sepolia).
- The web app in `web/` and the live site at https://arena-voting.vercel.app.

The documented trust model (the organiser is trusted for presence, not for tallies or payouts) and the honest limits in the README are known and out of scope.

## What's in place

- Contract: no owner or admin keys, no upgrades, checks-effects-interactions, reentrancy guards on every ETH transfer, pull payments, gas-capped drips, bounded loops, 100% line and branch test coverage, fuzz and invariant tests.
- Web: security headers (frame blocking, no MIME sniffing, strict referrer and permissions policies, a Content Security Policy in report-only mode), same-origin uploads with size and type limits, validated environment and IPFS data.
- Repository: secret scanning with push protection, Dependabot alerts and security updates, CodeQL code scanning, exact dependency pins.
