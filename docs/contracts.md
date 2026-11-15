# Smart contract spec — `Arena`

One contract, `contracts/src/Arena.sol`, plus a library `contracts/src/lib/BeaconChain.sol`. Solidity `0.8.38`, OpenZeppelin v5.7.0 (`MerkleProof`, `ReentrancyGuard`). No upgradeability, no owner, no admin keys. Custom errors only, **all without parameters**.

> This document is normative: names, types, limits, check order and error names here are the interface the frontend and tests are written against. If implementation forces a change, update this file in the same commit and add a `decisions.md` entry.

## Constants
```solidity
uint256 constant MAX_TITLE_BYTES        = 80;
uint256 constant MAX_URI_BYTES          = 200;
uint256 constant MAX_ENTRIES            = 64;      // per contest, includes removed
uint256 constant MAX_MEMBERS            = 8;       // per entry
uint64  constant MIN_VOTING_DURATION    = 5 minutes;
uint64  constant MAX_VOTING_DURATION    = 7 days;
uint64  constant MAX_LEAD_TIME          = 60 days; // votingEnd - now at creation
uint96  constant MAX_DRIP               = 0.01 ether;
uint256 constant DRIP_GAS               = 30_000;  // gas forwarded with a drip
// beacon (BeaconChain.sol)
uint64  constant SLOT_SECONDS           = 10;
uint64  constant MAX_TOKEN_AGE          = 120;     // seconds after slot END a token is still accepted
uint64  constant MAX_FUTURE_SKEW        = 30;      // seconds before slot START a token is accepted
uint32  constant MAX_HASH_STEPS         = 4096;
uint32  constant MAX_CHAIN_LENGTH       = 100_000; // ~11.5 days of slots
```
Why `MAX_TOKEN_AGE = 120`: Sepolia blocks are ~12 s, and a voter may take 30–60 s in the wallet confirm screen. See [ground-presence.md](ground-presence.md#timing).

## Types
```solidity
enum Presence { Anywhere, Room, Gated }   // Room = beacon; Gated = check-in + beacon

struct CreateParams {
    string  title;            // 1..80 bytes
    string  metadataURI;      // 0..200 bytes, ipfs://CID of ContestMetadata JSON
    uint64  submissionEnd;    // entries accepted while now < submissionEnd
    uint64  votingStart;
    uint64  votingEnd;
    Presence presence;
    bool    openSubmissions;  // false = only organiser adds entries
    bytes32 ticketRoot;       // 0 = no ticket list
    string  ticketListURI;    // required iff ticketRoot != 0
    uint96  dripPerCheckIn;   // max ETH a gatekeeper may forward per check-in; must be 0 unless Gated
}

struct BeaconToken { uint32 slot; bytes16 token; }   // ignored when presence == Anywhere (pass zeros)

struct ContestView {
    uint256 id; address organiser; string title; string metadataURI;
    uint64 createdAt; uint64 submissionEnd; uint64 votingStart; uint64 votingEnd;
    Presence presence; bool openSubmissions; bool finalized;
    uint256 prize; uint96 dripPerCheckIn;
    bytes32 ticketRoot; string ticketListURI;
    uint32 entryCount; uint32 liveEntryCount; uint32 totalVotes; uint32 checkedInCount;
    bytes16 beaconAnchor;      // 0 = beacon not set
    uint64  beaconStart;
    uint32  beaconLength;
    uint32  beaconRotation;    // 0 = never set; 1 after the first setBeacon; +1 per rotation
    uint32  beaconCachedIndex; // chain index of the newest verified link (= length when nothing verified yet)
}

struct EntryView {
    uint32 id; address payee; address submitter; address[] members; string metadataURI; uint32 votes; bool removed;
}

enum BeaconStatus { Ok, NotSet, SlotOutOfRange, Expired, GapTooLarge, Invalid }
```
Entry and contest ids start at **1**. Id 0 always means "none".

### Storage layout (suggested)
```solidity
uint256 public contestCount;
mapping(uint256 => Contest) internal _contests;                 // Contest = ContestView fields minus id/derived/beacon
mapping(uint256 => Entry[]) internal _entries;                  // index = entryId - 1
mapping(uint256 => BeaconChain.State) internal _beacons;
mapping(uint256 => mapping(address => uint32)) public votedEntry;   // 0 = not voted
mapping(uint256 => mapping(address => bool))   public checkedIn;
mapping(uint256 => mapping(address => bool))   public isGatekeeper;
mapping(address => uint256)                    public claimable;
```
Pack `Contest` so the hot fields used by `vote()` (`votingStart`, `votingEnd`, `presence`, `finalized`, `ticketRoot`) sit in as few slots as practical.

### Ticket list (Merkle) encoding
OpenZeppelin **StandardMerkleTree** with leaf type `["address"]`: `leaf = keccak256(bytes.concat(keccak256(abi.encode(voter))))`, verified with `MerkleProof.verifyCalldata(proof, ticketRoot, leaf)`. The web side uses `@openzeppelin/merkle-tree` `StandardMerkleTree.of(addresses.map(a => [a]), ["address"])`.

### Who may vote for an entry
A voter **cannot** vote for an entry if they are its `payee`, one of its `members`, or its `submitter` — except that the **organiser is never banned as submitter** (in curated contests the organiser submits every entry). The organiser may vote like anyone else unless they are a payee or member.

## Functions
`ContestNotFound` (id 0 or > `contestCount`) is **always check #1** for every function that takes a `contestId`. Each function lists its remaining checks in the order they run; tests assert the exact error, including pairwise cases where two checks would fail.

### `createContest(CreateParams calldata p) external payable returns (uint256 contestId)`
`prize = msg.value` (0 allowed). Checks in order:
1. `InvalidTitle` — title empty or > 80 bytes
2. `InvalidURI` — metadataURI or ticketListURI > 200 bytes
3. `TicketListMismatch` — `ticketRoot != 0` xor `ticketListURI` non-empty
4. `InvalidTimeline` — not `block.timestamp < submissionEnd <= votingStart < votingEnd`, or `votingEnd > block.timestamp + MAX_LEAD_TIME`
5. `InvalidVotingDuration` — `votingEnd - votingStart` outside [5 min, 7 days]
6. `InvalidDrip` — `dripPerCheckIn > MAX_DRIP`, or non-zero when `presence != Gated`

Emits `ContestCreated(contestId, organiser, presence, prize, votingStart, votingEnd)`; if a ticket list is set, also `TicketListSet(contestId, ticketRoot, ticketListURI)`.

### `submitEntry(uint256 contestId, address payee, string calldata metadataURI, address[] calldata members) external returns (uint32 entryId)`
Checks: 1 `ContestNotFound` · 2 `SubmissionsClosed` (`now >= submissionEnd`) · 3 `NotOrganiser` (curated and caller ≠ organiser) · 4 `TooManyEntries` (already 64) · 5 `InvalidPayee` (zero) · 6 `InvalidURI` (empty or > 200) · 7 `TooManyMembers` (> 8) · 8 `InvalidMember` (zero, equals payee, or duplicate).
Stores `submitter = msg.sender`. Emits `EntrySubmitted(contestId, entryId, payee, msg.sender, metadataURI)`.

### `removeEntry(uint256 contestId, uint32 entryId) external`
Checks: 1 `ContestNotFound` · 2 `NotOrganiser` · 3 `VotingAlreadyStarted` (`now >= votingStart`) · 4 `EntryNotFound` · 5 `EntryRemoved`.
Emits `EntryWithdrawn(contestId, entryId)` (named so it doesn't clash with the `EntryRemoved` error).

### `setTicketList(uint256 contestId, bytes32 root, string calldata uri) external`
`root == 0` with `uri == ""` clears the list. Checks: 1 `ContestNotFound` · 2 `NotOrganiser` · 3 `VotingAlreadyStarted` · 4 `CheckInsStarted` (`checkedInCount > 0` — the list can't change under people already admitted) · 5 `InvalidURI` · 6 `TicketListMismatch`.
Emits `TicketListSet(contestId, root, uri)`.

### `setBeacon(uint256 contestId, bytes16 anchor, uint64 start, uint32 length) external`
First call sets the beacon; later calls **rotate** it (laptop lost, seed leaked) and invalidate all old tokens.
Checks: 1 `ContestNotFound` · 2 `NotOrganiser` · 3 `PresenceNotRequired` (`presence == Anywhere`) · 4 `VotingEnded` (`now >= votingEnd`) · 5 `InvalidBeacon` (`anchor == 0`, `length == 0`, `length > MAX_CHAIN_LENGTH`, or `start >= votingEnd`).
Effects: `anchor, start, length` stored; `rotation += 1`; `cachedIndex = length`; `cachedLink = anchor`.
Emits `BeaconSet(contestId, anchor, start, length, rotation)`.

### `advanceBeacon(uint256 contestId, BeaconToken calldata t) external`
Anyone (the Stage calls it from its own burner wallet). Moves the cache forward **without the token-age window**, so the chain can be bridged after a long quiet period (e.g. overnight in a multi-day contest).
Checks: 1 `ContestNotFound` · 2 `VotingEnded` · 3 beacon status from `BeaconChain.check(..., requireFresh = false)`; additionally the slot must not be in the future: `start + slot*SLOT_SECONDS > now + MAX_FUTURE_SKEW` → `BeaconExpired`. Token must be **newer** than the cache (`idx < cachedIndex`), else `InvalidBeaconToken`. Gap > `MAX_HASH_STEPS` → `BeaconGapTooLarge` (the Stage holds the whole chain, so it submits links in hops of ≤ 4096).
Effects: cache update. Emits `BeaconAdvanced(contestId, slot)`.
Revealing an old link is harmless: anyone who heard a newer token can already compute it.

### `setGatekeeper(uint256 contestId, address gatekeeper, bool allowed) external`
Checks: 1 `ContestNotFound` · 2 `NotOrganiser` · 3 `PresenceNotGated` · 4 `InvalidGatekeeper` (zero).
Emits `GatekeeperSet(contestId, gatekeeper, allowed)`. The current gatekeeper set is rebuilt off-chain from these logs (chunked queries, see frontend.md).

### `checkIn(uint256 contestId, address voter, bytes32[] calldata ticketProof) external payable nonReentrant`
Checks: 1 `ContestNotFound` · 2 `PresenceNotGated` · 3 `NotGatekeeper` · 4 `VotingEnded` · 5 `InvalidVoter` (zero) · 6 `AlreadyCheckedIn` · 7 `NotOnTicketList` (`ticketRoot != 0` and proof fails) · 8 `InvalidDrip` (`msg.value > dripPerCheckIn`).
Effects: `checkedIn = true`, `checkedInCount++`.
Interaction (drip): if `msg.value > 0`, send it to `voter` with an assembly `call` forwarding **`DRIP_GAS` (30,000) gas** and copying **no return data** (defeats gas-burning and return-data bombs). If the call fails, add the amount to `claimable[voter]` and emit `DripDeferred(contestId, voter, amount)`. The drip never makes `checkIn` revert.
Emits `CheckedIn(contestId, voter, msg.sender, msg.value)`.

### `vote(uint256 contestId, uint32 entryId, BeaconToken calldata beacon, bytes32[] calldata ticketProof) external`
Checks in order:
1. `ContestNotFound`
2. `VotingNotOpen` — `now < votingStart` or `now >= votingEnd`
3. `EntryNotFound` / `EntryRemoved`
4. `AlreadyVoted`
5. `CannotVoteForOwnEntry` — see "Who may vote" above
6. `NotCheckedIn` — Gated and not checked in
7. `NotOnTicketList` — `ticketRoot != 0`, presence is **not** Gated (Gated checks at the door, and the list is frozen once check-ins start), and the proof fails
8. Beacon (Room and Gated): status from `BeaconChain.check(..., requireFresh = true)` mapped to `BeaconNotSet`, `BeaconSlotOutOfRange`, `BeaconExpired`, `BeaconGapTooLarge`, `InvalidBeaconToken`

Effects: `votedEntry = entryId`, `entry.votes++`, `totalVotes++`, beacon cache update if the token is newer than the cache.
Emits `VoteCast(contestId, entryId, voter)`.

### `finalize(uint256 contestId) external`
Anyone. Checks: 1 `ContestNotFound` · 2 `VotingNotEnded` (`now < votingEnd`) · 3 `AlreadyFinalized`.
- Winners = all non-removed entries with the maximum vote count, if that maximum is > 0.
- `share = prize / winners.length`; each winner's **payee** gets `claimable += share`; the remainder (`prize % winners.length`) goes to the organiser.
- No votes or no entries: `claimable[organiser] += prize`, `share = 0`, `winnerIds = []`.
- Emits `ContestFinalized(contestId, winnerIds, share)`.

### `withdraw() external nonReentrant`
Sends `claimable[msg.sender]` (zeroed first). Reverts `NothingToClaim` if 0, `TransferFailed` if the call fails. Emits `Withdrawn(account, amount)`.
Known limit: a deferred drip owed to a contract that can't receive ETH stays stuck (documented, tiny amounts).

### Views
```solidity
function getContest(uint256 contestId) external view returns (ContestView memory);          // reverts ContestNotFound
function getContests(uint256 offset, uint256 limit) external view returns (ContestView[] memory); // newest first; limit capped at 50; offset past end → empty
function getEntries(uint256 contestId) external view returns (EntryView[] memory);           // includes removed (flagged)
function voterState(uint256 contestId, address voter) external view returns (uint32 votedEntryId, bool isCheckedIn);
function beaconStatus(uint256 contestId, BeaconToken calldata t) external view returns (BeaconStatus); // fresh-window check, no state change; NotSet for Anywhere contests
function isBeaconTokenValid(uint256 contestId, BeaconToken calldata t) external view returns (bool);   // beaconStatus == Ok
function computeNextLink(bytes16 link) external pure returns (bytes16);                       // parity helper
```

## Events (indexed fields marked)
```solidity
event ContestCreated(uint256 indexed contestId, address indexed organiser, Presence presence, uint256 prize, uint64 votingStart, uint64 votingEnd);
event EntrySubmitted(uint256 indexed contestId, uint32 indexed entryId, address indexed payee, address submitter, string metadataURI);
event EntryWithdrawn(uint256 indexed contestId, uint32 indexed entryId);
event TicketListSet(uint256 indexed contestId, bytes32 root, string uri);
event BeaconSet(uint256 indexed contestId, bytes16 anchor, uint64 start, uint32 length, uint32 rotation);
event BeaconAdvanced(uint256 indexed contestId, uint32 slot);
event GatekeeperSet(uint256 indexed contestId, address indexed gatekeeper, bool allowed);
event CheckedIn(uint256 indexed contestId, address indexed voter, address indexed gatekeeper, uint256 drip);
event DripDeferred(uint256 indexed contestId, address indexed voter, uint256 amount);
event VoteCast(uint256 indexed contestId, uint32 indexed entryId, address indexed voter);
event ContestFinalized(uint256 indexed contestId, uint32[] winnerIds, uint256 share);
event Withdrawn(address indexed account, uint256 amount);
```

## Errors (complete list, no parameters)
`ContestNotFound, InvalidTitle, InvalidURI, InvalidTimeline, InvalidVotingDuration, TicketListMismatch, InvalidDrip, SubmissionsClosed, NotOrganiser, InvalidPayee, TooManyMembers, InvalidMember, TooManyEntries, VotingAlreadyStarted, CheckInsStarted, EntryNotFound, EntryRemoved, PresenceNotRequired, PresenceNotGated, VotingEnded, InvalidBeacon, InvalidGatekeeper, NotGatekeeper, AlreadyCheckedIn, NotOnTicketList, InvalidVoter, VotingNotOpen, AlreadyVoted, CannotVoteForOwnEntry, NotCheckedIn, BeaconNotSet, BeaconSlotOutOfRange, BeaconExpired, BeaconGapTooLarge, InvalidBeaconToken, VotingNotEnded, AlreadyFinalized, NothingToClaim, TransferFailed`

The frontend maps every one to plain-English copy in `web/src/lib/errors.ts` ([frontend.md](frontend.md#error-copy)); a test fails if any ABI error lacks copy.

## `BeaconChain` library
```solidity
library BeaconChain {
    struct State { bytes16 anchor; uint64 start; uint32 length; uint32 rotation; uint32 cachedIndex; bytes16 cachedLink; }
    function next(bytes16 link) internal pure returns (bytes16);          // bytes16(keccak256(abi.encodePacked(link)))
    function check(State storage s, uint32 slot, bytes16 token, uint64 nowTs, bool requireFresh)
        internal view returns (BeaconStatus status, uint32 idx);
    function commit(State storage s, uint32 idx, bytes16 token) internal; // writes cache iff idx < cachedIndex
}
```
`check` is `view` and **never reverts**; callers map the status to errors (`vote`, `advanceBeacon`) or return it (`beaconStatus`).

### Chain definition (must match `web/src/lib/beacon/chain.ts` byte-for-byte)
- `seed` is 32 bytes. `c[0] = bytes16(keccak256(abi.encodePacked(seed)))` — hashes exactly 32 bytes.
- `next(x) = bytes16(keccak256(abi.encodePacked(x)))` — hashes exactly 16 bytes, no padding. `bytes16(y)` takes the **high-order (leftmost) 16 bytes** of the 32-byte hash. In TS: `slice(keccak256(x), 0, 16)`.
- `c[k+1] = next(c[k])`, for `k = 0 … N-1`. `anchor = c[N]`, `N = length`. The TS array has **N + 1** elements.
- Token for slot `s` (0 ≤ s < N) is `c[N-1-s]`; in TS `chain[chain.length - 2 - s]`. Chain index `idx = N - 1 - s`.
- Slot `s` covers `[start + s*10, start + (s+1)*10)`.

### `check` algorithm
1. `anchor == 0` → `NotSet`. `slot >= length` → `SlotOutOfRange`.
2. If `requireFresh`: `slotStart = start + slot*10`, `slotEnd = slotStart + 10`. Require `slotStart <= nowTs + MAX_FUTURE_SKEW` **and** `nowTs <= slotEnd + MAX_TOKEN_AGE`, else `Expired`. (Boundaries: accepted at `slotStart - 30` and `slotEnd + 120`; rejected at `slotStart - 31` and `slotEnd + 121`.)
3. `idx = length - 1 - slot`.
4. If `idx < cachedIndex` (newer than the cache): `steps = cachedIndex - idx`; `steps > MAX_HASH_STEPS` → `GapTooLarge`; hash `token` forward `steps` times; must equal `cachedLink`, else `Invalid`.
5. Else (same age or older): `steps = idx - cachedIndex`; `> MAX_HASH_STEPS` → `GapTooLarge`; hash `cachedLink` forward `steps` times (0 = compare directly); must equal `token`, else `Invalid`.
6. `Ok`.

Direction: `next` maps `c[k] → c[k+1]`, and newer slots have **lower** indices. From a newer token you can derive every older one, never the reverse — hearing the current token never reveals a future one. The time window (step 2) is what makes old tokens useless for voting.

Gas: worst case 4096 keccaks ≈ 250k gas; a warm cache (the Stage advances it every minute) means 1–10 steps per vote.

## Off-chain signed data (verified by the Gate, not the contract)
EIP-712 domain: `{ name: "Arena", version: "1", chainId, verifyingContract: <Arena address> }`.
```
CheckInRequest(uint256 contestId,address voter,address sessionKey,uint64 issuedAt)
```
Live tick (signed by the session key, EIP-191 `personal_sign` over the 32-byte digest):
```
tickDigest = keccak256(abi.encode("arena-tick-v1", chainId, arenaAddress, contestId, voter, uint64 tick))   // tick = floor(unixSeconds / 2)
```
Gate rules: wallet signature valid for `voter` (`verifyTypedData`); `issuedAt` within `[now - 10 min, now + 30 s]`; `|tick - gateTick| <= 2`; tick signature recovers to `sessionKey`. Full flow and QR encoding: [ground-presence.md](ground-presence.md#part-2--door-check-in-gated-mode).
Parity fixtures pin `chainId = 31337` and `verifyingContract = 0x5FbDB2315678afecb367f032d93F642f64180aa3` (first Anvil deployment address).

## Security checklist
- Checks-effects-interactions everywhere; `nonReentrant` on `checkIn` and `withdraw`.
- Pull payments for prizes; capped-gas push with fallback-to-claimable for drips.
- No unbounded loops over user data: entries ≤ 64, members ≤ 8, hash steps ≤ 4096.
- Self-vote ban covers payee, members and (non-organiser) submitter.
- Ticket list frozen once voting starts or the first check-in happens.
- Organiser cannot change the timeline, remove entries or change the ticket list after voting starts. Organiser **can** rotate the beacon and add/revoke gatekeepers during voting — documented trust (presence only).
- `block.timestamp` skew of a few seconds is irrelevant at these window sizes.

## Invariants (`Arena.Invariant.t.sol`)
1. For every contest: `Σ entry.votes == totalVotes`.
2. For every contest and voter: at most one vote.
3. `address(this).balance >= Σ prize of non-finalized contests + Σ claimable` (`>=` because ETH can be force-sent).
4. A finalized contest allocated exactly its prize (shares × winners + dust, or full refund).
5. `checkedInCount` equals the number of voters with `checkedIn == true`.

## Off-chain JSON (on IPFS)
All length limits are **UTF-8 bytes** (measured with `TextEncoder`).
```ts
// ContestMetadata
{ "version": 1, "description": string /* ≤ 1000 bytes */, "cover"?: "ipfs://CID", "links"?: { "label": string /* ≤ 40 */, "url": string /* https only, ≤ 200 */ }[] /* ≤ 4 */ }
// EntryMetadata
{ "version": 1, "name": string /* 1..60 bytes */, "tagline": string /* ≤ 120 bytes */, "description": string /* ≤ 1000 bytes */, "image"?: "ipfs://CID", "links"?: same as above }
// TicketList
{ "version": 1, "format": "oz-standard-merkle-tree", "tree": <StandardMerkleTree.dump()> }
```
Validate with zod on read; invalid metadata renders as "Untitled entry" rather than crashing. Links render with `rel="noopener noreferrer"`.
