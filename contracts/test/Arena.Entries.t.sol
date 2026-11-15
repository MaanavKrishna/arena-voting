// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ArenaBase} from "./ArenaBase.t.sol";
import {Arena, Presence, EntryView, ContestView} from "../src/Arena.sol";

contract ArenaEntriesTest is ArenaBase {
    event EntrySubmitted(
        uint256 indexed contestId,
        uint32 indexed entryId,
        address indexed payee,
        address submitter,
        string metadataURI
    );
    event EntryWithdrawn(uint256 indexed contestId, uint32 indexed entryId);
    event TicketListSet(uint256 indexed contestId, bytes32 root, string uri);

    function _members(uint256 n) internal pure returns (address[] memory m) {
        m = new address[](n);
        for (uint256 i; i < n; ++i) {
            m[i] = address(uint160(0xA000 + i));
        }
    }

    function _longURI(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i; i < n; ++i) {
            b[i] = "u";
        }
        return string(b);
    }

    // ---------------------------------------------------------------- submit

    function test_submit_organiserAddsInCurated() public {
        uint256 id = _createCurated(Presence.Anywhere);
        vm.expectEmit(true, true, true, true, address(arena));
        emit EntrySubmitted(id, 1, _payee(1), organiser, "ipfs://entry");
        uint32 eid = _submit(id, organiser, _payee(1));
        assertEq(eid, 1);
        ContestView memory c = arena.getContest(id);
        assertEq(c.entryCount, 1);
        assertEq(c.liveEntryCount, 1);
    }

    function test_submit_strangerInCuratedReverts() public {
        uint256 id = _createCurated(Presence.Anywhere);
        vm.prank(stranger);
        vm.expectRevert(Arena.NotOrganiser.selector);
        arena.submitEntry(id, _payee(1), "ipfs://entry", new address[](0));
    }

    function test_submit_openAllowsStranger() public {
        uint256 id = _createContest(Presence.Anywhere);
        uint32 eid = _submit(id, stranger, _payee(1));
        assertEq(eid, 1);
    }

    function test_submit_storesEveryField() public {
        uint256 id = _createContest(Presence.Anywhere);
        address[] memory m = _members(2);
        vm.prank(stranger);
        arena.submitEntry(id, _payee(7), "ipfs://e7", m);
        EntryView[] memory es = arena.getEntries(id);
        assertEq(es.length, 1);
        assertEq(es[0].id, 1);
        assertEq(es[0].payee, _payee(7));
        assertEq(es[0].submitter, stranger);
        assertEq(es[0].members.length, 2);
        assertEq(es[0].members[0], m[0]);
        assertEq(es[0].members[1], m[1]);
        assertEq(es[0].metadataURI, "ipfs://e7");
        assertEq(es[0].votes, 0);
        assertFalse(es[0].removed);
    }

    function test_submit_64thOk65thReverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        _addEntries(id, 63);
        assertEq(_submit(id, organiser, _payee(64)), 64);
        vm.prank(organiser);
        vm.expectRevert(Arena.TooManyEntries.selector);
        arena.submitEntry(id, _payee(65), "ipfs://entry", new address[](0));
    }

    function test_submit_removingEntryFreesLiveSlot() public {
        uint256 id = _createContest(Presence.Anywhere);
        _addEntries(id, 64);
        vm.prank(organiser);
        arena.removeEntry(id, 1);
        assertEq(_submit(id, organiser, _payee(65)), 65);
        ContestView memory c = arena.getContest(id);
        assertEq(c.entryCount, 65);
        assertEq(c.liveEntryCount, 64);
        vm.prank(organiser);
        vm.expectRevert(Arena.TooManyEntries.selector);
        arena.submitEntry(id, _payee(66), "ipfs://entry", new address[](0));
    }

    /// @dev 64 live, remove all, 64 more: 128 pushed. With a live slot free, the total cap still holds.
    function test_submit_totalCap128() public {
        uint256 id = _createContest(Presence.Anywhere);
        _addEntries(id, 64);
        vm.startPrank(organiser);
        for (uint32 i = 1; i <= 64; ++i) {
            arena.removeEntry(id, i);
        }
        for (uint256 i = 65; i <= 128; ++i) {
            arena.submitEntry(id, _payee(i), "ipfs://entry", new address[](0));
        }
        arena.removeEntry(id, 128);
        ContestView memory c = arena.getContest(id);
        assertEq(c.entryCount, 128);
        assertEq(c.liveEntryCount, 63);
        vm.expectRevert(Arena.TooManyEntries.selector);
        arena.submitEntry(id, _payee(129), "ipfs://entry", new address[](0));
        vm.stopPrank();
        assertEq(arena.MAX_TOTAL_ENTRIES(), 128);
    }

    function test_getEntries_128Pushed() public {
        uint256 id = _createContest(Presence.Anywhere);
        _addEntries(id, 64);
        vm.startPrank(organiser);
        for (uint32 i = 1; i <= 64; ++i) {
            arena.removeEntry(id, i);
        }
        for (uint256 i = 65; i <= 128; ++i) {
            arena.submitEntry(id, _payee(i), "ipfs://entry", new address[](0));
        }
        vm.stopPrank();
        EntryView[] memory es = arena.getEntries(id);
        assertEq(es.length, 128);
        assertTrue(es[63].removed);
        assertFalse(es[64].removed);
        assertEq(es[127].id, 128);
        assertEq(es[127].payee, _payee(128));
    }

    // ------------------------------------------------- per-submitter limit

    function test_submit_strangerThreeOkFourthReverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        for (uint256 i = 1; i <= 3; ++i) {
            _submit(id, stranger, _payee(i));
        }
        assertEq(arena.entriesSubmitted(id, stranger), 3);
        assertEq(arena.MAX_ENTRIES_PER_SUBMITTER(), 3);
        vm.prank(stranger);
        vm.expectRevert(Arena.TooManyEntriesFromSubmitter.selector);
        arena.submitEntry(id, _payee(4), "ipfs://entry", new address[](0));
    }

    function test_submit_organiserExemptFromSubmitterLimit() public {
        uint256 id = _createContest(Presence.Anywhere);
        _addEntries(id, 10);
        assertEq(arena.getContest(id).entryCount, 10);
        assertEq(arena.entriesSubmitted(id, organiser), 0);
    }

    function test_submit_separateSubmittersEachGetThree() public {
        uint256 id = _createContest(Presence.Anywhere);
        for (uint256 i = 1; i <= 3; ++i) {
            _submit(id, stranger, _payee(i));
            _submit(id, voter1, _payee(10 + i));
        }
        _submit(id, voter2, _payee(20));
        assertEq(arena.getContest(id).entryCount, 7);
        vm.prank(voter1);
        vm.expectRevert(Arena.TooManyEntriesFromSubmitter.selector);
        arena.submitEntry(id, _payee(30), "ipfs://entry", new address[](0));
    }

    function test_submit_submitterLimitIsPerContest() public {
        uint256 a = _createContest(Presence.Anywhere);
        uint256 b = _createContest(Presence.Anywhere);
        for (uint256 i = 1; i <= 3; ++i) {
            _submit(a, stranger, _payee(i));
            _submit(b, stranger, _payee(i));
        }
        assertEq(arena.entriesSubmitted(a, stranger), 3);
        assertEq(arena.entriesSubmitted(b, stranger), 3);
    }

    /// @dev Removing junk must not hand the griefer their quota back.
    function test_submit_removalDoesNotRestoreSubmitterQuota() public {
        uint256 id = _createContest(Presence.Anywhere);
        for (uint256 i = 1; i <= 3; ++i) {
            _submit(id, stranger, _payee(i));
        }
        vm.prank(organiser);
        arena.removeEntry(id, 1);
        vm.prank(stranger);
        vm.expectRevert(Arena.TooManyEntriesFromSubmitter.selector);
        arena.submitEntry(id, _payee(4), "ipfs://entry", new address[](0));
    }

    /// @dev Griefers fill all 64 live slots; the organiser removes them and a real team gets in.
    function test_submit_griefedContestRecoversAfterRemoval() public {
        uint256 id = _createContest(Presence.Anywhere);
        for (uint256 i; i < 64; ++i) {
            _submit(id, address(uint160(0xBAD000 + i / 3)), _payee(i + 1));
        }
        vm.prank(voter1);
        vm.expectRevert(Arena.TooManyEntries.selector);
        arena.submitEntry(id, _payee(100), "ipfs://real", new address[](0));

        vm.startPrank(organiser);
        for (uint32 i = 1; i <= 64; ++i) {
            arena.removeEntry(id, i);
        }
        vm.stopPrank();
        assertEq(_submit(id, voter1, _payee(100)), 65);
    }

    function test_order_tooManyEntriesBeatsSubmitterLimit() public {
        uint256 id = _createContest(Presence.Anywhere);
        for (uint256 i = 1; i <= 3; ++i) {
            _submit(id, stranger, _payee(i));
        }
        _addEntries(id, 61);
        vm.prank(stranger);
        vm.expectRevert(Arena.TooManyEntries.selector);
        arena.submitEntry(id, _payee(99), "ipfs://entry", new address[](0));
    }

    function test_order_submitterLimitBeatsInvalidPayee() public {
        uint256 id = _createContest(Presence.Anywhere);
        for (uint256 i = 1; i <= 3; ++i) {
            _submit(id, stranger, _payee(i));
        }
        vm.prank(stranger);
        vm.expectRevert(Arena.TooManyEntriesFromSubmitter.selector);
        arena.submitEntry(id, address(0), "", new address[](0));
    }

    // ------------------------------------------------ payee / member != Arena

    function test_submit_arenaAsPayeeReverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        vm.prank(stranger);
        vm.expectRevert(Arena.InvalidPayee.selector);
        arena.submitEntry(id, address(arena), "ipfs://entry", new address[](0));
    }

    function test_submit_arenaAsMemberReverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        address[] memory m = _members(3);
        m[1] = address(arena);
        vm.prank(stranger);
        vm.expectRevert(Arena.InvalidMember.selector);
        arena.submitEntry(id, _payee(1), "ipfs://entry", m);
    }

    function test_submit_8MembersOk9Reverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        vm.prank(stranger);
        arena.submitEntry(id, _payee(1), "ipfs://entry", _members(8));
        vm.prank(stranger);
        vm.expectRevert(Arena.TooManyMembers.selector);
        arena.submitEntry(id, _payee(2), "ipfs://entry", _members(9));
    }

    function test_submit_duplicateMemberReverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        address[] memory m = _members(3);
        m[2] = m[0];
        vm.prank(stranger);
        vm.expectRevert(Arena.InvalidMember.selector);
        arena.submitEntry(id, _payee(1), "ipfs://entry", m);
    }

    function test_submit_payeeAsMemberReverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        address[] memory m = _members(2);
        m[1] = _payee(1);
        vm.prank(stranger);
        vm.expectRevert(Arena.InvalidMember.selector);
        arena.submitEntry(id, _payee(1), "ipfs://entry", m);
    }

    function test_submit_zeroMemberReverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        address[] memory m = _members(2);
        m[0] = address(0);
        vm.prank(stranger);
        vm.expectRevert(Arena.InvalidMember.selector);
        arena.submitEntry(id, _payee(1), "ipfs://entry", m);
    }

    function test_submit_zeroPayeeReverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        vm.prank(stranger);
        vm.expectRevert(Arena.InvalidPayee.selector);
        arena.submitEntry(id, address(0), "ipfs://entry", new address[](0));
    }

    function test_submit_emptyURIReverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        vm.prank(stranger);
        vm.expectRevert(Arena.InvalidURI.selector);
        arena.submitEntry(id, _payee(1), "", new address[](0));
    }

    function test_submit_uri200Ok201Reverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        vm.prank(stranger);
        arena.submitEntry(id, _payee(1), _longURI(200), new address[](0));
        vm.prank(stranger);
        vm.expectRevert(Arena.InvalidURI.selector);
        arena.submitEntry(id, _payee(2), _longURI(201), new address[](0));
    }

    function test_submit_atSubmissionEndMinus1Ok() public {
        uint256 id = _createContest(Presence.Anywhere);
        vm.warp(arena.getContest(id).submissionEnd - 1);
        _submit(id, stranger, _payee(1));
    }

    function test_submit_atSubmissionEndReverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        vm.warp(arena.getContest(id).submissionEnd);
        vm.prank(stranger);
        vm.expectRevert(Arena.SubmissionsClosed.selector);
        arena.submitEntry(id, _payee(1), "ipfs://entry", new address[](0));
    }

    // pairwise order
    function test_order_submissionsClosedBeatsNotOrganiser() public {
        uint256 id = _createCurated(Presence.Anywhere);
        vm.warp(arena.getContest(id).submissionEnd);
        vm.prank(stranger);
        vm.expectRevert(Arena.SubmissionsClosed.selector);
        arena.submitEntry(id, address(0), "", new address[](0));
    }

    function test_order_notOrganiserBeatsTooManyEntries() public {
        uint256 id = _createCurated(Presence.Anywhere);
        _addEntries(id, 64);
        vm.prank(stranger);
        vm.expectRevert(Arena.NotOrganiser.selector);
        arena.submitEntry(id, _payee(1), "ipfs://entry", new address[](0));
    }

    function test_order_tooManyEntriesBeatsInvalidPayee() public {
        uint256 id = _createContest(Presence.Anywhere);
        _addEntries(id, 64);
        vm.prank(stranger);
        vm.expectRevert(Arena.TooManyEntries.selector);
        arena.submitEntry(id, address(0), "ipfs://entry", new address[](0));
    }

    function test_order_invalidPayeeBeatsURI() public {
        uint256 id = _createContest(Presence.Anywhere);
        vm.prank(stranger);
        vm.expectRevert(Arena.InvalidPayee.selector);
        arena.submitEntry(id, address(0), "", new address[](0));
    }

    function test_order_uriBeatsTooManyMembers() public {
        uint256 id = _createContest(Presence.Anywhere);
        vm.prank(stranger);
        vm.expectRevert(Arena.InvalidURI.selector);
        arena.submitEntry(id, _payee(1), "", _members(9));
    }

    function test_order_tooManyMembersBeatsInvalidMember() public {
        uint256 id = _createContest(Presence.Anywhere);
        address[] memory m = _members(9);
        m[0] = address(0);
        vm.prank(stranger);
        vm.expectRevert(Arena.TooManyMembers.selector);
        arena.submitEntry(id, _payee(1), "ipfs://entry", m);
    }

    // ---------------------------------------------------------------- remove

    function test_remove_beforeVotingStartOk() public {
        uint256 id = _createContest(Presence.Anywhere);
        _addEntries(id, 2);
        vm.warp(arena.getContest(id).votingStart - 1);
        vm.expectEmit(true, true, false, true, address(arena));
        emit EntryWithdrawn(id, 1);
        vm.prank(organiser);
        arena.removeEntry(id, 1);
        EntryView[] memory es = arena.getEntries(id);
        assertTrue(es[0].removed);
        assertFalse(es[1].removed);
        ContestView memory c = arena.getContest(id);
        assertEq(c.entryCount, 2);
        assertEq(c.liveEntryCount, 1);
    }

    function test_remove_atVotingStartReverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        _addEntries(id, 1);
        _warpToVoting(id);
        vm.prank(organiser);
        vm.expectRevert(Arena.VotingAlreadyStarted.selector);
        arena.removeEntry(id, 1);
    }

    function test_remove_strangerReverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        _submit(id, stranger, _payee(1));
        vm.prank(stranger);
        vm.expectRevert(Arena.NotOrganiser.selector);
        arena.removeEntry(id, 1);
    }

    function test_remove_unknownEntryReverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        _addEntries(id, 1);
        vm.startPrank(organiser);
        vm.expectRevert(Arena.EntryNotFound.selector);
        arena.removeEntry(id, 0);
        vm.expectRevert(Arena.EntryNotFound.selector);
        arena.removeEntry(id, 2);
        vm.stopPrank();
    }

    function test_remove_twiceReverts() public {
        uint256 id = _createContest(Presence.Anywhere);
        _addEntries(id, 1);
        vm.startPrank(organiser);
        arena.removeEntry(id, 1);
        vm.expectRevert(Arena.EntryRemoved.selector);
        arena.removeEntry(id, 1);
        vm.stopPrank();
    }

    function test_order_notOrganiserBeatsVotingStarted() public {
        uint256 id = _createContest(Presence.Anywhere);
        _warpToVoting(id);
        vm.prank(stranger);
        vm.expectRevert(Arena.NotOrganiser.selector);
        arena.removeEntry(id, 5);
    }

    function test_order_votingStartedBeatsEntryNotFound() public {
        uint256 id = _createContest(Presence.Anywhere);
        _warpToVoting(id);
        vm.prank(organiser);
        vm.expectRevert(Arena.VotingAlreadyStarted.selector);
        arena.removeEntry(id, 5);
    }

    // ----------------------------------------------------------- ticket list

    function test_setTicketList_setAndClear() public {
        uint256 id = _createContest(Presence.Room);
        vm.expectEmit(true, false, false, true, address(arena));
        emit TicketListSet(id, ticketRoot, TICKET_URI);
        vm.prank(organiser);
        arena.setTicketList(id, ticketRoot, TICKET_URI);
        ContestView memory c = arena.getContest(id);
        assertEq(c.ticketRoot, ticketRoot);
        assertEq(c.ticketListURI, TICKET_URI);

        vm.prank(organiser);
        arena.setTicketList(id, bytes32(0), "");
        c = arena.getContest(id);
        assertEq(c.ticketRoot, bytes32(0));
        assertEq(c.ticketListURI, "");
    }

    function test_setTicketList_organiserOnly() public {
        uint256 id = _createContest(Presence.Room);
        vm.prank(stranger);
        vm.expectRevert(Arena.NotOrganiser.selector);
        arena.setTicketList(id, ticketRoot, TICKET_URI);
    }

    function test_setTicketList_rootWithoutURIReverts() public {
        uint256 id = _createContest(Presence.Room);
        vm.prank(organiser);
        vm.expectRevert(Arena.TicketListMismatch.selector);
        arena.setTicketList(id, ticketRoot, "");
    }

    function test_setTicketList_uriWithoutRootReverts() public {
        uint256 id = _createContest(Presence.Room);
        vm.prank(organiser);
        vm.expectRevert(Arena.TicketListMismatch.selector);
        arena.setTicketList(id, bytes32(0), TICKET_URI);
    }

    function test_setTicketList_uriTooLongReverts() public {
        uint256 id = _createContest(Presence.Room);
        vm.prank(organiser);
        vm.expectRevert(Arena.InvalidURI.selector);
        arena.setTicketList(id, ticketRoot, _longURI(201));
    }

    function test_setTicketList_atVotingStartReverts() public {
        uint256 id = _createContest(Presence.Room);
        _warpToVoting(id);
        vm.prank(organiser);
        vm.expectRevert(Arena.VotingAlreadyStarted.selector);
        arena.setTicketList(id, ticketRoot, TICKET_URI);
    }

    function test_setTicketList_beforeVotingStartOk() public {
        uint256 id = _createContest(Presence.Room);
        vm.warp(arena.getContest(id).votingStart - 1);
        vm.prank(organiser);
        arena.setTicketList(id, ticketRoot, TICKET_URI);
    }

    function test_order_ticketListURIBeatsMismatch() public {
        uint256 id = _createContest(Presence.Room);
        vm.prank(organiser);
        vm.expectRevert(Arena.InvalidURI.selector);
        arena.setTicketList(id, bytes32(0), _longURI(201));
    }

    // ------------------------------------------------------------- entry views

    function test_getEntries_unknownContestReverts() public {
        vm.expectRevert(Arena.ContestNotFound.selector);
        arena.getEntries(1);
    }

    function test_getEntries_emptyContest() public {
        uint256 id = _createContest(Presence.Anywhere);
        assertEq(arena.getEntries(id).length, 0);
    }
}
