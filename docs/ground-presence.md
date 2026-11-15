# Ground — presence protocol

Ground answers one question for the contract: **is this wallet's owner in the room right now?** No single signal can prove that. Ground stacks two signals that are each cheap for honest people and annoying for cheaters, and the contract verifies both without a server.

| Layer | Proves | Verified by | Used in mode |
|---|---|---|---|
| **Room beacon** | "Someone holding this token heard the Stage in the last ~2 minutes" | Contract (`BeaconChain.check`) | Room, Gated |
| **Door check-in** | "This wallet's own phone was physically shown at the door" | Gate device (signatures) → contract (`checkIn` by gatekeeper) | Gated |
| Ticket list | "This wallet registered for the event" | Contract (Merkle proof) | Any (optional) |

## Part 1 — the room beacon

### Hash-chain tokens (why not signatures)
A signed token (ECDSA) is 65 bytes + data ≈ 73 bytes. Data-over-sound is slow (tens of bytes per second), so a signed token would take many seconds to transmit and fail more often. Instead the beacon uses a **one-way hash chain** (the TESLA idea):

- The Stage generates a secret `seed`, builds `c[0] = bytes16(keccak256(seed))`, `c[k+1] = bytes16(keccak256(c[k]))` up to `c[N]`.
- It publishes only the end, `anchor = c[N]`, on-chain with `setBeacon(contestId, anchor, start, N)`.
- During slot `s` it broadcasts `c[N-1-s]`. Hashing that `s+1` times gives the anchor, so the contract can check it — but nobody can compute the *next* slot's token from the current one.
- Token = **16 bytes**. Full payload = **25 bytes**. Roughly 3× shorter than a signature, so faster, more reliable transmission.

Exact chain rules and the verification algorithm are in [contracts.md](contracts.md#beaconchain-library). JS implementation: `web/src/lib/beacon/chain.ts`, with a fixture test that must match Solidity byte-for-byte.

### Payload format (v1, 25 bytes)
| Offset | Size | Field |
|---|---|---|
| 0 | 1 | version = `0x01` |
| 1 | 4 | contestId (uint32, big-endian) |
| 5 | 4 | slot (uint32, big-endian) |
| 9 | 16 | token |

Transport encodings:
- **Sound:** the raw 25 bytes if the ggwave JS binding accepts binary; otherwise base64url text (34 chars). The spike decides; record the result in [decisions.md](decisions.md).
- **QR (fallback):** text `arena:b1:<base64url>` rendered on the Stage, re-rendered every slot.

Phones ignore payloads whose version ≠ 1 or whose contestId ≠ the page's contest.

### Seed: derived, recoverable
The Stage asks the organiser's wallet to `personal_sign` this exact message:
```
Arena beacon seed
Contest: {contestId}
Chain: {chainId}
Contract: {arenaAddress}
Rotation: {rotation}
Only sign this on the Arena Stage page.
```
`seed = keccak256(signature)`. Regular wallets (EOAs) produce the same signature for the same message every time (RFC 6979 deterministic signing), so a crashed laptop can rebuild the exact chain by signing again. Smart-contract wallets may not be deterministic: the Stage detects this (signs twice, compares) and forces a **Download beacon backup** file (`arena-beacon-<contest>.json` with seed, start, length, rotation) before continuing. **The Stage requires the organiser to use an EOA or the backup file.**

`rotation` is stored on-chain (`ContestView.beaconRotation`): 0 = never set, 1 after the first `setBeacon`, +1 per rotation.

### Setting up vs recovering (Stage logic)
| On-chain state | Stage does |
|---|---|
| `beaconAnchor == 0` (never set) | Sign with `Rotation: 1`, size the chain (below), build, call `setBeacon` |
| Set, same laptop (seed in memory/localStorage) | Rebuild from stored seed using on-chain `beaconStart` + `beaconLength`; check `c[N] == beaconAnchor`; **no transaction** |
| Set, new/crashed laptop | Sign with `Rotation: <beaconRotation>`, rebuild with on-chain `beaconStart` + `beaconLength`; if `c[N] == beaconAnchor` → resume with **no transaction**; if not (wrong wallet, smart wallet) → ask for the backup file or offer **Rotate beacon** |
| Organiser presses **Rotate beacon** | Sign with `Rotation: <beaconRotation + 1>`, size a new chain, call `setBeacon` (old tokens die) |

Never call `setBeacon` automatically just because a rebuilt anchor differs — always ask.

### Chain sizing (only when creating a new chain)
`start = floor((max(chainNow, votingStart) - 60) / 10) * 10`; `length = ceil((votingEnd - start) / 10) + 6`. `setBeacon` requires `start < votingEnd`, so the beacon can be set any time after the contest exists (e.g. the night before). Max voting duration 7 days → ≤ 60,486 links → compute in a Web Worker (< 2 s), keep the full array in memory (≈ 1 MB).

### Timing
- Slot length 10 s. Token accepted from 30 s before its slot starts until 120 s after it ends (contract constants).
- Window reasoning: Sepolia block ≈ 12 s; wallet confirm screen 10–60 s; mempool wait 0–24 s. 120 s covers the slow honest case. Shorter windows lock out honest voters more than they slow cheaters (see threat model).
- **Clock skew:** the Stage's slot clock must follow chain time. The latest block's timestamp is 0–12 s old when read, so a plain median would be biased ~6 s slow. Instead: poll the latest block every 2 s; when a **new** block number first appears, record `sample = block.timestamp - localTimeWhenFirstSeen`; keep the **maximum** of the last 30 samples as `offset` (the freshest observation is the closest to true). Chain time = `localNow + offset`. Show the warning chip only if `|offset| > 15 s` (the contract tolerates 30 s early and 120 s late).
- **Phones never need a correct clock.** They track the age of each heard token with `performance.now()` from the moment it was received. A token is **stale after 60 s** without a newer one.
- Right before opening the wallet for a vote, the phone calls `isBeaconTokenValid(contestId, {slot, token})` (an `eth_call`, free). If false: "That signal is stale — listening again…" and the vote waits for the next token.
- **Stage burner wallet:** the Stage creates its own burner key (like the Gate) so it can call `advanceBeacon` every 60 s without wallet pop-ups. The organiser funds it from `/c/[id]/manage` (**Fund stage**, ~0.02 Sepolia ETH). After a long quiet period (e.g. overnight), the Stage bridges the gap in hops of ≤ 4096 slots before resuming. `setBeacon` itself is signed by the organiser's wallet.

### Sound transport (ggwave)
- **Library:** `ggwave@0.4.0` (WASM, MIT). Unmaintained since 2022: load it in a Web Worker, behind our own interface `web/src/lib/beacon/sound.ts`, so it can be swapped.
- **Protocol:** start with `GGWAVE_PROTOCOL_ULTRASOUND_FASTEST`; the spike picks the final protocol per device class. Fallback mode: `GGWAVE_PROTOCOL_AUDIBLE_FASTEST` (a short soft chirp), toggled on the Stage.
- **Transmit (Stage):** a user click on **Start beacon** creates the `AudioContext` (autoplay policy). Encode the current payload → Float32 waveform → play it back-to-back for the whole slot; re-encode when the slot changes. Volume slider (default 60%). Show a live "transmitting" waveform.
- **Receive (phone):**
  - `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } })` — **voice processing must be off**, it filters out ultrasound.
  - `AudioContext` at the device's native rate (usually 48 kHz). Tell ggwave the input sample rate.
  - `AudioWorklet` → post Float32 chunks to the decode Worker → `ggwave.decode`. (The official examples use the deprecated `ScriptProcessorNode` and pass the Float32 buffer to ggwave as an `Int8Array` view of the same bytes — keep that byte-view detail.)
  - Requires a secure context: HTTPS or `localhost`. Phones on a LAN dev server need a tunnel (see [testing.md](testing.md#real-devices)).
  - iOS Safari pauses the mic when the tab is backgrounded or the screen locks: show "Tap to listen again".
- **Never** record or upload audio. Say so in the mic permission explainer.

### QR fallback (reliability)
Under the hemicycle the Stage shows a small rotating QR with the same payload. The phone's presence chip offers **Can't hear? Scan the screen** when no sound token has arrived within 15 s. Same token, different channel — security is unchanged, because the decoded token is forwardable data either way (see threat model).

## Part 2 — door check-in (Gated mode)

### Live Pass (screenshots don't work)
1. Voter taps **Get my pass**. The phone creates an in-memory **session key** (`generatePrivateKey()`, never stored).
2. The wallet signs EIP-712 `CheckInRequest(uint256 contestId,address voter,address sessionKey,uint64 issuedAt)` — one approval, no fee. Domain: `{ name: "Arena", version: "1", chainId, verifyingContract }`.
3. The phone shows an **animated Pass QR** that changes every 2 s. Each frame contains the signed request **plus** `tick = floor(unixSeconds / 2)` signed by the session key (`tickDigest` in [contracts.md](contracts.md#off-chain-signed-data-verified-by-the-gate-not-the-contract)).
4. The Gate accepts only if: wallet signature valid for `voter`, `issuedAt` within `[now - 10 min, now + 30 s]`, `|tick - gateTick| <= 2`, tick signature recovers to `sessionKey`, voter not already checked in (chain read + local cache), ticket proof exists (if a ticket list is set).
5. A screenshot dies in ~4 seconds. Cheating needs a live video feed of a remote phone held up to the Gate camera — in front of staff.

**Gated mode needs a regular wallet (EOA).** Passkey smart wallets (Base Account) produce WebAuthn / ERC-6492 signatures of several hundred bytes to kilobytes, which don't fit a fast-scanning QR. In Gated contests the Connect sheet hides the Face ID option and says "Door check-in needs MetaMask or another browser wallet". (Decision D-13.)

**Pass QR payload (binary, 187 bytes → 250 chars base64url):** `arena:p1:` + base64url of
| Offset | Size | Field |
|---|---|---|
| 0 | 1 | version `0x01` |
| 1 | 4 | contestId (uint32 BE) |
| 5 | 20 | voter |
| 25 | 20 | sessionKey |
| 45 | 8 | issuedAt (uint64 BE) |
| 53 | 65 | wallet signature (r, s, v) |
| 118 | 4 | tick (uint32 BE) |
| 122 | 65 | tick signature |
The Gate rejects any other length. Error-correction level M, rendered ≥ 280 px wide; the spike confirms webcam read time.

### Gate device (`/c/[id]/gate`)
- First open: creates a **gatekeeper burner key** (`generatePrivateKey()`), stores it in `localStorage` under `arena:gate:{chainId}:{contestId}`, shows its address + QR. Organiser authorises it from `/c/[id]/manage` (`setGatekeeper`) and funds it (plain ETH transfer).
- Camera: `BarcodeDetector` if available, else `@zxing/browser`. Use the rear camera on phones, the webcam on laptops (Chrome recommended).
- On a valid pass: green full-screen flash + sound, the voter's short address, then ready for the next person in < 1 s. The check-in tx is **queued** (viem wallet client + nonce manager) — the Gate never waits for confirmation. A side panel lists pending/confirmed/failed check-ins with retry.
- Cooldown: ignore new passes for 1.5 s after a success, and flag a burst of more than 6 check-ins per minute from one Gate for staff attention.
- Drip: `value = dripPerCheckIn` from the contest (default 0.003 Sepolia ETH). Gate shows its balance and "≈ N check-ins left", warning below 10.
- Several Gates can run at once (each with its own burner key) for big doors.

## Threat model
| Attack | Anywhere | Room | Gated | Notes |
|---|---|---|---|---|
| Vote from home, alone | ✗ allowed | **Blocked** — no token | **Blocked** | |
| Friend in room texts the decoded token to someone at home | allowed | **Possible** within ~2 min | **Blocked** — remote wallet was never checked in | Main reason Gated exists |
| Record the sound, replay later | — | Blocked (token expires) | Blocked | |
| Predict tomorrow's tokens | — | Blocked (one-way chain) | Blocked | |
| Screenshot someone's Pass QR | — | — | Blocked (2 s tick) | |
| Live video call of a remote phone to the Gate | — | — | Possible, visible to staff | Needs collusion + staff blindness |
| One person, many wallets | Possible | Possible | Each wallet needs its own live pass at the door; staff see it | Ticket list makes it much harder |
| Organiser fakes presence for friends | Possible | Possible (holds seed) | Possible (holds gatekeeper keys) | Organiser is trusted for presence — documented |
| Entrant votes for self | Blocked (payee + members) | Blocked | Blocked | |
| Malicious frontend | Cannot make an invalid vote count | | | Contract enforces everything |
| Stage laptop seed leaked | — | Rotate beacon (`setBeacon` again) | Same | |
| Ticket list swapped after people were admitted | — | — | Blocked: list frozen at first check-in (`CheckInsStarted`) | |
| Gas-griefing / return-bomb voter contract blocks the Gate | — | — | Blocked: drip forwards 30k gas, copies no return data, defers on failure | |
| Gate burner key stolen | — | — | Organiser revokes (`setGatekeeper(..., false)`); thief can only check people in | |

Honest framing for the README and pitch: *Ground does not make cheating impossible. It makes remote and mass cheating cost more than a contest is worth, and the contract publishes exactly what was verified.*

## Device spike (do this first — Task 1 in the plan)
Goal: decide if sound is the primary channel before building on it.

Setup: `spikes/sound/` — a tiny Vite or plain-HTML page with **Transmit** (fixed 25-byte payload, protocol picker, volume) and **Receive** (shows decoded payloads with timestamps, success counter). Serve over HTTPS through a tunnel (`cloudflared tunnel --url http://localhost:5173` or `ngrok http 5173`).

Matrix (record results in `docs/decisions.md` under D-06):
| Transmitter | Receivers | Distances | Rooms | Protocols |
|---|---|---|---|---|
| MacBook speakers, one Bluetooth speaker | iPhone Safari, Android Chrome, (any extra phones) | 1 m, 5 m, 10 m | Quiet room, noisy room (music/talk at normal volume) | ULTRASOUND_FASTEST, ULTRASOUND_FAST, AUDIBLE_FASTEST |

Measure: time to first decode, decodes per minute, max working distance. Also record the byte size of a Base Account signature on Sepolia (confirms D-13).

**Pass:** in the noisy room at 5 m, every receiver decodes within 15 s with at least one ultrasound protocol → ultrasound is primary. **Partial:** only audible passes → audible is primary, ultrasound off. **Fail:** neither → QR beacon is primary, sound stays as an optional extra. Also test the Gate: can the laptop webcam read the animated Pass QR from a phone at 20–40 cm in under 1 s?
