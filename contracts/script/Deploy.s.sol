// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Script} from "forge-std/Script.sol";
import {Arena} from "../src/Arena.sol";

/// @notice Deploys Arena and records `{ address, block }` in deployments/<chainId>.json.
/// @dev Testnet guard: only chains in ALLOWED_CHAINS may be deployed to in this phase.
///      Set ARENA_DEPLOYMENT_FILE to write somewhere else (used by tests).
contract Deploy is Script {
    /// @dev Sepolia and local Anvil. Adding a chain is an owner decision (see docs/decisions.md D-21).
    function ALLOWED_CHAINS() public pure returns (uint256[2] memory) {
        return [uint256(11155111), uint256(31337)];
    }

    function isAllowedChain(uint256 chainId) public pure returns (bool) {
        uint256[2] memory allowed = ALLOWED_CHAINS();
        for (uint256 i; i < allowed.length; ++i) {
            if (allowed[i] == chainId) return true;
        }
        return false;
    }

    function run() external returns (Arena arena) {
        require(isAllowedChain(block.chainid), "testnet only");

        vm.startBroadcast();
        arena = new Arena();
        vm.stopBroadcast();

        string memory defaultPath =
            string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        string memory path = vm.envOr("ARENA_DEPLOYMENT_FILE", defaultPath);
        string memory obj = "deployment";
        vm.serializeAddress(obj, "address", address(arena));
        string memory json = vm.serializeUint(obj, "block", block.number);
        vm.writeJson(json, path);
    }
}
