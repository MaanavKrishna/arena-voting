# Arena — documentation index

Arena is an Ethereum voting DApp for **contests decided by the people in the room**. Organisers create a contest with an ETH prize, teams submit entries, attendees vote from their phones, and the smart contract pays the winner. The **Ground** feature proves a voter is physically at the venue using an inaudible sound beacon and a door check-in, verified on-chain.

Read in this order:

| # | Doc | What it answers |
|---|---|---|
| 1 | [product.md](product.md) | What we are building, for whom, every user flow, scope and cut list |
| 2 | [architecture.md](architecture.md) | How the pieces fit, what is on-chain vs off-chain, pinned tech stack |
| 3 | [contracts.md](contracts.md) | Exact Solidity spec: storage, functions, events, errors, rules, invariants |
| 4 | [ground-presence.md](ground-presence.md) | Presence protocol: hash-chain beacon, sound encoding, gate check-in, threat model |
| 5 | [design-system.md](design-system.md) | Tokens, type, colour, materials, motion, components, effects, accessibility |
| 6 | [frontend.md](frontend.md) | Next.js app structure, routes, data layer, wallet connection, gotchas |
| 7 | [testing.md](testing.md) | Contract, unit, E2E and real-device test strategy |
| 8 | [deployment.md](deployment.md) | Environment variables, Sepolia deploy and verify, Vercel, IPFS |
| 9 | [decisions.md](decisions.md) | Decision log with rejected alternatives and why |

Agents and contributors: start with [`/AGENTS.md`](../AGENTS.md).

Glossary:

- **Contest** — one competition: entries, a voting window, an optional ETH prize.
- **Entry** — one submission (team project, photo, song). Has a payee address and optional team members.
- **Ground** — the presence-proof feature (beacon + gate). Optional per contest.
- **Beacon** — the Stage laptop broadcasting short-lived presence tokens as inaudible sound.
- **Gate** — the check-in kiosk at the door that binds a voter's wallet to "was physically here".
- **Gatekeeper** — a burner wallet on the Gate device, authorised by the organiser to check people in.
- **Ticket list** — optional Merkle allowlist of wallets allowed to vote/check in.
- **Stage** — the projector screen: live hemicycle results, join QR, and the beacon.
- **Slot** — a 10-second time window; each slot has its own beacon token.
