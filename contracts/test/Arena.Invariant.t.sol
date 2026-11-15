// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test, console} from "forge-std/Test.sol";
import {Arena, ContestView, EntryView} from "../src/Arena.sol";
import {ArenaHandler} from "./handlers/ArenaHandler.sol";

contract ArenaInvariantTest is Test {
    Arena internal arena;
    ArenaHandler internal handler;

    function setUp() public {
        vm.warp(1_700_000_000);
        arena = new Arena();
        handler = new ArenaHandler(arena);

        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = ArenaHandler.create.selector;
        selectors[1] = ArenaHandler.submit.selector;
        selectors[2] = ArenaHandler.vote.selector;
        selectors[3] = ArenaHandler.checkIn.selector;
        selectors[4] = ArenaHandler.finalize.selector;
        selectors[5] = ArenaHandler.withdraw.selector;
        selectors[6] = ArenaHandler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// 1. For every contest, the sum of entry votes equals totalVotes.
    function invariant_votesSumToTotal() public view {
        uint256[] memory ids = handler.contests();
        for (uint256 i; i < ids.length; ++i) {
            EntryView[] memory es = arena.getEntries(ids[i]);
            uint256 sum;
            for (uint256 j; j < es.length; ++j) {
                sum += es[j].votes;
            }
            assertEq(sum, arena.getContest(ids[i]).totalVotes);
        }
    }

    /// 2. For every contest and voter, at most one vote; votedEntry agrees with the tally.
    function invariant_oneVotePerVoter() public view {
        uint256[] memory ids = handler.contests();
        address[] memory actors = handler.actors();
        for (uint256 i; i < ids.length; ++i) {
            uint256 voters;
            for (uint256 k; k < actors.length; ++k) {
                uint256 n = handler.ghostVotes(ids[i], actors[k]);
                assertLe(n, 1);
                if (arena.votedEntry(ids[i], actors[k]) != 0) voters++;
                assertEq(n, arena.votedEntry(ids[i], actors[k]) != 0 ? 1 : 0);
            }
            assertEq(voters, arena.getContest(ids[i]).totalVotes);
        }
    }

    /// 3. The contract holds at least every unfinalized prize plus every claimable balance.
    function invariant_solvent() public view {
        uint256[] memory ids = handler.contests();
        uint256 locked;
        for (uint256 i; i < ids.length; ++i) {
            ContestView memory c = arena.getContest(ids[i]);
            if (!c.finalized) locked += c.prize;
        }
        assertGe(address(arena).balance, locked + handler.sumClaimable());
    }

    /// 4. A finalized contest allocated exactly its prize.
    function invariant_finalizeAllocatesExactPrize() public view {
        uint256[] memory ids = handler.contests();
        for (uint256 i; i < ids.length; ++i) {
            ContestView memory c = arena.getContest(ids[i]);
            if (c.finalized) assertEq(handler.ghostAllocated(ids[i]), c.prize);
        }
    }

    /// 5. checkedInCount equals the number of voters with checkedIn == true.
    function invariant_checkedInCountMatches() public view {
        uint256[] memory ids = handler.contests();
        address[] memory actors = handler.actors();
        for (uint256 i; i < ids.length; ++i) {
            uint256 n;
            for (uint256 k; k < actors.length; ++k) {
                if (arena.checkedIn(ids[i], actors[k])) n++;
            }
            assertEq(n, arena.getContest(ids[i]).checkedInCount);
        }
    }

    /// @dev Logs how much real work the handler did (visible with -vv).
    function afterInvariant() public view {
        console.log("contests", handler.contests().length);
        console.log("votes", handler.ghostVoteCalls());
        console.log("checkIns", handler.ghostCheckInCalls());
        console.log("finalized", handler.ghostFinalizeCalls());
        console.log("withdrawals", handler.ghostWithdrawCalls());
    }
}
