// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// @notice Receiver that burns every unit of gas it is given.
contract GasGriefer {
    uint256 public sink;

    receive() external payable {
        while (true) {
            sink++;
        }
    }
}
