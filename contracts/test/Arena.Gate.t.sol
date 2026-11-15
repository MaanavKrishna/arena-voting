// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ArenaBase} from "./ArenaBase.t.sol";
import {Arena, Presence, CreateParams, BeaconToken} from "../src/Arena.sol";
import {RejectingReceiver} from "./mocks/RejectingReceiver.sol";
import {GasGriefer} from "./mocks/GasGriefer.sol";
import {ReturnBomb} from "./mocks/ReturnBomb.sol";

contract ArenaGateTest is ArenaBase {
    event GatekeeperSet(uint256 indexed contestId, address indexed gatekeeper, bool allowed);
    event CheckedIn(
        uint256 indexed contestId, address indexed voter, address indexed gatekeeper, uint256 drip
    );
    event DripDeferred(uint256 indexed contestId, address indexed voter, uint256 amount);

    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = _createContest(Presence.Gated);
        _addEntries(id, 3);
    }

    function _checkInExpect(uint256 cid, address voter, uint256 value, bytes4 sel) internal {
        vm.prank(gatekeeper);
        vm.expectRevert(sel);
        arena.checkIn{value: value}(cid, voter, _noProof());
    }

    // ------------------------------------------------------------ gatekeepers

    function test_setGatekeeper_setsAndEmits() public {
        vm.expectEmit(true, true, false, true, address(arena));
        emit GatekeeperSet(id, gatekeeper, true);
        _authoriseGate(id);
        assertTrue(arena.isGatekeeper(id, gatekeeper));
    }

    function test_setGatekeeper_strangerReverts() public {
        vm.prank(stranger);
        vm.expectRevert(Arena.NotOrganiser.selector);
        arena.setGatekeeper(id, gatekeeper, true);
    }

    function test_setGatekeeper_notGatedReverts() public {
        uint256 room = _createContest(Presence.Room);
        vm.prank(organiser);
        vm.expectRevert(Arena.PresenceNotGated.selector);
        arena.setGatekeeper(room, gatekeeper, true);
    }

    function test_setGatekeeper_zeroReverts() public {
        vm.prank(organiser);
        vm.expectRevert(Arena.InvalidGatekeeper.selector);
        arena.setGatekeeper(id, address(0), true);
    }

    function test_order_presenceNotGatedBeatsInvalidGatekeeper() public {
        uint256 room = _createContest(Presence.Room);
        vm.prank(organiser);
        vm.expectRevert(Arena.PresenceNotGated.selector);
        arena.setGatekeeper(room, address(0), true);
    }

    // --------------------------------------------------------------- checkIn

    function test_checkIn_nonGatekeeperReverts() public {
        vm.prank(stranger);
        vm.expectRevert(Arena.NotGatekeeper.selector);
        arena.checkIn(id, voter1, _noProof());
    }

    function test_checkIn_works() public {
        _authoriseGate(id);
        vm.expectEmit(true, true, true, true, address(arena));
        emit CheckedIn(id, voter1, gatekeeper, 0);
        _checkIn(id, voter1);
        assertTrue(arena.checkedIn(id, voter1));
        (, bool isIn) = arena.voterState(id, voter1);
        assertTrue(isIn);
        assertEq(arena.getContest(id).checkedInCount, 1);
    }

    function test_checkIn_beforeVotingStartOk() public {
        _authoriseGate(id);
        assertLt(block.timestamp, arena.getContest(id).votingStart);
        _checkIn(id, voter1);
    }

    function test_checkIn_revokeWorks() public {
        _authoriseGate(id);
        _checkIn(id, voter1);
        vm.prank(organiser);
        arena.setGatekeeper(id, gatekeeper, false);
        assertFalse(arena.isGatekeeper(id, gatekeeper));
        _checkInExpect(id, voter2, 0, Arena.NotGatekeeper.selector);
    }

    function test_checkIn_doubleReverts() public {
        _authoriseGate(id);
        _checkIn(id, voter1);
        _checkInExpect(id, voter1, 0, Arena.AlreadyCheckedIn.selector);
    }

    function test_checkIn_zeroVoterReverts() public {
        _authoriseGate(id);
        _checkInExpect(id, address(0), 0, Arena.InvalidVoter.selector);
    }

    function test_checkIn_afterVotingEndReverts() public {
        _authoriseGate(id);
        _warpToEnd(id);
        _checkInExpect(id, voter1, 0, Arena.VotingEnded.selector);
    }

    function test_checkIn_notGatedReverts() public {
        uint256 room = _createContest(Presence.Room);
        vm.prank(gatekeeper);
        vm.expectRevert(Arena.PresenceNotGated.selector);
        arena.checkIn(room, voter1, _noProof());
    }

    function test_checkIn_ticketListEnforced() public {
        CreateParams memory p = _params(Presence.Gated);
        p.ticketRoot = ticketRoot;
        p.ticketListURI = TICKET_URI;
        uint256 cid = _create(p, PRIZE);
        _authoriseGate(cid);

        vm.prank(gatekeeper);
        arena.checkIn(cid, ticketAddrs[2], ticketProofs[2]);
        assertTrue(arena.checkedIn(cid, ticketAddrs[2]));

        vm.prank(gatekeeper);
        vm.expectRevert(Arena.NotOnTicketList.selector);
        arena.checkIn(cid, stranger, ticketProofs[0]);

        vm.prank(gatekeeper);
        vm.expectRevert(Arena.NotOnTicketList.selector);
        arena.checkIn(cid, ticketAddrs[1], ticketProofs[0]);
    }

    function test_checkIn_dripDelivered() public {
        _authoriseGate(id);
        uint256 before = voter1.balance;
        vm.expectEmit(true, true, true, true, address(arena));
        emit CheckedIn(id, voter1, gatekeeper, DRIP);
        vm.prank(gatekeeper);
        arena.checkIn{value: DRIP}(id, voter1, _noProof());
        assertEq(voter1.balance, before + DRIP);
        assertEq(arena.claimable(voter1), 0);
    }

    function test_checkIn_partialDripOk() public {
        _authoriseGate(id);
        vm.prank(gatekeeper);
        arena.checkIn{value: DRIP / 2}(id, voter1, _noProof());
        assertEq(voter1.balance, DRIP / 2);
    }

    function test_checkIn_dripAboveCapReverts() public {
        _authoriseGate(id);
        _checkInExpect(id, voter1, DRIP + 1, Arena.InvalidDrip.selector);
    }

    function test_checkIn_anyDripWhenCapZeroReverts() public {
        CreateParams memory p = _params(Presence.Gated);
        p.dripPerCheckIn = 0;
        uint256 cid = _create(p, 0);
        _authoriseGate(cid);
        _checkInExpect(cid, voter1, 1, Arena.InvalidDrip.selector);
    }

    function _assertDeferred(address receiver) internal {
        _authoriseGate(id);
        uint256 arenaBefore = address(arena).balance;
        vm.expectEmit(true, true, false, true, address(arena));
        emit DripDeferred(id, receiver, DRIP);
        vm.expectEmit(true, true, true, true, address(arena));
        emit CheckedIn(id, receiver, gatekeeper, DRIP);
        vm.prank(gatekeeper);
        uint256 g = gasleft();
        arena.checkIn{value: DRIP}(id, receiver, _noProof());
        g -= gasleft();
        assertTrue(arena.checkedIn(id, receiver));
        assertEq(arena.claimable(receiver), DRIP);
        assertEq(address(arena).balance, arenaBefore + DRIP);
        assertEq(receiver.balance, 0);
        // capped at DRIP_GAS plus fixed overhead, regardless of the receiver
        assertLt(g, 150_000);
    }

    function test_checkIn_dripToRejectingContract_defers() public {
        _assertDeferred(address(new RejectingReceiver()));
    }

    function test_checkIn_dripToGasGriefer_defers() public {
        _assertDeferred(address(new GasGriefer()));
    }

    function test_checkIn_dripReturnBomb_defers() public {
        _assertDeferred(address(new ReturnBomb()));
    }

    function test_checkIn_deferredDripIsStuckForRejectingContract() public {
        // documented limit: a contract that can't receive ETH can't withdraw its deferred drip either
        RejectingReceiver r = new RejectingReceiver();
        _authoriseGate(id);
        vm.prank(gatekeeper);
        arena.checkIn{value: DRIP}(id, address(r), _noProof());
        vm.expectRevert(Arena.TransferFailed.selector);
        r.claim(arena);
        assertEq(arena.claimable(address(r)), DRIP);
    }

    // order
    function test_order_presenceNotGatedBeatsNotGatekeeper() public {
        uint256 room = _createContest(Presence.Room);
        vm.prank(stranger);
        vm.expectRevert(Arena.PresenceNotGated.selector);
        arena.checkIn(room, address(0), _noProof());
    }

    function test_order_notGatekeeperBeatsVotingEnded() public {
        _warpToEnd(id);
        vm.prank(stranger);
        vm.expectRevert(Arena.NotGatekeeper.selector);
        arena.checkIn(id, voter1, _noProof());
    }

    function test_order_votingEndedBeatsInvalidVoter() public {
        _authoriseGate(id);
        _warpToEnd(id);
        _checkInExpect(id, address(0), 0, Arena.VotingEnded.selector);
    }

    function test_order_alreadyCheckedInBeatsTicketAndDrip() public {
        CreateParams memory p = _params(Presence.Gated);
        p.ticketRoot = ticketRoot;
        p.ticketListURI = TICKET_URI;
        uint256 cid = _create(p, PRIZE);
        _authoriseGate(cid);
        vm.prank(gatekeeper);
        arena.checkIn(cid, ticketAddrs[0], ticketProofs[0]);
        _checkInExpect(cid, ticketAddrs[0], 1 ether, Arena.AlreadyCheckedIn.selector);
    }

    function test_order_notOnTicketListBeatsDrip() public {
        CreateParams memory p = _params(Presence.Gated);
        p.ticketRoot = ticketRoot;
        p.ticketListURI = TICKET_URI;
        uint256 cid = _create(p, PRIZE);
        _authoriseGate(cid);
        _checkInExpect(cid, stranger, 1 ether, Arena.NotOnTicketList.selector);
    }

    // ------------------------------------------------------------ ticket freeze

    function test_setTicketList_afterCheckInReverts() public {
        _authoriseGate(id);
        _checkIn(id, voter1);
        vm.prank(organiser);
        vm.expectRevert(Arena.CheckInsStarted.selector);
        arena.setTicketList(id, ticketRoot, TICKET_URI);
    }

    function test_order_votingStartedBeatsCheckInsStarted() public {
        _authoriseGate(id);
        _checkIn(id, voter1);
        _warpToVoting(id);
        vm.prank(organiser);
        vm.expectRevert(Arena.VotingAlreadyStarted.selector);
        arena.setTicketList(id, ticketRoot, TICKET_URI);
    }

    // ---------------------------------------------------------------- voting

    function test_gatedVote_withoutCheckInReverts() public {
        _setBeacon(id);
        _warpToVoting(id);
        vm.prank(voter1);
        vm.expectRevert(Arena.NotCheckedIn.selector);
        arena.vote(id, 1, _beaconToken(_slotNow()), _noProof());
    }

    function test_gatedVote_requiresBeaconToo() public {
        _authoriseGate(id);
        _checkIn(id, voter1);
        _warpToVoting(id);
        vm.prank(voter1);
        vm.expectRevert(Arena.BeaconNotSet.selector);
        arena.vote(id, 1, BeaconToken(0, bytes16(0)), _noProof());

        _setBeacon(id);
        vm.prank(voter1);
        vm.expectRevert(Arena.InvalidBeaconToken.selector);
        arena.vote(id, 1, BeaconToken(_slotNow(), bytes16(keccak256("forged"))), _noProof());
    }

    function test_gatedVote_withCheckInAndBeaconWorks() public {
        _authoriseGate(id);
        _checkIn(id, voter1);
        _setBeacon(id);
        _warpToVoting(id);
        vm.prank(voter1);
        arena.vote(id, 2, _beaconToken(_slotNow()), _noProof());
        assertEq(arena.getContest(id).totalVotes, 1);
    }

    function test_gatedVote_ticketListNotRecheckedAtVote() public {
        CreateParams memory p = _params(Presence.Gated);
        p.ticketRoot = ticketRoot;
        p.ticketListURI = TICKET_URI;
        uint256 cid = _create(p, PRIZE);
        _addEntries(cid, 1);
        _authoriseGate(cid);
        vm.prank(gatekeeper);
        arena.checkIn(cid, ticketAddrs[3], ticketProofs[3]);
        _setBeacon(cid);
        _warpToVoting(cid);
        vm.prank(ticketAddrs[3]);
        arena.vote(cid, 1, _beaconToken(_slotNow()), _noProof());
    }

    function test_order_notCheckedInBeatsBeacon() public {
        _warpToVoting(id);
        vm.prank(voter1);
        vm.expectRevert(Arena.NotCheckedIn.selector);
        arena.vote(id, 1, BeaconToken(0, bytes16(0)), _noProof());
    }

    function test_order_ownEntryBeatsNotCheckedIn() public {
        _warpToVoting(id);
        vm.prank(_payee(1));
        vm.expectRevert(Arena.CannotVoteForOwnEntry.selector);
        arena.vote(id, 1, BeaconToken(0, bytes16(0)), _noProof());
    }
}
