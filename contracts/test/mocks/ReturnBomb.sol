// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// @notice Receiver that reverts with a large payload so a caller copying return data pays for it.
contract ReturnBomb {
    receive() external payable {
        assembly {
            revert(0, 50000)
        }
    }
}
