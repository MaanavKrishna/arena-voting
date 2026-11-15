// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ArenaBase} from "./ArenaBase.t.sol";
import {Arena, Presence, CreateParams, ContestView} from "../src/Arena.sol";

contract ArenaCreateTest is ArenaBase {
    event ContestCreated(
        uint256 indexed contestId,
        address indexed organiser,
        Presence presence,
        uint256 prize,
        uint64 votingStart,
        uint64 votingEnd
    );
    event TicketListSet(uint256 indexed contestId, bytes32 root, string uri);

    function _bytes(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i; i < n; ++i) {
            b[i] = "a";
        }
        return string(b);
    }

    function _expectCreateRevert(CreateParams memory p, bytes4 sel) internal {
        vm.prank(organiser);
        vm.expectRevert(sel);
        arena.createContest(p);
    }

    // ------------------------------------------------------------------ happy

    function test_create_storesEveryField() public {
        CreateParams memory p = _params(Presence.Gated);
        p.openSubmissions = false;
        p.ticketRoot = ticketRoot;
        p.ticketListURI = TICKET_URI;
        uint256 id = _create(p, 2 ether);

        assertEq(id, 1);
        assertEq(arena.contestCount(), 1);
        ContestView memory c = arena.getContest(id);
        assertEq(c.id, 1);
        assertEq(c.organiser, organiser);
        assertEq(c.title, "Demo Day");
        assertEq(c.metadataURI, "ipfs://contest");
        assertEq(c.createdAt, T0);
        assertEq(c.submissionEnd, p.submissionEnd);
        assertEq(c.votingStart, p.votingStart);
        assertEq(c.votingEnd, p.votingEnd);
        assertEq(uint8(c.presence), uint8(Presence.Gated));
        assertFalse(c.openSubmissions);
        assertFalse(c.finalized);
        assertEq(c.prize, 2 ether);
        assertEq(c.dripPerCheckIn, DRIP);
        assertEq(c.ticketRoot, ticketRoot);
        assertEq(c.ticketListURI, TICKET_URI);
        assertEq(c.entryCount, 0);
        assertEq(c.liveEntryCount, 0);
        assertEq(c.totalVotes, 0);
        assertEq(c.checkedInCount, 0);
        assertEq(c.beaconAnchor, bytes16(0));
        assertEq(c.beaconStart, 0);
        assertEq(c.beaconLength, 0);
        assertEq(c.beaconRotation, 0);
        assertEq(c.beaconCachedIndex, 0);
        assertEq(address(arena).balance, 2 ether);
    }

    function test_create_emitsEvents() public {
        CreateParams memory p = _params(Presence.Room);
        p.ticketRoot = ticketRoot;
        p.ticketListURI = TICKET_URI;
        vm.expectEmit(true, true, false, true, address(arena));
        emit ContestCreated(1, organiser, Presence.Room, 1 ether, p.votingStart, p.votingEnd);
        vm.expectEmit(true, false, false, true, address(arena));
        emit TicketListSet(1, ticketRoot, TICKET_URI);
        _create(p, 1 ether);
    }

    function test_create_zeroPrizeAllowed() public {
        uint256 id = _create(_params(Presence.Anywhere), 0);
        assertEq(arena.getContest(id).prize, 0);
    }

    function test_create_idsIncrement() public {
        assertEq(_createContest(Presence.Anywhere), 1);
        assertEq(_createContest(Presence.Room), 2);
        assertEq(_createContest(Presence.Gated), 3);
    }

    // ------------------------------------------------------------------ title

    function test_create_title80Ok() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.title = _bytes(80);
        _create(p, 0);
    }

    function test_create_title81Reverts() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.title = _bytes(81);
        _expectCreateRevert(p, Arena.InvalidTitle.selector);
    }

    function test_create_emptyTitleReverts() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.title = "";
        _expectCreateRevert(p, Arena.InvalidTitle.selector);
    }

    // -------------------------------------------------------------------- uri

    function test_create_metadataURI200Ok() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.metadataURI = _bytes(200);
        _create(p, 0);
    }

    function test_create_metadataURI201Reverts() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.metadataURI = _bytes(201);
        _expectCreateRevert(p, Arena.InvalidURI.selector);
    }

    function test_create_ticketListURI201Reverts() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.ticketRoot = ticketRoot;
        p.ticketListURI = _bytes(201);
        _expectCreateRevert(p, Arena.InvalidURI.selector);
    }

    function test_create_emptyMetadataURIAllowed() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.metadataURI = "";
        _create(p, 0);
    }

    // -------------------------------------------------------------- ticket mismatch

    function test_create_rootWithoutURIReverts() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.ticketRoot = ticketRoot;
        _expectCreateRevert(p, Arena.TicketListMismatch.selector);
    }

    function test_create_uriWithoutRootReverts() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.ticketListURI = TICKET_URI;
        _expectCreateRevert(p, Arena.TicketListMismatch.selector);
    }

    // --------------------------------------------------------------- timeline

    function test_create_submissionEndNotInFutureReverts() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.submissionEnd = uint64(block.timestamp);
        _expectCreateRevert(p, Arena.InvalidTimeline.selector);
    }

    function test_create_submissionEndAfterVotingStartReverts() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.submissionEnd = p.votingStart + 1;
        _expectCreateRevert(p, Arena.InvalidTimeline.selector);
    }

    function test_create_submissionEndEqualsVotingStartOk() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.submissionEnd = p.votingStart;
        _create(p, 0);
    }

    function test_create_votingEndNotAfterStartReverts() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.votingEnd = p.votingStart;
        _expectCreateRevert(p, Arena.InvalidTimeline.selector);
    }

    function test_create_leadTime60DaysOk() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.votingEnd = uint64(block.timestamp) + 60 days;
        p.votingStart = p.votingEnd - 1 days;
        p.submissionEnd = p.votingStart;
        _create(p, 0);
    }

    function test_create_leadTime60DaysPlus1Reverts() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.votingEnd = uint64(block.timestamp) + 60 days + 1;
        p.votingStart = p.votingEnd - 1 days;
        p.submissionEnd = p.votingStart;
        _expectCreateRevert(p, Arena.InvalidTimeline.selector);
    }

    // --------------------------------------------------------------- duration

    function test_create_duration5MinOk() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.votingEnd = p.votingStart + 5 minutes;
        _create(p, 0);
    }

    function test_create_duration4m59Reverts() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.votingEnd = p.votingStart + 5 minutes - 1;
        _expectCreateRevert(p, Arena.InvalidVotingDuration.selector);
    }

    function test_create_duration7DaysOk() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.votingEnd = p.votingStart + 7 days;
        _create(p, 0);
    }

    function test_create_duration7DaysPlus1Reverts() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.votingEnd = p.votingStart + 7 days + 1;
        _expectCreateRevert(p, Arena.InvalidVotingDuration.selector);
    }

    // ------------------------------------------------------------------- drip

    function test_create_dripMaxOk() public {
        CreateParams memory p = _params(Presence.Gated);
        p.dripPerCheckIn = 0.01 ether;
        _create(p, 0);
    }

    function test_create_dripMaxPlus1WeiReverts() public {
        CreateParams memory p = _params(Presence.Gated);
        p.dripPerCheckIn = 0.01 ether + 1;
        _expectCreateRevert(p, Arena.InvalidDrip.selector);
    }

    function test_create_dripOnRoomReverts() public {
        CreateParams memory p = _params(Presence.Room);
        p.dripPerCheckIn = 1;
        _expectCreateRevert(p, Arena.InvalidDrip.selector);
    }

    function test_create_dripOnAnywhereReverts() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.dripPerCheckIn = 1;
        _expectCreateRevert(p, Arena.InvalidDrip.selector);
    }

    function test_create_zeroDripOnGatedOk() public {
        CreateParams memory p = _params(Presence.Gated);
        p.dripPerCheckIn = 0;
        _create(p, 0);
    }

    // ------------------------------------------------------------ check order

    function test_order_titleBeatsURI() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.title = "";
        p.metadataURI = _bytes(201);
        _expectCreateRevert(p, Arena.InvalidTitle.selector);
    }

    function test_order_uriBeatsMismatch() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.metadataURI = _bytes(201);
        p.ticketRoot = ticketRoot;
        _expectCreateRevert(p, Arena.InvalidURI.selector);
    }

    function test_order_mismatchBeatsTimeline() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.ticketRoot = ticketRoot;
        p.votingEnd = p.votingStart;
        _expectCreateRevert(p, Arena.TicketListMismatch.selector);
    }

    function test_order_timelineBeatsDuration() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.submissionEnd = uint64(block.timestamp);
        p.votingEnd = p.votingStart + 1;
        _expectCreateRevert(p, Arena.InvalidTimeline.selector);
    }

    function test_order_durationBeatsDrip() public {
        CreateParams memory p = _params(Presence.Anywhere);
        p.votingEnd = p.votingStart + 1;
        p.dripPerCheckIn = 1;
        _expectCreateRevert(p, Arena.InvalidVotingDuration.selector);
    }

    // ------------------------------------------------------------------ views

    function test_getContest_unknownReverts() public {
        vm.expectRevert(Arena.ContestNotFound.selector);
        arena.getContest(0);
        vm.expectRevert(Arena.ContestNotFound.selector);
        arena.getContest(1);
    }

    function test_getContests_newestFirstAndPaged() public {
        for (uint256 i; i < 3; ++i) {
            _createContest(Presence.Anywhere);
        }
        ContestView[] memory all = arena.getContests(0, 10);
        assertEq(all.length, 3);
        assertEq(all[0].id, 3);
        assertEq(all[2].id, 1);

        ContestView[] memory page = arena.getContests(1, 1);
        assertEq(page.length, 1);
        assertEq(page[0].id, 2);

        assertEq(arena.getContests(3, 10).length, 0);
        assertEq(arena.getContests(100, 10).length, 0);
        assertEq(arena.getContests(0, 0).length, 0);
    }

    function test_getContests_limitCappedAt50() public {
        for (uint256 i; i < 55; ++i) {
            _create(_params(Presence.Anywhere), 0);
        }
        ContestView[] memory page = arena.getContests(0, 1000);
        assertEq(page.length, 50);
        assertEq(page[0].id, 55);
        assertEq(page[49].id, 6);
    }

    function test_computeNextLink() public view {
        bytes16 x = bytes16(keccak256("x"));
        assertEq(arena.computeNextLink(x), bytes16(keccak256(abi.encodePacked(x))));
    }
}
