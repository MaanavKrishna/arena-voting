// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test} from "forge-std/Test.sol";
import {Arena, Presence, CreateParams, BeaconToken, ContestView, EntryView} from "../../src/Arena.sol";
import {RejectingReceiver} from "../mocks/RejectingReceiver.sol";

/// @notice Drives Arena through random create/submit/remove/vote/checkIn/finalize/withdraw(To) sequences.
contract ArenaHandler is Test {
    Arena public immutable arena;

    address[] internal _actors;
    uint256[] internal _contests;

    // ghost state
    mapping(uint256 => mapping(address => uint256)) public ghostVotes;
    mapping(uint256 => uint256) public ghostAllocated;
    uint256 public ghostFinalizeCalls;
    uint256 public ghostVoteCalls;
    uint256 public ghostCheckInCalls;
    uint256 public ghostWithdrawCalls;
    uint256 public ghostRemoveCalls;
    uint256 public ghostSubmitCalls;

    constructor(Arena arena_) {
        arena = arena_;
        for (uint256 i; i < 8; ++i) {
            address a = address(uint160(0xA11CE000 + i));
            _actors.push(a);
            vm.deal(a, 1_000 ether);
        }
        // a contract that rejects ETH, so drips get deferred
        _actors.push(address(new RejectingReceiver()));
    }

    // ---------------------------------------------------------------- views

    function actors() external view returns (address[] memory) {
        return _actors;
    }

    function contests() external view returns (uint256[] memory) {
        return _contests;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return _actors[seed % _actors.length];
    }

    function _eoa(uint256 seed) internal view returns (address) {
        return _actors[seed % (_actors.length - 1)];
    }

    /// @dev Phase filter: 0 = submissions open with room, 1 = voting open, 2 = ended and not finalized,
    ///      3 = before votingEnd, 4 = before votingStart with a live entry.
    function _find(uint256 seed, uint8 phase, bool requireAnywhere, bool requireGated)
        internal
        view
        returns (uint256 id, bool found)
    {
        uint256 n = _contests.length;
        for (uint256 k; k < n; ++k) {
            uint256 cid = _contests[(seed % n + k) % n];
            ContestView memory c = arena.getContest(cid);
            if (requireAnywhere && c.presence != Presence.Anywhere) continue;
            if (requireGated && c.presence != Presence.Gated) continue;
            bool ok;
            if (phase == 0) {
                ok = block.timestamp < c.submissionEnd && c.liveEntryCount < arena.MAX_ENTRIES()
                    && c.entryCount < arena.MAX_TOTAL_ENTRIES();
            } else if (phase == 4) {
                ok = block.timestamp < c.votingStart && c.liveEntryCount > 0;
            } else if (phase == 1) {
                ok = block.timestamp >= c.votingStart && block.timestamp < c.votingEnd;
            } else if (phase == 2) {
                ok = block.timestamp >= c.votingEnd && !c.finalized;
            } else {
                ok = block.timestamp < c.votingEnd;
            }
            if (ok) return (cid, true);
        }
    }

    // -------------------------------------------------------------- actions

    function create(uint256 actorSeed, uint96 prize, bool gated, bool curated) external {
        address org = _eoa(actorSeed);
        uint256 p = bound(prize, 0, 10 ether);
        uint64 nowTs = uint64(block.timestamp);
        CreateParams memory cp;
        cp.title = "Invariant";
        cp.metadataURI = "ipfs://x";
        cp.submissionEnd = nowTs + 10 minutes;
        cp.votingStart = nowTs + 10 minutes;
        cp.votingEnd = nowTs + 40 minutes;
        cp.presence = gated ? Presence.Gated : Presence.Anywhere;
        cp.openSubmissions = !curated;
        cp.dripPerCheckIn = gated ? 0.001 ether : 0;
        vm.prank(org);
        uint256 id = arena.createContest{value: p}(cp);
        _contests.push(id);
        if (gated) {
            // the organiser is the gatekeeper in this model
            vm.prank(org);
            arena.setGatekeeper(id, org, true);
        }
        // two entries up front so votes have something to land on
        vm.startPrank(org);
        arena.submitEntry(id, _actor(actorSeed % 64 + 1), "ipfs://e", new address[](0));
        arena.submitEntry(id, _actor(actorSeed % 64 + 2), "ipfs://e", new address[](0));
        vm.stopPrank();
    }

    function submit(uint256 contestSeed, uint256 actorSeed, uint256 payeeSeed) external {
        (uint256 id, bool found) = _find(contestSeed, 0, false, false);
        if (!found) return;
        ContestView memory c = arena.getContest(id);
        address who = c.openSubmissions ? _eoa(actorSeed) : c.organiser;
        // a non-organiser at their quota hands over to the organiser (exempt)
        if (who != c.organiser && arena.entriesSubmitted(id, who) >= arena.MAX_ENTRIES_PER_SUBMITTER()) {
            who = c.organiser;
        }
        vm.prank(who);
        arena.submitEntry(id, _actor(payeeSeed), "ipfs://e", new address[](0));
        ghostSubmitCalls++;
    }

    function remove(uint256 contestSeed, uint256 entrySeed) external {
        (uint256 id, bool found) = _find(contestSeed, 4, false, false);
        if (!found) return;
        ContestView memory c = arena.getContest(id);
        EntryView[] memory es = arena.getEntries(id);
        uint256 start = entrySeed % es.length;
        for (uint256 k; k < es.length; ++k) {
            uint256 i = (start + k) % es.length;
            if (es[i].removed) continue;
            vm.prank(c.organiser);
            arena.removeEntry(id, uint32(i + 1));
            ghostRemoveCalls++;
            return;
        }
    }

    function vote(uint256 contestSeed, uint256 actorSeed, uint256 entrySeed) external {
        (uint256 id, bool found) = _find(contestSeed, 1, true, false);
        if (!found) return;
        ContestView memory c = arena.getContest(id);
        address voter = _actor(actorSeed);
        if (arena.votedEntry(id, voter) != 0) voter = _actor(actorSeed % 64 + 1);
        if (arena.votedEntry(id, voter) != 0) return;
        uint32 entryId = uint32(bound(entrySeed, 1, c.entryCount));
        EntryView memory e = arena.getEntries(id)[entryId - 1];
        if (e.payee == voter) {
            entryId = entryId == 1 ? 2 : 1;
            e = arena.getEntries(id)[entryId - 1];
        }
        if (e.removed || e.payee == voter || (e.submitter == voter && voter != c.organiser)) return;
        vm.prank(voter);
        arena.vote(id, entryId, BeaconToken(0, bytes16(0)), new bytes32[](0));
        ghostVotes[id][voter] += 1;
        ghostVoteCalls++;
    }

    function checkIn(uint256 contestSeed, uint256 actorSeed, uint256 dripSeed) external {
        (uint256 id, bool found) = _find(contestSeed, 3, false, true);
        if (!found) return;
        ContestView memory c = arena.getContest(id);
        address voter = _actor(actorSeed);
        if (arena.checkedIn(id, voter)) return;
        uint256 drip = bound(dripSeed, 0, c.dripPerCheckIn);
        vm.prank(c.organiser);
        arena.checkIn{value: drip}(id, voter, new bytes32[](0));
        ghostCheckInCalls++;
    }

    function finalize(uint256 contestSeed) external {
        (uint256 id, bool found) = _find(contestSeed, 2, false, false);
        if (!found) return;
        uint256 beforeSum = _sumClaimable();
        arena.finalize(id);
        ghostAllocated[id] = _sumClaimable() - beforeSum;
        ghostFinalizeCalls++;
    }

    function withdraw(uint256 actorSeed) external {
        address who = _eoa(actorSeed);
        for (uint256 k; k < _actors.length - 1 && arena.claimable(who) == 0; ++k) {
            who = _eoa(actorSeed % 64 + k);
        }
        if (arena.claimable(who) == 0) return;
        vm.prank(who);
        arena.withdraw();
        ghostWithdrawCalls++;
    }

    /// @dev Any actor, the ETH-rejecting contract included, routes its balance to an EOA actor.
    function withdrawTo(uint256 actorSeed, uint256 toSeed) external {
        address who = _actor(actorSeed);
        for (uint256 k; k < _actors.length && arena.claimable(who) == 0; ++k) {
            who = _actor(actorSeed % 64 + k);
        }
        if (arena.claimable(who) == 0) return;
        vm.prank(who);
        arena.withdrawTo(payable(_eoa(toSeed)));
        ghostWithdrawCalls++;
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 30 minutes));
    }

    function _sumClaimable() internal view returns (uint256 s) {
        for (uint256 i; i < _actors.length; ++i) {
            s += arena.claimable(_actors[i]);
        }
    }

    function sumClaimable() external view returns (uint256) {
        return _sumClaimable();
    }
}
