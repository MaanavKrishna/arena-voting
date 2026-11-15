// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BeaconChain, BeaconStatus} from "./lib/BeaconChain.sol";

/// @notice How a contest proves voters are present. Room = beacon; Gated = check-in + beacon.
enum Presence {
    Anywhere,
    Room,
    Gated
}

/// @notice Arguments for `createContest`.
struct CreateParams {
    string title;
    string metadataURI;
    uint64 submissionEnd;
    uint64 votingStart;
    uint64 votingEnd;
    Presence presence;
    bool openSubmissions;
    bytes32 ticketRoot;
    string ticketListURI;
    uint96 dripPerCheckIn;
}

/// @notice A beacon token heard by a voter. Ignored (pass zeros) when presence is Anywhere.
struct BeaconToken {
    uint32 slot;
    bytes16 token;
}

/// @notice Read model of a contest.
struct ContestView {
    uint256 id;
    address organiser;
    string title;
    string metadataURI;
    uint64 createdAt;
    uint64 submissionEnd;
    uint64 votingStart;
    uint64 votingEnd;
    Presence presence;
    bool openSubmissions;
    bool finalized;
    uint256 prize;
    uint96 dripPerCheckIn;
    bytes32 ticketRoot;
    string ticketListURI;
    uint32 entryCount;
    uint32 liveEntryCount;
    uint32 totalVotes;
    uint32 checkedInCount;
    bytes16 beaconAnchor;
    uint64 beaconStart;
    uint32 beaconLength;
    uint32 beaconRotation;
    uint32 beaconCachedIndex;
}

/// @notice Read model of an entry.
struct EntryView {
    uint32 id;
    address payee;
    address submitter;
    address[] members;
    string metadataURI;
    uint32 votes;
    bool removed;
}

/// @title Arena
/// @notice Contests decided by the people in the room. Organisers lock an ETH prize, teams submit
///         entries, attendees vote, and the contract pays the winner. Presence is proven by a
///         hash-chain sound beacon and an optional door check-in.
/// @dev No owner, no admin, no upgradeability. Prizes are pull payments.
contract Arena is ReentrancyGuard {
    using BeaconChain for BeaconChain.State;

    // ---------------------------------------------------------------- constants

    uint256 public constant MAX_TITLE_BYTES = 80;
    uint256 public constant MAX_URI_BYTES = 200;
    /// @notice Live (non-removed) entries per contest.
    uint256 public constant MAX_ENTRIES = 64;
    /// @notice Entries ever pushed per contest, removed ones included. Bounds the finalize loop.
    uint256 public constant MAX_TOTAL_ENTRIES = 128;
    /// @notice Entries one non-organiser may submit to an open contest (removals don't refund it).
    uint256 public constant MAX_ENTRIES_PER_SUBMITTER = 3;
    uint256 public constant MAX_MEMBERS = 8;
    uint64 public constant MIN_VOTING_DURATION = 5 minutes;
    uint64 public constant MAX_VOTING_DURATION = 7 days;
    uint64 public constant MAX_LEAD_TIME = 60 days;
    uint96 public constant MAX_DRIP = 0.01 ether;
    uint256 public constant DRIP_GAS = 30_000;
    uint256 internal constant MAX_PAGE = 50;

    // ---------------------------------------------------------------- storage

    /// @dev Packed so `vote()` reads slots 0-2 (+ slot 3 for the tally).
    struct Contest {
        // slot 0
        address organiser;
        Presence presence;
        bool finalized;
        bool openSubmissions;
        uint32 entryCount;
        uint32 liveEntryCount;
        // slot 1
        uint64 votingStart;
        uint64 votingEnd;
        uint64 submissionEnd;
        uint64 createdAt;
        // slot 2
        bytes32 ticketRoot;
        // slot 3
        uint96 dripPerCheckIn;
        uint32 totalVotes;
        uint32 checkedInCount;
        // slot 4+
        uint256 prize;
        string title;
        string metadataURI;
        string ticketListURI;
    }

    struct Entry {
        address payee;
        uint32 votes;
        bool removed;
        address submitter;
        address[] members;
        string metadataURI;
    }

    /// @notice Number of contests created; ids run 1..contestCount.
    uint256 public contestCount;
    mapping(uint256 => Contest) internal _contests;
    mapping(uint256 => Entry[]) internal _entries;
    mapping(uint256 => BeaconChain.State) internal _beacons;
    /// @notice Entry a voter voted for in a contest (0 = not voted).
    mapping(uint256 => mapping(address => uint32)) public votedEntry;
    /// @notice Whether a voter has been checked in at the door of a Gated contest.
    mapping(uint256 => mapping(address => bool)) public checkedIn;
    /// @notice Whether an address may check voters in for a Gated contest.
    mapping(uint256 => mapping(address => bool)) public isGatekeeper;
    /// @notice ETH an account can withdraw (prizes, refunds, deferred drips).
    mapping(address => uint256) public claimable;
    /// @notice Entries a non-organiser has submitted to a contest (never decremented; organiser not counted).
    mapping(uint256 => mapping(address => uint32)) public entriesSubmitted;

    // ----------------------------------------------------------------- events

    event ContestCreated(
        uint256 indexed contestId,
        address indexed organiser,
        Presence presence,
        uint256 prize,
        uint64 votingStart,
        uint64 votingEnd
    );
    event EntrySubmitted(
        uint256 indexed contestId,
        uint32 indexed entryId,
        address indexed payee,
        address submitter,
        string metadataURI
    );
    event EntryWithdrawn(uint256 indexed contestId, uint32 indexed entryId);
    event TicketListSet(uint256 indexed contestId, bytes32 root, string uri);
    event BeaconSet(uint256 indexed contestId, bytes16 anchor, uint64 start, uint32 length, uint32 rotation);
    event BeaconAdvanced(uint256 indexed contestId, uint32 slot);
    event GatekeeperSet(uint256 indexed contestId, address indexed gatekeeper, bool allowed);
    event CheckedIn(
        uint256 indexed contestId, address indexed voter, address indexed gatekeeper, uint256 drip
    );
    event DripDeferred(uint256 indexed contestId, address indexed voter, uint256 amount);
    event VoteCast(uint256 indexed contestId, uint32 indexed entryId, address indexed voter);
    event ContestFinalized(uint256 indexed contestId, uint32[] winnerIds, uint256 share);
    event Withdrawn(address indexed account, uint256 amount);

    // ----------------------------------------------------------------- errors

    error ContestNotFound();
    error InvalidTitle();
    error InvalidURI();
    error InvalidTimeline();
    error InvalidVotingDuration();
    error TicketListMismatch();
    error InvalidDrip();
    error SubmissionsClosed();
    error NotOrganiser();
    error InvalidPayee();
    error TooManyMembers();
    error InvalidMember();
    error TooManyEntries();
    error TooManyEntriesFromSubmitter();
    error VotingAlreadyStarted();
    error CheckInsStarted();
    error EntryNotFound();
    error EntryRemoved();
    error PresenceNotRequired();
    error PresenceNotGated();
    error VotingEnded();
    error InvalidBeacon();
    error InvalidGatekeeper();
    error NotGatekeeper();
    error AlreadyCheckedIn();
    error NotOnTicketList();
    error InvalidVoter();
    error VotingNotOpen();
    error AlreadyVoted();
    error CannotVoteForOwnEntry();
    error NotCheckedIn();
    error BeaconNotSet();
    error BeaconSlotOutOfRange();
    error BeaconExpired();
    error BeaconGapTooLarge();
    error InvalidBeaconToken();
    error VotingNotEnded();
    error AlreadyFinalized();
    error NothingToClaim();
    error TransferFailed();

    // --------------------------------------------------------------- internal

    function _contest(uint256 contestId) internal view returns (Contest storage c) {
        if (contestId == 0 || contestId > contestCount) revert ContestNotFound();
        c = _contests[contestId];
    }

    function _onlyOrganiser(Contest storage c) internal view {
        if (msg.sender != c.organiser) revert NotOrganiser();
    }

    function _ticketLeaf(address account) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account))));
    }

    function _onTicketList(bytes32 root, address account, bytes32[] calldata proof)
        internal
        pure
        returns (bool)
    {
        return MerkleProof.verifyCalldata(proof, root, _ticketLeaf(account));
    }

    function _revertBeacon(BeaconStatus status) internal pure {
        if (status == BeaconStatus.Ok) return;
        if (status == BeaconStatus.NotSet) revert BeaconNotSet();
        if (status == BeaconStatus.SlotOutOfRange) revert BeaconSlotOutOfRange();
        if (status == BeaconStatus.Expired) revert BeaconExpired();
        if (status == BeaconStatus.GapTooLarge) revert BeaconGapTooLarge();
        revert InvalidBeaconToken();
    }

    // ---------------------------------------------------------------- contests

    /// @notice Creates a contest. `msg.value` is locked as the prize (0 allowed).
    /// @param p contest parameters; see `CreateParams`
    /// @return contestId the new contest id (ids start at 1)
    function createContest(CreateParams calldata p) external payable returns (uint256 contestId) {
        uint256 titleLen = bytes(p.title).length;
        if (titleLen == 0 || titleLen > MAX_TITLE_BYTES) revert InvalidTitle();
        if (bytes(p.metadataURI).length > MAX_URI_BYTES || bytes(p.ticketListURI).length > MAX_URI_BYTES) {
            revert InvalidURI();
        }
        if ((p.ticketRoot != bytes32(0)) != (bytes(p.ticketListURI).length != 0)) {
            revert TicketListMismatch();
        }
        if (
            !(block.timestamp < p.submissionEnd
                    && p.submissionEnd <= p.votingStart
                    && p.votingStart < p.votingEnd) || p.votingEnd > block.timestamp + MAX_LEAD_TIME
        ) revert InvalidTimeline();
        uint64 duration = p.votingEnd - p.votingStart;
        if (duration < MIN_VOTING_DURATION || duration > MAX_VOTING_DURATION) revert InvalidVotingDuration();
        if (p.dripPerCheckIn > MAX_DRIP || (p.dripPerCheckIn != 0 && p.presence != Presence.Gated)) {
            revert InvalidDrip();
        }

        contestId = ++contestCount;
        Contest storage c = _contests[contestId];
        c.organiser = msg.sender;
        c.presence = p.presence;
        c.openSubmissions = p.openSubmissions;
        c.votingStart = p.votingStart;
        c.votingEnd = p.votingEnd;
        c.submissionEnd = p.submissionEnd;
        c.createdAt = uint64(block.timestamp);
        c.ticketRoot = p.ticketRoot;
        c.dripPerCheckIn = p.dripPerCheckIn;
        c.prize = msg.value;
        c.title = p.title;
        c.metadataURI = p.metadataURI;
        c.ticketListURI = p.ticketListURI;

        emit ContestCreated(contestId, msg.sender, p.presence, msg.value, p.votingStart, p.votingEnd);
        if (p.ticketRoot != bytes32(0)) emit TicketListSet(contestId, p.ticketRoot, p.ticketListURI);
    }

    /// @notice Adds an entry. Open contests accept anyone (at most 3 per non-organiser); curated ones
    ///         only the organiser. At most 64 live entries and 128 ever pushed per contest.
    /// @param contestId the contest
    /// @param payee receives the prize share if this entry wins (also banned from voting for it)
    /// @param metadataURI ipfs:// URI of the EntryMetadata JSON (1..200 bytes)
    /// @param members up to 8 team members, banned from voting for this entry
    /// @return entryId the new entry id (ids start at 1)
    function submitEntry(
        uint256 contestId,
        address payee,
        string calldata metadataURI,
        address[] calldata members
    ) external returns (uint32 entryId) {
        Contest storage c = _contest(contestId);
        if (block.timestamp >= c.submissionEnd) revert SubmissionsClosed();
        if (!c.openSubmissions && msg.sender != c.organiser) revert NotOrganiser();
        if (c.liveEntryCount >= MAX_ENTRIES || c.entryCount >= MAX_TOTAL_ENTRIES) revert TooManyEntries();
        bool counted = msg.sender != c.organiser;
        if (counted && entriesSubmitted[contestId][msg.sender] >= MAX_ENTRIES_PER_SUBMITTER) {
            revert TooManyEntriesFromSubmitter();
        }
        if (payee == address(0) || payee == address(this)) revert InvalidPayee();
        uint256 uriLen = bytes(metadataURI).length;
        if (uriLen == 0 || uriLen > MAX_URI_BYTES) revert InvalidURI();
        uint256 n = members.length;
        if (n > MAX_MEMBERS) revert TooManyMembers();
        for (uint256 i; i < n; ++i) {
            address m = members[i];
            if (m == address(0) || m == payee || m == address(this)) revert InvalidMember();
            for (uint256 j; j < i; ++j) {
                if (members[j] == m) revert InvalidMember();
            }
        }

        if (counted) ++entriesSubmitted[contestId][msg.sender];
        entryId = ++c.entryCount;
        ++c.liveEntryCount;
        Entry storage e = _entries[contestId].push();
        e.payee = payee;
        e.submitter = msg.sender;
        e.members = members;
        e.metadataURI = metadataURI;

        emit EntrySubmitted(contestId, entryId, payee, msg.sender, metadataURI);
    }

    /// @notice Removes an entry before voting starts. Frees a live slot; the entry still counts
    ///         towards MAX_TOTAL_ENTRIES and its submitter's quota.
    /// @param contestId the contest
    /// @param entryId the entry to remove
    function removeEntry(uint256 contestId, uint32 entryId) external {
        Contest storage c = _contest(contestId);
        _onlyOrganiser(c);
        if (block.timestamp >= c.votingStart) revert VotingAlreadyStarted();
        if (entryId == 0 || entryId > c.entryCount) revert EntryNotFound();
        Entry storage e = _entries[contestId][entryId - 1];
        if (e.removed) revert EntryRemoved();

        e.removed = true;
        --c.liveEntryCount;
        emit EntryWithdrawn(contestId, entryId);
    }

    /// @notice Sets or clears (root 0 and empty uri) the ticket list. Frozen once voting starts
    ///         or the first check-in happens.
    /// @param contestId the contest
    /// @param root StandardMerkleTree root over ["address"] leaves
    /// @param uri ipfs:// URI of the TicketList JSON
    function setTicketList(uint256 contestId, bytes32 root, string calldata uri) external {
        Contest storage c = _contest(contestId);
        _onlyOrganiser(c);
        if (block.timestamp >= c.votingStart) revert VotingAlreadyStarted();
        if (c.checkedInCount > 0) revert CheckInsStarted();
        if (bytes(uri).length > MAX_URI_BYTES) revert InvalidURI();
        if ((root != bytes32(0)) != (bytes(uri).length != 0)) revert TicketListMismatch();

        c.ticketRoot = root;
        c.ticketListURI = uri;
        emit TicketListSet(contestId, root, uri);
    }

    // ------------------------------------------------------------------ beacon

    /// @notice Sets the room beacon, or rotates it (invalidating every old token).
    /// @param contestId the contest (Room or Gated)
    /// @param anchor c[length], the end of the hash chain
    /// @param start timestamp at which slot 0 begins (must be before votingEnd)
    /// @param length number of slots (1..100000)
    function setBeacon(uint256 contestId, bytes16 anchor, uint64 start, uint32 length) external {
        Contest storage c = _contest(contestId);
        _onlyOrganiser(c);
        if (c.presence == Presence.Anywhere) revert PresenceNotRequired();
        if (block.timestamp >= c.votingEnd) revert VotingEnded();
        if (
            anchor == bytes16(0) || length == 0 || length > BeaconChain.MAX_CHAIN_LENGTH
                || start >= c.votingEnd
        ) revert InvalidBeacon();

        BeaconChain.State storage b = _beacons[contestId];
        uint32 rotation = b.rotation + 1;
        b.anchor = anchor;
        b.start = start;
        b.length = length;
        b.rotation = rotation;
        b.cachedIndex = length;
        b.cachedLink = anchor;
        emit BeaconSet(contestId, anchor, start, length, rotation);
    }

    /// @notice Moves the beacon cache forward without the token-age window, so the Stage can
    ///         bridge long quiet periods in hops of at most 4096 slots. Callable by anyone.
    /// @param contestId the contest
    /// @param t a chain link newer than the cached one, for a slot that has started (30 s skew)
    function advanceBeacon(uint256 contestId, BeaconToken calldata t) external {
        Contest storage c = _contest(contestId);
        if (block.timestamp >= c.votingEnd) revert VotingEnded();
        BeaconChain.State storage b = _beacons[contestId];
        if (b.anchor == bytes16(0)) revert BeaconNotSet();
        if (t.slot >= b.length) revert BeaconSlotOutOfRange();
        if (
            uint256(b.start) + uint256(t.slot) * BeaconChain.SLOT_SECONDS
                > block.timestamp + BeaconChain.MAX_FUTURE_SKEW
        ) {
            revert BeaconExpired();
        }
        if (b.length - 1 - t.slot >= b.cachedIndex) revert InvalidBeaconToken();

        (BeaconStatus status, uint32 idx) = b.check(t.slot, t.token, uint64(block.timestamp), false);
        _revertBeacon(status);
        b.commit(idx, t.token);
        emit BeaconAdvanced(contestId, t.slot);
    }

    // -------------------------------------------------------------------- gate

    /// @notice Authorises or revokes a gatekeeper for a Gated contest.
    /// @param contestId the contest
    /// @param gatekeeper the Gate device's address
    /// @param allowed true to authorise, false to revoke
    function setGatekeeper(uint256 contestId, address gatekeeper, bool allowed) external {
        Contest storage c = _contest(contestId);
        _onlyOrganiser(c);
        if (c.presence != Presence.Gated) revert PresenceNotGated();
        if (gatekeeper == address(0)) revert InvalidGatekeeper();

        isGatekeeper[contestId][gatekeeper] = allowed;
        emit GatekeeperSet(contestId, gatekeeper, allowed);
    }

    /// @notice Records that `voter` was seen at the door. Optionally forwards `msg.value`
    ///         (≤ dripPerCheckIn) to the voter with 30,000 gas; a failed drip becomes claimable.
    /// @param contestId the Gated contest
    /// @param voter the wallet being admitted
    /// @param ticketProof Merkle proof when the contest has a ticket list
    function checkIn(uint256 contestId, address voter, bytes32[] calldata ticketProof)
        external
        payable
        nonReentrant
    {
        Contest storage c = _contest(contestId);
        if (c.presence != Presence.Gated) revert PresenceNotGated();
        if (!isGatekeeper[contestId][msg.sender]) revert NotGatekeeper();
        if (block.timestamp >= c.votingEnd) revert VotingEnded();
        if (voter == address(0)) revert InvalidVoter();
        if (checkedIn[contestId][voter]) revert AlreadyCheckedIn();
        bytes32 root = c.ticketRoot;
        if (root != bytes32(0) && !_onTicketList(root, voter, ticketProof)) revert NotOnTicketList();
        if (msg.value > c.dripPerCheckIn) revert InvalidDrip();

        checkedIn[contestId][voter] = true;
        ++c.checkedInCount;

        if (msg.value > 0) {
            bool ok;
            uint256 gasCap = DRIP_GAS;
            assembly ("memory-safe") {
                ok := call(gasCap, voter, callvalue(), 0, 0, 0, 0)
            }
            if (!ok) {
                claimable[voter] += msg.value;
                emit DripDeferred(contestId, voter, msg.value);
            }
        }
        emit CheckedIn(contestId, voter, msg.sender, msg.value);
    }

    // -------------------------------------------------------------------- vote

    /// @notice Casts one vote. Room and Gated contests need a fresh beacon token; Gated also needs
    ///         a check-in; contests with a ticket list (not Gated) need a Merkle proof.
    /// @param contestId the contest
    /// @param entryId the entry voted for
    /// @param beacon the beacon token heard in the room (zeros for Anywhere)
    /// @param ticketProof Merkle proof when the contest has a ticket list and is not Gated
    function vote(
        uint256 contestId,
        uint32 entryId,
        BeaconToken calldata beacon,
        bytes32[] calldata ticketProof
    ) external {
        Contest storage c = _contest(contestId);
        if (block.timestamp < c.votingStart || block.timestamp >= c.votingEnd) revert VotingNotOpen();
        if (entryId == 0 || entryId > c.entryCount) revert EntryNotFound();
        Entry storage e = _entries[contestId][entryId - 1];
        if (e.removed) revert EntryRemoved();
        if (votedEntry[contestId][msg.sender] != 0) revert AlreadyVoted();
        if (e.payee == msg.sender || (e.submitter == msg.sender && msg.sender != c.organiser)) {
            revert CannotVoteForOwnEntry();
        }
        address[] storage members = e.members;
        uint256 n = members.length;
        for (uint256 i; i < n; ++i) {
            if (members[i] == msg.sender) revert CannotVoteForOwnEntry();
        }
        Presence presence = c.presence;
        if (presence == Presence.Gated && !checkedIn[contestId][msg.sender]) revert NotCheckedIn();
        bytes32 root = c.ticketRoot;
        if (root != bytes32(0) && presence != Presence.Gated && !_onTicketList(root, msg.sender, ticketProof))
        {
            revert NotOnTicketList();
        }

        BeaconChain.State storage b = _beacons[contestId];
        uint32 idx;
        if (presence != Presence.Anywhere) {
            BeaconStatus status;
            (status, idx) = b.check(beacon.slot, beacon.token, uint64(block.timestamp), true);
            _revertBeacon(status);
        }

        votedEntry[contestId][msg.sender] = entryId;
        ++e.votes;
        ++c.totalVotes;
        if (presence != Presence.Anywhere) b.commit(idx, beacon.token);

        emit VoteCast(contestId, entryId, msg.sender);
    }

    // ---------------------------------------------------------------- payout

    /// @notice Ends a contest after votingEnd and credits the prize. Callable by anyone.
    ///         Ties split evenly (dust to the organiser); no votes refunds the organiser.
    /// @param contestId the contest
    function finalize(uint256 contestId) external {
        Contest storage c = _contest(contestId);
        if (block.timestamp < c.votingEnd) revert VotingNotEnded();
        if (c.finalized) revert AlreadyFinalized();
        c.finalized = true;

        Entry[] storage entries = _entries[contestId];
        uint256 n = entries.length;
        uint32 maxVotes;
        uint256 winners;
        for (uint256 i; i < n; ++i) {
            Entry storage e = entries[i];
            if (e.removed) continue;
            uint32 v = e.votes;
            if (v > maxVotes) {
                maxVotes = v;
                winners = 1;
            } else if (v == maxVotes) {
                ++winners;
            }
        }

        uint256 prize = c.prize;
        address organiser = c.organiser;
        if (maxVotes == 0) {
            claimable[organiser] += prize;
            emit ContestFinalized(contestId, new uint32[](0), 0);
            return;
        }

        uint32[] memory winnerIds = new uint32[](winners);
        uint256 share = prize / winners;
        uint256 k;
        for (uint256 i; i < n; ++i) {
            Entry storage e = entries[i];
            if (!e.removed && e.votes == maxVotes) {
                winnerIds[k++] = uint32(i + 1);
                claimable[e.payee] += share;
            }
        }
        uint256 dust = prize - share * winners;
        if (dust > 0) claimable[organiser] += dust;
        emit ContestFinalized(contestId, winnerIds, share);
    }

    /// @notice Sends the caller everything they can claim (prizes, refunds, deferred drips).
    function withdraw() external nonReentrant {
        _withdraw(payable(msg.sender));
    }

    /// @notice Sends everything the caller can claim to `to`, for payee contracts that can make
    ///         calls but can't receive ETH.
    /// @param to recipient of the caller's claimable balance (not zero)
    function withdrawTo(address payable to) external nonReentrant {
        if (to == address(0)) revert InvalidPayee();
        _withdraw(to);
    }

    function _withdraw(address payable to) internal {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        // the caller only ever spends their own balance, so any destination is theirs to pick
        // forge-lint: disable-next-line(arbitrary-send-eth)
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // ------------------------------------------------------------------- views

    /// @notice Full read model of one contest. Reverts ContestNotFound for unknown ids.
    /// @param contestId the contest
    function getContest(uint256 contestId) external view returns (ContestView memory) {
        _contest(contestId);
        return _view(contestId);
    }

    /// @notice Contests newest first. `limit` is capped at 50; an offset past the end returns [].
    /// @param offset how many of the newest contests to skip
    /// @param limit maximum number to return
    function getContests(uint256 offset, uint256 limit) external view returns (ContestView[] memory out) {
        uint256 count = contestCount;
        if (offset >= count) return new ContestView[](0);
        uint256 n = count - offset;
        if (limit > MAX_PAGE) limit = MAX_PAGE;
        if (n > limit) n = limit;
        out = new ContestView[](n);
        for (uint256 i; i < n; ++i) {
            out[i] = _view(count - offset - i);
        }
    }

    /// @notice Every entry of a contest, including removed ones (flagged).
    /// @param contestId the contest
    function getEntries(uint256 contestId) external view returns (EntryView[] memory out) {
        _contest(contestId);
        Entry[] storage entries = _entries[contestId];
        uint256 n = entries.length;
        out = new EntryView[](n);
        for (uint256 i; i < n; ++i) {
            Entry storage e = entries[i];
            out[i] = EntryView({
                id: uint32(i + 1),
                payee: e.payee,
                submitter: e.submitter,
                members: e.members,
                metadataURI: e.metadataURI,
                votes: e.votes,
                removed: e.removed
            });
        }
    }

    /// @notice A voter's state in a contest.
    /// @param contestId the contest
    /// @param voter the wallet
    /// @return votedEntryId entry voted for (0 = none)
    /// @return isCheckedIn whether checked in at the door
    function voterState(uint256 contestId, address voter)
        external
        view
        returns (uint32 votedEntryId, bool isCheckedIn)
    {
        _contest(contestId);
        return (votedEntry[contestId][voter], checkedIn[contestId][voter]);
    }

    /// @notice Checks a beacon token with the voting freshness window, without changing state.
    ///         Returns NotSet for Anywhere contests.
    /// @param contestId the contest
    /// @param t the token
    function beaconStatus(uint256 contestId, BeaconToken calldata t)
        public
        view
        returns (BeaconStatus status)
    {
        _contest(contestId);
        (status,) = _beacons[contestId].check(t.slot, t.token, uint64(block.timestamp), true);
    }

    /// @notice True when `beaconStatus` is Ok. Phones call this right before opening the wallet.
    /// @param contestId the contest
    /// @param t the token
    function isBeaconTokenValid(uint256 contestId, BeaconToken calldata t) external view returns (bool) {
        return beaconStatus(contestId, t) == BeaconStatus.Ok;
    }

    /// @notice One hash-chain step, exposed for cross-language parity tests.
    /// @param link a chain link
    /// @return the next link, bytes16(keccak256(abi.encodePacked(link)))
    function computeNextLink(bytes16 link) external pure returns (bytes16) {
        return BeaconChain.next(link);
    }

    function _view(uint256 contestId) internal view returns (ContestView memory v) {
        Contest storage c = _contests[contestId];
        BeaconChain.State storage b = _beacons[contestId];
        v.id = contestId;
        v.organiser = c.organiser;
        v.title = c.title;
        v.metadataURI = c.metadataURI;
        v.createdAt = c.createdAt;
        v.submissionEnd = c.submissionEnd;
        v.votingStart = c.votingStart;
        v.votingEnd = c.votingEnd;
        v.presence = c.presence;
        v.openSubmissions = c.openSubmissions;
        v.finalized = c.finalized;
        v.prize = c.prize;
        v.dripPerCheckIn = c.dripPerCheckIn;
        v.ticketRoot = c.ticketRoot;
        v.ticketListURI = c.ticketListURI;
        v.entryCount = c.entryCount;
        v.liveEntryCount = c.liveEntryCount;
        v.totalVotes = c.totalVotes;
        v.checkedInCount = c.checkedInCount;
        v.beaconAnchor = b.anchor;
        v.beaconStart = b.start;
        v.beaconLength = b.length;
        v.beaconRotation = b.rotation;
        v.beaconCachedIndex = b.cachedIndex;
    }
}
