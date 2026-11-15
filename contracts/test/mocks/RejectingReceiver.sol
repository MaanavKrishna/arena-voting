// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Arena} from "../../src/Arena.sol";

/// @notice Contract that refuses every ETH transfer.
contract RejectingReceiver {
    function claim(Arena arena) external {
        arena.withdraw();
    }

    receive() external payable {
        revert("no thanks");
    }
}
