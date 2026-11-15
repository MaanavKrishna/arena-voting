// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Arena} from "../../src/Arena.sol";

/// @notice Payee that tries to re-enter `withdraw` (or `withdrawTo`) when it receives ETH.
contract ReentrantPayee {
    Arena public immutable arena;
    bool public bubble;
    bool public viaWithdrawTo;
    bool public reentered;
    bool public reentrySucceeded;
    uint256 public received;

    constructor(Arena arena_) {
        arena = arena_;
    }

    function setBubble(bool b) external {
        bubble = b;
    }

    function setViaWithdrawTo(bool b) external {
        viaWithdrawTo = b;
    }

    function claim() external {
        arena.withdraw();
    }

    function claimTo(address payable to) external {
        arena.withdrawTo(to);
    }

    function _reenter() internal {
        if (viaWithdrawTo) arena.withdrawTo(payable(address(this)));
        else arena.withdraw();
    }

    receive() external payable {
        received += msg.value;
        if (reentered) return;
        reentered = true;
        if (bubble) {
            _reenter();
        } else {
            try this.reenterExternal() {
                reentrySucceeded = true;
            } catch {}
        }
    }

    function reenterExternal() external {
        require(msg.sender == address(this), "self only");
        _reenter();
    }
}
