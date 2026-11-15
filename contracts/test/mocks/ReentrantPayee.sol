// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Arena} from "../../src/Arena.sol";

/// @notice Payee that tries to re-enter `withdraw` when it receives ETH.
contract ReentrantPayee {
    Arena public immutable arena;
    bool public bubble;
    bool public reentered;
    bool public reentrySucceeded;
    uint256 public received;

    constructor(Arena arena_) {
        arena = arena_;
    }

    function setBubble(bool b) external {
        bubble = b;
    }

    function claim() external {
        arena.withdraw();
    }

    receive() external payable {
        received += msg.value;
        if (reentered) return;
        reentered = true;
        if (bubble) {
            arena.withdraw();
        } else {
            try arena.withdraw() {
                reentrySucceeded = true;
            } catch {}
        }
    }
}
