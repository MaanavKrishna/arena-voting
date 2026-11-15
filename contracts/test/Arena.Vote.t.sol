// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ArenaBase} from "./ArenaBase.t.sol";
import {Arena, Presence, CreateParams, BeaconToken, EntryView, ContestView} from "../src/Arena.sol";

contract ArenaVoteTest is ArenaBase {
    event VoteCast(uint256 indexed contestId, uint32 indexed entryId, address indexed voter);

    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = _createContest(Presence.Anywhere);
        _addEntries(id, 3);
    }

    function _expectVoteRevert(uint256 cid, address voter, uint32 entryId, bytes4 sel) internal {
        vm.prank(voter);
        vm.expectRevert(sel);
        arena.vote(cid, entryId, BeaconToken(0, bytes16(0)), _noProof());
    }

    // ---------------------------------------------------------------- basics

    function test_vote_countsAndEmits() public {
        _warpToVoting(id);
        vm.expectEmit(true, true, true, true, address(arena));
        emit VoteCast(id, 2, voter1);
        _vote(id, voter1, 2);
        _vote(id, voter2, 2);
        _vote(id, voter3, 1);

        EntryView[] memory es = arena.getEntries(id);
        assertEq(es[0].votes, 1);
        assertEq(es[1].votes, 2);
        assertEq(es[2].votes, 0);
        assertEq(arena.getContest(id).totalVotes, 3);
        assertEq(arena.votedEntry(id, voter1), 2);
        (uint32 voted, bool isIn) = arena.voterState(id, voter1);
        assertEq(voted, 2);
        assertFalse(isIn);
        (voted,) = arena.voterState(id, stranger);
        assertEq(voted, 0);
    }

    function test_vote_beaconIgnoredForAnywhere() public {
        _warpToVoting(id);
        vm.prank(voter1);
        arena.vote(id, 1, BeaconToken(12345, bytes16(keccak256("junk"))), _noProof());
        assertEq(arena.getContest(id).totalVotes, 1);
    }

    function test_vote_doubleVoteReverts() public {
        _warpToVoting(id);
        _vote(id, voter1, 1);
        _expectVoteRevert(id, voter1, 2, Arena.AlreadyVoted.selector);
        _expectVoteRevert(id, voter1, 1, Arena.AlreadyVoted.selector);
    }

    function test_vote_unknownEntryReverts() public {
        _warpToVoting(id);
        _expectVoteRevert(id, voter1, 0, Arena.EntryNotFound.selector);
        _expectVoteRevert(id, voter1, 4, Arena.EntryNotFound.selector);
    }

    function test_vote_removedEntryReverts() public {
        vm.prank(organiser);
        arena.removeEntry(id, 2);
        _warpToVoting(id);
        _expectVoteRevert(id, voter1, 2, Arena.EntryRemoved.selector);
    }

    // ------------------------------------------------------------- self-vote

    function test_vote_ownEntryAsPayeeReverts() public {
        _warpToVoting(id);
        _expectVoteRevert(id, _payee(1), 1, Arena.CannotVoteForOwnEntry.selector);
        // payee may vote for someone else
        _vote(id, _payee(1), 2);
    }

    function test_vote_ownEntryAsMemberReverts() public {
        uint256 cid = _createContest(Presence.Anywhere);
        address[] memory m = new address[](2);
        m[0] = voter2;
        m[1] = voter3;
        vm.prank(stranger);
        arena.submitEntry(cid, _payee(9), "ipfs://entry", m);
        _warpToVoting(cid);
        _expectVoteRevert(cid, voter3, 1, Arena.CannotVoteForOwnEntry.selector);
        _expectVoteRevert(cid, voter2, 1, Arena.CannotVoteForOwnEntry.selector);
    }

    function test_vote_ownEntryAsSubmitterReverts() public {
        uint256 cid = _createContest(Presence.Anywhere);
        _submit(cid, stranger, _payee(9));
        _submit(cid, voter1, _payee(10));
        _warpToVoting(cid);
        _expectVoteRevert(cid, stranger, 1, Arena.CannotVoteForOwnEntry.selector);
        _vote(cid, stranger, 2);
    }

    function test_vote_organiserSubmitterCanVoteInCurated() public {
        uint256 cid = _createCurated(Presence.Anywhere);
        _addEntries(cid, 2);
        _warpToVoting(cid);
        _vote(cid, organiser, 1);
        assertEq(arena.getEntries(cid)[0].votes, 1);
    }

    function test_vote_organiserAsPayeeReverts() public {
        uint256 cid = _createCurated(Presence.Anywhere);
        _submit(cid, organiser, organiser);
        _warpToVoting(cid);
        _expectVoteRevert(cid, organiser, 1, Arena.CannotVoteForOwnEntry.selector);
    }

    function test_vote_organiserAsMemberReverts() public {
        uint256 cid = _createCurated(Presence.Anywhere);
        address[] memory m = new address[](1);
        m[0] = organiser;
        vm.prank(organiser);
        arena.submitEntry(cid, _payee(1), "ipfs://entry", m);
        _warpToVoting(cid);
        _expectVoteRevert(cid, organiser, 1, Arena.CannotVoteForOwnEntry.selector);
    }

    // ---------------------------------------------------------------- window

    function test_vote_atVotingStartMinus1Reverts() public {
        vm.warp(arena.getContest(id).votingStart - 1);
        _expectVoteRevert(id, voter1, 1, Arena.VotingNotOpen.selector);
    }

    function test_vote_atVotingStartOk() public {
        vm.warp(arena.getContest(id).votingStart);
        _vote(id, voter1, 1);
    }

    function test_vote_atVotingEndMinus1Ok() public {
        vm.warp(arena.getContest(id).votingEnd - 1);
        _vote(id, voter1, 1);
    }

    function test_vote_atVotingEndReverts() public {
        vm.warp(arena.getContest(id).votingEnd);
        _expectVoteRevert(id, voter1, 1, Arena.VotingNotOpen.selector);
    }

    // ----------------------------------------------------------- ticket list

    function _ticketContest(Presence presence) internal returns (uint256 cid) {
        CreateParams memory p = _params(presence);
        p.ticketRoot = ticketRoot;
        p.ticketListURI = TICKET_URI;
        cid = _create(p, PRIZE);
        _addEntries(cid, 2);
    }

    function test_vote_ticketListOk() public {
        uint256 cid = _ticketContest(Presence.Anywhere);
        _warpToVoting(cid);
        for (uint256 i; i < ticketAddrs.length; ++i) {
            vm.prank(ticketAddrs[i]);
            arena.vote(cid, 1, BeaconToken(0, bytes16(0)), ticketProofs[i]);
        }
        assertEq(arena.getContest(cid).totalVotes, 4);
    }

    function test_vote_ticketListOutsiderReverts() public {
        uint256 cid = _ticketContest(Presence.Anywhere);
        _warpToVoting(cid);
        vm.prank(stranger);
        vm.expectRevert(Arena.NotOnTicketList.selector);
        arena.vote(cid, 1, BeaconToken(0, bytes16(0)), ticketProofs[0]);
        _expectVoteRevert(cid, stranger, 1, Arena.NotOnTicketList.selector);
    }

    function test_vote_ticketListWrongProofReverts() public {
        uint256 cid = _ticketContest(Presence.Anywhere);
        _warpToVoting(cid);
        vm.prank(ticketAddrs[0]);
        vm.expectRevert(Arena.NotOnTicketList.selector);
        arena.vote(cid, 1, BeaconToken(0, bytes16(0)), ticketProofs[1]);
    }

    function test_vote_clearedTicketListAllowsAnyone() public {
        uint256 cid = _ticketContest(Presence.Anywhere);
        vm.prank(organiser);
        arena.setTicketList(cid, bytes32(0), "");
        _warpToVoting(cid);
        _vote(cid, stranger, 1);
    }

    // ------------------------------------------------------------ check order

    function test_order_votingNotOpenBeatsEntryNotFound() public {
        _expectVoteRevert(id, voter1, 99, Arena.VotingNotOpen.selector);
    }

    function test_order_removedBeatsAlreadyVoted() public {
        vm.prank(organiser);
        arena.removeEntry(id, 2);
        _warpToVoting(id);
        _vote(id, voter1, 1);
        _expectVoteRevert(id, voter1, 2, Arena.EntryRemoved.selector);
    }

    function test_order_entryNotFoundBeatsAlreadyVoted() public {
        _warpToVoting(id);
        _vote(id, voter1, 1);
        _expectVoteRevert(id, voter1, 9, Arena.EntryNotFound.selector);
    }

    function test_order_alreadyVotedBeatsOwnEntry() public {
        _warpToVoting(id);
        _vote(id, _payee(2), 1);
        _expectVoteRevert(id, _payee(2), 2, Arena.AlreadyVoted.selector);
    }

    function test_order_ownEntryBeatsNotOnTicketList() public {
        uint256 cid = _ticketContest(Presence.Anywhere);
        _warpToVoting(cid);
        // _payee(1) is not on the ticket list and owns entry 1
        _expectVoteRevert(cid, _payee(1), 1, Arena.CannotVoteForOwnEntry.selector);
    }

    function test_order_notOnTicketListBeatsBeacon() public {
        uint256 cid = _ticketContest(Presence.Room);
        _warpToVoting(cid);
        // beacon never set, outsider: ticket list check runs first
        _expectVoteRevert(cid, stranger, 1, Arena.NotOnTicketList.selector);
    }

    function test_order_contestNotFoundFirst() public {
        BeaconToken memory t = BeaconToken(0, bytes16(0));
        uint256[2] memory bad = [uint256(0), arena.contestCount() + 1];
        for (uint256 i; i < bad.length; ++i) {
            uint256 cid = bad[i];
            vm.startPrank(stranger);
            vm.expectRevert(Arena.ContestNotFound.selector);
            arena.submitEntry(cid, address(0), "", new address[](0));
            vm.expectRevert(Arena.ContestNotFound.selector);
            arena.removeEntry(cid, 0);
            vm.expectRevert(Arena.ContestNotFound.selector);
            arena.setTicketList(cid, bytes32(0), "x");
            vm.expectRevert(Arena.ContestNotFound.selector);
            arena.setBeacon(cid, bytes16(0), 0, 0);
            vm.expectRevert(Arena.ContestNotFound.selector);
            arena.advanceBeacon(cid, t);
            vm.expectRevert(Arena.ContestNotFound.selector);
            arena.setGatekeeper(cid, address(0), true);
            vm.expectRevert(Arena.ContestNotFound.selector);
            arena.checkIn(cid, address(0), _noProof());
            vm.expectRevert(Arena.ContestNotFound.selector);
            arena.vote(cid, 0, t, _noProof());
            vm.expectRevert(Arena.ContestNotFound.selector);
            arena.finalize(cid);
            vm.stopPrank();
            vm.expectRevert(Arena.ContestNotFound.selector);
            arena.getContest(cid);
            vm.expectRevert(Arena.ContestNotFound.selector);
            arena.getEntries(cid);
            vm.expectRevert(Arena.ContestNotFound.selector);
            arena.voterState(cid, voter1);
            vm.expectRevert(Arena.ContestNotFound.selector);
            arena.beaconStatus(cid, t);
            vm.expectRevert(Arena.ContestNotFound.selector);
            arena.isBeaconTokenValid(cid, t);
        }
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_voteCountsMatch(uint8 voters, uint8 entries) public {
        uint256 nEntries = bound(entries, 1, 64);
        uint256 nVoters = bound(voters, 0, 200);
        uint256 cid = _createContest(Presence.Anywhere);
        _addEntries(cid, nEntries);
        _warpToVoting(cid);
        for (uint256 i; i < nVoters; ++i) {
            _vote(cid, address(uint160(0x1000000 + i)), uint32((i % nEntries) + 1));
        }
        EntryView[] memory es = arena.getEntries(cid);
        uint256 sum;
        for (uint256 i; i < es.length; ++i) {
            sum += es[i].votes;
        }
        ContestView memory c = arena.getContest(cid);
        assertEq(sum, nVoters);
        assertEq(c.totalVotes, nVoters);
    }
}
