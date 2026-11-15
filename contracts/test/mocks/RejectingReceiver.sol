// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Arena} from "../../src/Arena.sol";

/// @notice Contract that refuses every ETH transfer, but can still route its claim elsewhere.
contract RejectingReceiver {
    function claim(Arena arena) external {
        arena.withdraw();
    }

    function claimTo(Arena arena, address payable to) external {
        arena.withdrawTo(to);
    }

    receive() external payable {
        revert("no thanks");
    }
}
