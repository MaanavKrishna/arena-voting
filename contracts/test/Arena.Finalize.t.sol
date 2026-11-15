// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {console} from "forge-std/Test.sol";
import {ArenaBase} from "./ArenaBase.t.sol";
import {Arena, Presence, CreateParams} from "../src/Arena.sol";
import {ReentrantPayee} from "./mocks/ReentrantPayee.sol";
import {RejectingReceiver} from "./mocks/RejectingReceiver.sol";

contract ArenaFinalizeTest is ArenaBase {
    event ContestFinalized(uint256 indexed contestId, uint32[] winnerIds, uint256 share);
    event Withdrawn(address indexed account, uint256 amount);

    function _votes(uint256 cid, uint32 entryId, uint256 n, uint256 salt) internal {
        for (uint256 i; i < n; ++i) {
            _vote(cid, address(uint160(0x2000000 + salt * 1000 + i)), entryId);
        }
    }

    function test_finalize_singleWinnerGetsFullPrize() public {
        uint256 cid = _createContest(Presence.Anywhere);
        _addEntries(cid, 3);
        _warpToVoting(cid);
        _votes(cid, 2, 3, 1);
        _votes(cid, 1, 1, 2);
        _warpToEnd(cid);

        uint32[] memory w = new uint32[](1);
        w[0] = 2;
        vm.expectEmit(true, false, false, true, address(arena));
        emit ContestFinalized(cid, w, PRIZE);
        vm.prank(stranger);
        arena.finalize(cid);

        assertTrue(arena.getContest(cid).finalized);
        assertEq(arena.claimable(_payee(2)), PRIZE);
        assertEq(arena.claimable(_payee(1)), 0);
        assertEq(arena.claimable(organiser), 0);
    }

    function test_finalize_threeWayTieSplitsWithDustToOrganiser() public {
        CreateParams memory p = _params(Presence.Anywhere);
        uint256 prize = 1 ether + 2; // 1e18+2 is not divisible by 3
        uint256 cid = _create(p, prize);
        _addEntries(cid, 4);
        _warpToVoting(cid);
        _votes(cid, 1, 2, 1);
        _votes(cid, 2, 2, 2);
        _votes(cid, 4, 2, 3);
        _votes(cid, 3, 1, 4);
        _warpToEnd(cid);

        uint256 share = prize / 3;
        uint32[] memory w = new uint32[](3);
        (w[0], w[1], w[2]) = (1, 2, 4);
        vm.expectEmit(true, false, false, true, address(arena));
        emit ContestFinalized(cid, w, share);
        arena.finalize(cid);

        assertEq(arena.claimable(_payee(1)), share);
        assertEq(arena.claimable(_payee(2)), share);
        assertEq(arena.claimable(_payee(4)), share);
        assertEq(arena.claimable(_payee(3)), 0);
        assertEq(arena.claimable(organiser), prize % 3);
        assertEq(share * 3 + prize % 3, prize);
    }

    function test_finalize_zeroVotesRefundsOrganiser() public {
        uint256 cid = _createContest(Presence.Anywhere);
        _addEntries(cid, 2);
        _warpToEnd(cid);
        vm.expectEmit(true, false, false, true, address(arena));
        emit ContestFinalized(cid, new uint32[](0), 0);
        arena.finalize(cid);
        assertEq(arena.claimable(organiser), PRIZE);
    }

    function test_finalize_noEntriesRefundsOrganiser() public {
        uint256 cid = _createContest(Presence.Anywhere);
        _warpToEnd(cid);
        arena.finalize(cid);
        assertEq(arena.claimable(organiser), PRIZE);
    }

    function test_finalize_removedEntriesExcluded() public {
        uint256 cid = _createContest(Presence.Anywhere);
        _addEntries(cid, 3);
        vm.prank(organiser);
        arena.removeEntry(cid, 1);
        _warpToVoting(cid);
        _votes(cid, 2, 1, 1);
        _warpToEnd(cid);
        arena.finalize(cid);
        assertEq(arena.claimable(_payee(1)), 0);
        assertEq(arena.claimable(_payee(2)), PRIZE);
    }

    function test_finalize_zeroPrizeWithWinner() public {
        uint256 cid = _create(_params(Presence.Anywhere), 0);
        _addEntries(cid, 1);
        _warpToVoting(cid);
        _votes(cid, 1, 1, 1);
        _warpToEnd(cid);
        arena.finalize(cid);
        assertEq(arena.claimable(_payee(1)), 0);
        assertTrue(arena.getContest(cid).finalized);
    }

    function test_finalize_samePayeeTwiceAccumulates() public {
        uint256 cid = _createContest(Presence.Anywhere);
        _submit(cid, stranger, _payee(1));
        _submit(cid, voter1, _payee(1));
        _warpToVoting(cid);
        _votes(cid, 1, 1, 1);
        _votes(cid, 2, 1, 2);
        _warpToEnd(cid);
        arena.finalize(cid);
        assertEq(arena.claimable(_payee(1)), PRIZE);
    }

    function test_finalize_beforeVotingEndReverts() public {
        uint256 cid = _createContest(Presence.Anywhere);
        vm.warp(arena.getContest(cid).votingEnd - 1);
        vm.expectRevert(Arena.VotingNotEnded.selector);
        arena.finalize(cid);
    }

    function test_finalize_twiceReverts() public {
        uint256 cid = _createContest(Presence.Anywhere);
        _warpToEnd(cid);
        arena.finalize(cid);
        vm.expectRevert(Arena.AlreadyFinalized.selector);
        arena.finalize(cid);
    }

    // --------------------------------------------------------------- withdraw

    function test_withdraw_sendsAndZeroes() public {
        uint256 cid = _createContest(Presence.Anywhere);
        _addEntries(cid, 1);
        _warpToVoting(cid);
        _votes(cid, 1, 1, 1);
        _warpToEnd(cid);
        arena.finalize(cid);

        address payee = _payee(1);
        uint256 before = payee.balance;
        vm.expectEmit(true, false, false, true, address(arena));
        emit Withdrawn(payee, PRIZE);
        vm.prank(payee);
        arena.withdraw();
        assertEq(payee.balance, before + PRIZE);
        assertEq(arena.claimable(payee), 0);
        assertEq(address(arena).balance, 0);

        vm.prank(payee);
        vm.expectRevert(Arena.NothingToClaim.selector);
        arena.withdraw();
    }

    function test_withdraw_nothingToClaimReverts() public {
        vm.prank(stranger);
        vm.expectRevert(Arena.NothingToClaim.selector);
        arena.withdraw();
    }

    function test_withdraw_rejectingReceiverRevertsTransferFailed() public {
        RejectingReceiver r = new RejectingReceiver();
        uint256 cid = _createContest(Presence.Anywhere);
        _submit(cid, organiser, address(r));
        _warpToVoting(cid);
        _votes(cid, 1, 1, 1);
        _warpToEnd(cid);
        arena.finalize(cid);
        vm.expectRevert(Arena.TransferFailed.selector);
        r.claim(arena);
        assertEq(arena.claimable(address(r)), PRIZE);
    }

    function _reentrantWinner() internal returns (ReentrantPayee attacker) {
        attacker = new ReentrantPayee(arena);
        // two contests so the attacker has more claimable than one share would drain
        for (uint256 k; k < 2; ++k) {
            uint256 cid = _createContest(Presence.Anywhere);
            _submit(cid, organiser, address(attacker));
            _warpToVoting(cid);
            _votes(cid, 1, 1, 10 + k);
            _warpToEnd(cid);
            arena.finalize(cid);
        }
        // a second, honest claimant keeps ETH in the contract
        uint256 other = _createContest(Presence.Anywhere);
        _addEntries(other, 1);
        _warpToVoting(other);
        _votes(other, 1, 1, 20);
        _warpToEnd(other);
        arena.finalize(other);
    }

    function test_withdraw_reentrancyAttemptFails() public {
        ReentrantPayee attacker = _reentrantWinner();
        uint256 owed = arena.claimable(address(attacker));
        assertEq(owed, 2 * PRIZE);
        attacker.claim();
        assertTrue(attacker.reentered());
        assertFalse(attacker.reentrySucceeded());
        assertEq(attacker.received(), owed);
        assertEq(address(attacker).balance, owed);
        assertEq(arena.claimable(address(attacker)), 0);
        assertEq(address(arena).balance, PRIZE);
    }

    function test_withdraw_reentrancyBubblingRevertsTransferFailed() public {
        ReentrantPayee attacker = _reentrantWinner();
        attacker.setBubble(true);
        vm.expectRevert(Arena.TransferFailed.selector);
        attacker.claim();
        assertEq(arena.claimable(address(attacker)), 2 * PRIZE);
    }

    // ------------------------------------------------------------- withdrawTo

    function test_withdrawTo_sendsToRecipientAndEmits() public {
        uint256 cid = _createContest(Presence.Anywhere);
        _addEntries(cid, 1);
        _warpToVoting(cid);
        _votes(cid, 1, 1, 1);
        _warpToEnd(cid);
        arena.finalize(cid);

        address payee = _payee(1);
        address payable to = payable(makeAddr("treasury"));
        uint256 payeeBefore = payee.balance;
        vm.expectEmit(true, false, false, true, address(arena));
        emit Withdrawn(payee, PRIZE);
        vm.prank(payee);
        arena.withdrawTo(to);
        assertEq(to.balance, PRIZE);
        assertEq(payee.balance, payeeBefore);
        assertEq(arena.claimable(payee), 0);
        assertEq(address(arena).balance, 0);

        vm.prank(payee);
        vm.expectRevert(Arena.NothingToClaim.selector);
        arena.withdrawTo(to);
    }

    function test_withdrawTo_zeroAddressReverts() public {
        uint256 cid = _createContest(Presence.Anywhere);
        _addEntries(cid, 1);
        _warpToVoting(cid);
        _votes(cid, 1, 1, 1);
        _warpToEnd(cid);
        arena.finalize(cid);
        vm.prank(_payee(1));
        vm.expectRevert(Arena.InvalidPayee.selector);
        arena.withdrawTo(payable(address(0)));
        assertEq(arena.claimable(_payee(1)), PRIZE);
    }

    function test_withdrawTo_nothingToClaimReverts() public {
        vm.prank(stranger);
        vm.expectRevert(Arena.NothingToClaim.selector);
        arena.withdrawTo(payable(voter1));
    }

    function test_order_withdrawTo_zeroAddressBeatsNothingToClaim() public {
        vm.prank(stranger);
        vm.expectRevert(Arena.InvalidPayee.selector);
        arena.withdrawTo(payable(address(0)));
    }

    /// @dev The case withdrawTo exists for: a payee contract that can call but not receive.
    function test_withdrawTo_rejectingPayeeRoutesFunds() public {
        RejectingReceiver r = new RejectingReceiver();
        uint256 cid = _createContest(Presence.Anywhere);
        _submit(cid, organiser, address(r));
        _warpToVoting(cid);
        _votes(cid, 1, 1, 1);
        _warpToEnd(cid);
        arena.finalize(cid);

        vm.expectRevert(Arena.TransferFailed.selector);
        r.claim(arena);

        address payable to = payable(makeAddr("rescue"));
        vm.expectEmit(true, false, false, true, address(arena));
        emit Withdrawn(address(r), PRIZE);
        r.claimTo(arena, to);
        assertEq(to.balance, PRIZE);
        assertEq(arena.claimable(address(r)), 0);
    }

    function test_withdrawTo_rejectingRecipientRevertsTransferFailed() public {
        RejectingReceiver sink = new RejectingReceiver();
        uint256 cid = _createContest(Presence.Anywhere);
        _addEntries(cid, 1);
        _warpToVoting(cid);
        _votes(cid, 1, 1, 1);
        _warpToEnd(cid);
        arena.finalize(cid);
        vm.prank(_payee(1));
        vm.expectRevert(Arena.TransferFailed.selector);
        arena.withdrawTo(payable(address(sink)));
        assertEq(arena.claimable(_payee(1)), PRIZE);
    }

    function test_withdrawTo_reentrancyAttemptFails() public {
        ReentrantPayee attacker = _reentrantWinner();
        attacker.setViaWithdrawTo(true);
        uint256 owed = arena.claimable(address(attacker));
        attacker.claimTo(payable(address(attacker)));
        assertTrue(attacker.reentered());
        assertFalse(attacker.reentrySucceeded());
        assertEq(attacker.received(), owed);
        assertEq(arena.claimable(address(attacker)), 0);
        assertEq(address(arena).balance, PRIZE);
    }

    function test_withdrawTo_reentrancyBubblingRevertsTransferFailed() public {
        ReentrantPayee attacker = _reentrantWinner();
        attacker.setViaWithdrawTo(true);
        attacker.setBubble(true);
        vm.expectRevert(Arena.TransferFailed.selector);
        attacker.claimTo(payable(address(attacker)));
        assertEq(arena.claimable(address(attacker)), 2 * PRIZE);
    }

    /// @dev withdraw re-entered from a withdrawTo payout (cross-function) is blocked too.
    function test_withdrawTo_crossFunctionReentrancyFails() public {
        ReentrantPayee attacker = _reentrantWinner();
        uint256 owed = arena.claimable(address(attacker));
        attacker.claimTo(payable(address(attacker)));
        assertTrue(attacker.reentered());
        assertFalse(attacker.reentrySucceeded());
        assertEq(attacker.received(), owed);
        assertEq(address(arena).balance, PRIZE);
    }

    // ------------------------------------------------------- 128-entry bound

    /// @dev Worst case for the finalize loop: 128 pushed entries (64 removed) and a 64-way tie.
    function test_gas_finalize128EntriesTie() public {
        uint256 cid = _createContest(Presence.Anywhere);
        _addEntries(cid, 64);
        vm.startPrank(organiser);
        for (uint32 i = 1; i <= 64; ++i) {
            arena.removeEntry(cid, i);
        }
        for (uint256 i = 65; i <= 128; ++i) {
            arena.submitEntry(cid, _payee(i), "ipfs://entry", new address[](0));
        }
        vm.stopPrank();
        _warpToVoting(cid);
        for (uint32 i = 65; i <= 128; ++i) {
            _vote(cid, address(uint160(0x4000000 + i)), i);
        }
        _warpToEnd(cid);

        uint256 g = gasleft();
        arena.finalize(cid);
        g -= gasleft();
        console.log("finalize, 128 entries, 64-way tie, gas:", g);
        assertLt(g, 3_000_000);

        uint256 share = PRIZE / 64;
        for (uint256 i = 1; i <= 64; ++i) {
            assertEq(arena.claimable(_payee(i)), 0);
        }
        for (uint256 i = 65; i <= 128; ++i) {
            assertEq(arena.claimable(_payee(i)), share);
        }
        assertEq(arena.claimable(organiser), PRIZE - share * 64);
    }

    /// @dev Typical case at the bound: 128 pushed entries, one winner (the last one).
    function test_gas_finalize128EntriesSingleWinner() public {
        uint256 cid = _createContest(Presence.Anywhere);
        _addEntries(cid, 64);
        vm.startPrank(organiser);
        for (uint32 i = 1; i <= 64; ++i) {
            arena.removeEntry(cid, i);
        }
        for (uint256 i = 65; i <= 128; ++i) {
            arena.submitEntry(cid, _payee(i), "ipfs://entry", new address[](0));
        }
        vm.stopPrank();
        _warpToVoting(cid);
        _votes(cid, 128, 2, 5);
        _votes(cid, 100, 1, 6);
        _warpToEnd(cid);

        uint256 g = gasleft();
        arena.finalize(cid);
        g -= gasleft();
        console.log("finalize, 128 entries, single winner, gas:", g);
        assertLt(g, 1_000_000);
        assertEq(arena.claimable(_payee(128)), PRIZE);
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_tieSplitConservesPrize(uint96 prize, uint8 winners) public {
        uint256 w = bound(winners, 1, 64);
        vm.deal(organiser, uint256(prize) + 1 ether);
        uint256 cid = _create(_params(Presence.Anywhere), prize);
        _addEntries(cid, w);
        _warpToVoting(cid);
        for (uint256 i; i < w; ++i) {
            _vote(cid, address(uint160(0x3000000 + i)), uint32(i + 1));
        }
        _warpToEnd(cid);
        arena.finalize(cid);

        uint256 share = uint256(prize) / w;
        uint256 total = arena.claimable(organiser);
        for (uint256 i; i < w; ++i) {
            assertEq(arena.claimable(_payee(i + 1)), share);
            total += share;
        }
        assertEq(total, prize);
        assertEq(arena.claimable(organiser), uint256(prize) % w);
    }
}
