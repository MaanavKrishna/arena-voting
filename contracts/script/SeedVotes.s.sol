// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Script} from "forge-std/Script.sol";
import {Arena, BeaconToken} from "../src/Arena.sol";
import {Deploy} from "./Deploy.s.sol";

/// @notice Casts a few demo votes in the Anywhere contest (id 1) from Anvil accounts 1 and 3.
/// @dev Run after voting has opened (deploy-local.sh time-travels first). The keys below are the
///      public Anvil defaults and hold no value outside a local chain; the chain guard rejects
///      everything but local Anvil.
contract SeedVotes is Script {
    uint256 internal constant ANVIL_KEY_1 =
        0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 internal constant ANVIL_KEY_3 =
        0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;

    function run() external {
        require(block.chainid == 31337, "local anvil only");

        string memory path =
            string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        Arena arena = Arena(vm.parseJsonAddress(vm.readFile(path), ".address"));

        BeaconToken memory none = BeaconToken({slot: 0, token: bytes16(0)});
        bytes32[] memory noProof = new bytes32[](0);

        vm.startBroadcast(ANVIL_KEY_1);
        arena.vote(1, 1, none, noProof);
        vm.stopBroadcast();

        vm.startBroadcast(ANVIL_KEY_3);
        arena.vote(1, 2, none, noProof);
        vm.stopBroadcast();
    }
}
