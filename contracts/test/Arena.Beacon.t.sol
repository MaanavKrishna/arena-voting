// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {console} from "forge-std/console.sol";
import {ArenaBase} from "./ArenaBase.t.sol";
import {Arena, Presence, CreateParams, BeaconToken, ContestView} from "../src/Arena.sol";
import {BeaconChain, BeaconStatus} from "../src/lib/BeaconChain.sol";

contract ArenaBeaconTest is ArenaBase {
    event BeaconSet(uint256 indexed contestId, bytes16 anchor, uint64 start, uint32 length, uint32 rotation);
    event BeaconAdvanced(uint256 indexed contestId, uint32 slot);

    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = _createContest(Presence.Room);
        _addEntries(id, 3);
    }

    function _voterN(uint256 i) internal pure returns (address) {
        return address(uint160(0x4000000 + i));
    }

    function _expectVoteRevert(address voter, BeaconToken memory t, bytes4 sel) internal {
        vm.prank(voter);
        vm.expectRevert(sel);
        arena.vote(id, 1, t, _noProof());
    }

    /// @dev Warps to `offset` seconds after the start of `slot`.
    function _warpToSlot(uint32 slot, int256 offset) internal {
        vm.warp(uint256(int256(uint256(beaconStart) + uint256(slot) * 10) + offset));
    }

    // ----------------------------------------------------------------- setBeacon

    function test_setBeacon_storesAndEmits() public {
        uint64 start = arena.getContest(id).votingStart - 60;
        bytes16 anchor = _anchor(SEED, 500);
        vm.expectEmit(true, false, false, true, address(arena));
        emit BeaconSet(id, anchor, start, 500, 1);
        vm.prank(organiser);
        arena.setBeacon(id, anchor, start, 500);

        ContestView memory c = arena.getContest(id);
        assertEq(c.beaconAnchor, anchor);
        assertEq(c.beaconStart, start);
        assertEq(c.beaconLength, 500);
        assertEq(c.beaconRotation, 1);
        assertEq(c.beaconCachedIndex, 500);
    }

    function test_setBeacon_strangerReverts() public {
        vm.prank(stranger);
        vm.expectRevert(Arena.NotOrganiser.selector);
        arena.setBeacon(id, bytes16(uint128(1)), 0, 10);
    }

    function test_setBeacon_anywhereReverts() public {
        uint256 cid = _createContest(Presence.Anywhere);
        vm.prank(organiser);
        vm.expectRevert(Arena.PresenceNotRequired.selector);
        arena.setBeacon(cid, bytes16(uint128(1)), 0, 10);
    }

    function test_setBeacon_afterVotingEndReverts() public {
        _warpToEnd(id);
        vm.prank(organiser);
        vm.expectRevert(Arena.VotingEnded.selector);
        arena.setBeacon(id, bytes16(uint128(1)), 0, 10);
    }

    function test_setBeacon_invalidInputsRevert() public {
        uint64 end = arena.getContest(id).votingEnd;
        vm.startPrank(organiser);
        vm.expectRevert(Arena.InvalidBeacon.selector);
        arena.setBeacon(id, bytes16(0), 0, 10);
        vm.expectRevert(Arena.InvalidBeacon.selector);
        arena.setBeacon(id, bytes16(uint128(1)), 0, 0);
        vm.expectRevert(Arena.InvalidBeacon.selector);
        arena.setBeacon(id, bytes16(uint128(1)), 0, 100_001);
        vm.expectRevert(Arena.InvalidBeacon.selector);
        arena.setBeacon(id, bytes16(uint128(1)), end, 10);
        // boundaries that are accepted
        arena.setBeacon(id, bytes16(uint128(1)), end - 1, 100_000);
        vm.stopPrank();
    }

    function test_order_presenceBeatsVotingEnded() public {
        uint256 cid = _createContest(Presence.Anywhere);
        _warpToEnd(cid);
        vm.prank(organiser);
        vm.expectRevert(Arena.PresenceNotRequired.selector);
        arena.setBeacon(cid, bytes16(0), 0, 0);
    }

    function test_order_notOrganiserBeatsPresence() public {
        uint256 cid = _createContest(Presence.Anywhere);
        vm.prank(stranger);
        vm.expectRevert(Arena.NotOrganiser.selector);
        arena.setBeacon(cid, bytes16(0), 0, 0);
    }

    // ---------------------------------------------------------------- vote

    function test_beacon_currentSlotOk() public {
        _setBeacon(id);
        _warpToVoting(id);
        uint32 s = _slotNow();
        _voteWithBeacon(id, voter1, 1, _beaconToken(s));
        assertEq(arena.getContest(id).totalVotes, 1);
        assertEq(arena.getContest(id).beaconCachedIndex, beaconLength - 1 - s);
    }

    function test_beacon_notSetReverts() public {
        _warpToVoting(id);
        _expectVoteRevert(voter1, BeaconToken(0, bytes16(0)), Arena.BeaconNotSet.selector);
    }

    function test_beacon_acceptsAtSlotStartMinus30() public {
        _setBeacon(id);
        _warpToSlot(20, -30);
        _voteWithBeacon(id, voter1, 1, _beaconToken(20));
    }

    function test_beacon_rejectsAtSlotStartMinus31() public {
        _setBeacon(id);
        _warpToSlot(20, -31);
        _expectVoteRevert(voter1, _beaconToken(20), Arena.BeaconExpired.selector);
    }

    function test_beacon_acceptsTokenUpTo120sAfterSlot() public {
        _setBeacon(id);
        _warpToSlot(20, 10 + 120);
        _voteWithBeacon(id, voter1, 1, _beaconToken(20));
    }

    function test_beacon_rejectsAtSlotEndPlus121() public {
        _setBeacon(id);
        _warpToSlot(20, 10 + 121);
        _expectVoteRevert(voter1, _beaconToken(20), Arena.BeaconExpired.selector);
    }

    function test_beacon_slotOutOfRangeReverts() public {
        _setBeacon(id);
        _warpToVoting(id);
        _expectVoteRevert(voter1, BeaconToken(beaconLength, bytes16(0)), Arena.BeaconSlotOutOfRange.selector);
        _expectVoteRevert(
            voter1, BeaconToken(type(uint32).max, bytes16(0)), Arena.BeaconSlotOutOfRange.selector
        );
    }

    function test_beacon_wrongTokenReverts() public {
        _setBeacon(id);
        _warpToVoting(id);
        uint32 s = _slotNow();
        BeaconToken memory t = _beaconToken(s);
        t.token = bytes16(keccak256("forged"));
        _expectVoteRevert(voter1, t, Arena.InvalidBeaconToken.selector);
        // a real token presented for the wrong slot
        BeaconToken memory shifted = BeaconToken(s, _beaconToken(s + 1).token);
        _expectVoteRevert(voter1, shifted, Arena.InvalidBeaconToken.selector);
    }

    function test_beacon_wrongOlderTokenReverts() public {
        _setBeacon(id);
        _warpToSlot(20, 0);
        _voteWithBeacon(id, voter1, 1, _beaconToken(20));
        BeaconToken memory t = BeaconToken(19, bytes16(keccak256("forged")));
        _expectVoteRevert(voter2, t, Arena.InvalidBeaconToken.selector);
    }

    function test_beacon_gapTooLargeReverts() public {
        _setBeacon(id);
        // cold cache: slot 4096 is 4097 steps from the anchor
        _warpToSlot(4096, 0);
        _expectVoteRevert(voter1, _beaconToken(4096), Arena.BeaconGapTooLarge.selector);
        // slot 4095 is exactly 4096 steps: allowed
        _voteWithBeacon(id, voter1, 1, _beaconToken(4095));
    }

    function test_beacon_olderThanCacheAcceptedWithinWindow() public {
        _setBeacon(id);
        _warpToSlot(21, 0);
        _voteWithBeacon(id, voter1, 1, _beaconToken(21));
        uint32 cached = arena.getContest(id).beaconCachedIndex;
        // slot 19 ends at +200, so it is still fresh at slot 21 + 0 (+10 s after its end)
        _voteWithBeacon(id, voter2, 1, _beaconToken(19));
        _voteWithBeacon(id, voter3, 1, _beaconToken(21));
        assertEq(arena.getContest(id).beaconCachedIndex, cached, "cache must not move backwards");
        assertEq(arena.getContest(id).totalVotes, 3);
    }

    function test_beacon_rotationIncrementsAndInvalidatesOldTokens() public {
        _setBeacon(id);
        _warpToVoting(id);
        uint32 s = _slotNow();
        BeaconToken memory oldT = _beaconToken(s);

        uint32 len2 = beaconLength;
        vm.prank(organiser);
        arena.setBeacon(id, _anchor(SEED_2, len2), beaconStart, len2);
        ContestView memory c = arena.getContest(id);
        assertEq(c.beaconRotation, 2);
        assertEq(c.beaconCachedIndex, len2);

        _expectVoteRevert(voter1, oldT, Arena.InvalidBeaconToken.selector);
        _voteWithBeacon(id, voter1, 1, _tokenFrom(SEED_2, len2, s));
    }

    function test_beacon_rotationAfterVotesResetsCache() public {
        _setBeacon(id);
        _warpToSlot(30, 0);
        _voteWithBeacon(id, voter1, 1, _beaconToken(30));
        vm.prank(organiser);
        arena.setBeacon(id, _anchor(SEED_2, 400), beaconStart, 400);
        assertEq(arena.getContest(id).beaconCachedIndex, 400);
        _voteWithBeacon(id, voter2, 1, _tokenFrom(SEED_2, 400, 30));
    }

    // ------------------------------------------------------------ advanceBeacon

    function test_advanceBeacon_movesCacheAndEmits() public {
        _setBeacon(id);
        _warpToSlot(50, 0);
        vm.expectEmit(true, false, false, true, address(arena));
        emit BeaconAdvanced(id, 50);
        vm.prank(stranger);
        arena.advanceBeacon(id, _beaconToken(50));
        assertEq(arena.getContest(id).beaconCachedIndex, beaconLength - 51);
    }

    function test_advanceBeacon_ignoresAgeWindow() public {
        _setBeacon(id);
        _warpToSlot(2000, 0);
        // slot 10 expired long ago, but advanceBeacon accepts it
        arena.advanceBeacon(id, _beaconToken(10));
        assertEq(arena.getContest(id).beaconCachedIndex, beaconLength - 11);
    }

    function test_advanceBeacon_rejectsFutureSlot() public {
        _setBeacon(id);
        _warpToSlot(50, -31);
        vm.expectRevert(Arena.BeaconExpired.selector);
        arena.advanceBeacon(id, _beaconToken(50));
        // 30 s early is still fine
        _warpToSlot(50, -30);
        arena.advanceBeacon(id, _beaconToken(50));
    }

    function test_advanceBeacon_rejectsNotNewerThanCache() public {
        _setBeacon(id);
        _warpToSlot(50, 0);
        arena.advanceBeacon(id, _beaconToken(50));
        vm.expectRevert(Arena.InvalidBeaconToken.selector);
        arena.advanceBeacon(id, _beaconToken(50));
        vm.expectRevert(Arena.InvalidBeaconToken.selector);
        arena.advanceBeacon(id, _beaconToken(49));
    }

    function test_advanceBeacon_rejectsWrongToken() public {
        _setBeacon(id);
        _warpToSlot(50, 0);
        vm.expectRevert(Arena.InvalidBeaconToken.selector);
        arena.advanceBeacon(id, BeaconToken(50, bytes16(keccak256("forged"))));
    }

    function test_advanceBeacon_gapTooLargeReverts() public {
        _setBeacon(id);
        _warpToSlot(5000, 0);
        vm.expectRevert(Arena.BeaconGapTooLarge.selector);
        arena.advanceBeacon(id, _beaconToken(4096));
    }

    function test_advanceBeacon_notSetAndOutOfRange() public {
        _warpToVoting(id);
        vm.expectRevert(Arena.BeaconNotSet.selector);
        arena.advanceBeacon(id, BeaconToken(0, bytes16(0)));
        _setBeacon(id);
        vm.expectRevert(Arena.BeaconSlotOutOfRange.selector);
        arena.advanceBeacon(id, BeaconToken(beaconLength, bytes16(0)));
    }

    function test_advanceBeacon_afterVotingEndReverts() public {
        _setBeacon(id);
        _warpToEnd(id);
        vm.expectRevert(Arena.VotingEnded.selector);
        arena.advanceBeacon(id, _beaconToken(10));
    }

    function test_advanceBeacon_bridgesGapInHops() public {
        _setBeacon(id);
        _warpToVoting(id);
        uint32 s0 = _slotNow();
        _voteWithBeacon(id, voter1, 1, _beaconToken(s0));

        // 12 hours with no activity: 4320 slots, more than MAX_HASH_STEPS
        vm.warp(block.timestamp + 12 hours);
        uint32 sNow = _slotNow();
        assertGt(sNow - s0, 4096);
        _expectVoteRevert(voter2, _beaconToken(sNow), Arena.BeaconGapTooLarge.selector);

        // hop 1 and hop 2 use links that are long expired for voting
        uint32 hop1 = s0 + 4000;
        uint32 hop2 = sNow - 30;
        assertEq(uint256(arena.beaconStatus(id, _beaconToken(hop1))), uint256(BeaconStatus.Expired));
        assertEq(uint256(arena.beaconStatus(id, _beaconToken(hop2))), uint256(BeaconStatus.Expired));
        vm.startPrank(stranger);
        arena.advanceBeacon(id, _beaconToken(hop1));
        arena.advanceBeacon(id, _beaconToken(hop2));
        vm.stopPrank();
        assertEq(arena.getContest(id).beaconCachedIndex, beaconLength - 1 - hop2);

        // a fresh vote now verifies in a handful of steps
        _voteWithBeacon(id, voter2, 1, _beaconToken(sNow));
        assertEq(arena.getContest(id).totalVotes, 2);
    }

    // --------------------------------------------------------- status views

    function test_beaconStatus_returnsStatusesInsteadOfReverting() public {
        uint256 anywhere = _createContest(Presence.Anywhere);
        assertEq(
            uint256(arena.beaconStatus(anywhere, BeaconToken(0, bytes16(0)))), uint256(BeaconStatus.NotSet)
        );
        assertEq(uint256(arena.beaconStatus(id, BeaconToken(0, bytes16(0)))), uint256(BeaconStatus.NotSet));

        _setBeacon(id);
        _warpToVoting(id);
        uint32 s = _slotNow();
        assertEq(uint256(arena.beaconStatus(id, _beaconToken(s))), uint256(BeaconStatus.Ok));
        assertTrue(arena.isBeaconTokenValid(id, _beaconToken(s)));

        assertEq(
            uint256(arena.beaconStatus(id, BeaconToken(beaconLength, bytes16(0)))),
            uint256(BeaconStatus.SlotOutOfRange)
        );
        assertEq(uint256(arena.beaconStatus(id, _beaconToken(s + 10))), uint256(BeaconStatus.Expired));
        BeaconToken memory forged = BeaconToken(s, bytes16(keccak256("forged")));
        assertEq(uint256(arena.beaconStatus(id, forged)), uint256(BeaconStatus.Invalid));
        assertFalse(arena.isBeaconTokenValid(id, forged));

        _warpToSlot(4200, 0);
        assertEq(uint256(arena.beaconStatus(id, _beaconToken(4200))), uint256(BeaconStatus.GapTooLarge));
        assertFalse(arena.isBeaconTokenValid(id, _beaconToken(4200)));
    }

    function test_beaconStatus_hasNoSideEffects() public {
        _setBeacon(id);
        _warpToVoting(id);
        uint32 s = _slotNow();
        assertTrue(arena.isBeaconTokenValid(id, _beaconToken(s)));
        assertEq(arena.getContest(id).beaconCachedIndex, beaconLength);
    }

    function testFuzz_beaconStatusNeverReverts(uint32 slot, bytes16 token, uint32 warpBy) public {
        _setBeacon(id);
        vm.warp(block.timestamp + bound(warpBy, 0, 10 days));
        BeaconStatus st = arena.beaconStatus(id, BeaconToken(slot, token));
        assertLe(uint256(st), uint256(BeaconStatus.Invalid));
    }

    // ------------------------------------------------------------------- gas

    function _longContest() internal returns (uint256 cid) {
        CreateParams memory p = _params(Presence.Room);
        cid = _create(p, PRIZE);
        _addEntries(cid, 2);
    }

    function test_gas_coldVoteAtSlot1000() public {
        uint256 cid = _longContest();
        uint64 start = arena.getContest(cid).votingStart;
        _setBeacon(cid, start, 2000);
        _warpToSlot(1000, 0);
        BeaconToken memory t = _beaconToken(1000);
        vm.prank(voter1);
        uint256 g = gasleft();
        arena.vote(cid, 1, t, _noProof());
        g -= gasleft();
        console.log("cold vote at slot 1000 (1001 hash steps), gas:", g);
    }

    function test_gas_warmVote() public {
        uint256 cid = _longContest();
        uint64 start = arena.getContest(cid).votingStart;
        _setBeacon(cid, start, 2000);
        _warpToSlot(1000, 0);
        arena.advanceBeacon(cid, _beaconToken(994));
        BeaconToken memory t = _beaconToken(1000);
        vm.prank(voter1);
        uint256 g = gasleft();
        arena.vote(cid, 1, t, _noProof());
        g -= gasleft();
        console.log("warm vote (6 hash steps), gas:", g);
    }

    function test_gas_anywhereVote() public {
        uint256 cid = _createContest(Presence.Anywhere);
        _addEntries(cid, 2);
        _warpToVoting(cid);
        vm.prank(voter1);
        BeaconToken memory t = BeaconToken(0, bytes16(0));
        bytes32[] memory proof = _noProof();
        uint256 g = gasleft();
        arena.vote(cid, 1, t, proof);
        g -= gasleft();
        console.log("anywhere vote, gas:", g);
    }
}

/// @dev Exposes BeaconChain directly, for paths Arena never reaches (e.g. stale checks without the window).
contract BeaconHarness {
    using BeaconChain for BeaconChain.State;

    BeaconChain.State internal s;

    function set(bytes16 anchor, uint64 start, uint32 length) external {
        s.anchor = anchor;
        s.start = start;
        s.length = length;
        s.cachedIndex = length;
        s.cachedLink = anchor;
    }

    function check(uint32 slot, bytes16 token, uint64 nowTs, bool fresh)
        external
        view
        returns (BeaconStatus, uint32)
    {
        return s.check(slot, token, nowTs, fresh);
    }

    function commit(uint32 idx, bytes16 token) external {
        s.commit(idx, token);
    }

    function cachedIndex() external view returns (uint32) {
        return s.cachedIndex;
    }
}

contract BeaconChainLibTest is ArenaBase {
    BeaconHarness internal h;

    function setUp() public override {
        super.setUp();
        h = new BeaconHarness();
    }

    function test_lib_olderThanCacheGapTooLarge() public {
        uint32 len = 6000;
        h.set(_anchor(SEED, len), 0, len);
        // move the cache to slot 5000, then ask about slot 0 without the freshness window
        h.commit(len - 1 - 5000, _tokenFrom(SEED, len, 5000).token);
        BeaconToken memory old = _tokenFrom(SEED, len, 0);
        (BeaconStatus st,) = h.check(old.slot, old.token, 0, false);
        assertEq(uint256(st), uint256(BeaconStatus.GapTooLarge));
        BeaconToken memory near = _tokenFrom(SEED, len, 1000);
        uint32 idx;
        (st, idx) = h.check(near.slot, near.token, 0, false);
        assertEq(uint256(st), uint256(BeaconStatus.Ok));
        assertEq(idx, len - 1 - 1000);
    }

    function test_lib_commitOnlyMovesForward() public {
        uint32 len = 100;
        h.set(_anchor(SEED, len), 0, len);
        h.commit(50, bytes16(uint128(1)));
        h.commit(60, bytes16(uint128(2)));
        assertEq(h.cachedIndex(), 50);
        h.commit(50, bytes16(uint128(3)));
        assertEq(h.cachedIndex(), 50);
    }

    function test_lib_nextMatchesSpec() public pure {
        bytes16 x = bytes16(0x0102030405060708090a0b0c0d0e0f10);
        assertEq(BeaconChain.next(x), bytes16(keccak256(abi.encodePacked(x))));
    }
}
