// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {Seed} from "../script/Seed.s.sol";
import {SeedVotes} from "../script/SeedVotes.s.sol";

/// @notice Demo data stays testnet-only, whatever happens to Deploy's allow-list.
/// @dev Only the guard paths run here: a successful run would read the real deployments/ files.
contract SeedTest is Test {
    Seed internal seed;
    SeedVotes internal seedVotes;

    function setUp() public {
        seed = new Seed();
        seedVotes = new SeedVotes();
    }

    function test_seed_guardAllowsOnlySepoliaAndAnvil() public view {
        assertTrue(seed.isSeedChain(11155111));
        assertTrue(seed.isSeedChain(31337));
        assertFalse(seed.isSeedChain(1));
        assertFalse(seed.isSeedChain(8453));
        assertFalse(seed.isSeedChain(0));
    }

    function testFuzz_seed_guardRejectsEveryOtherChain(uint256 chainId) public view {
        vm.assume(chainId != 11155111 && chainId != 31337);
        assertFalse(seed.isSeedChain(chainId));
    }

    function test_seed_revertsOnMainnet() public {
        vm.chainId(1);
        vm.expectRevert(bytes("testnet only"));
        seed.run();
    }

    /// @dev Simulates mainnet being added to Deploy's list: every Deploy instance Seed could create
    ///      or consult answers "allowed" for chain 1. Seed must still refuse.
    function test_seed_revertsOnMainnetEvenIfDeployListExtended() public {
        for (uint64 nonce = 1; nonce <= 4; ++nonce) {
            address d = vm.computeCreateAddress(address(seed), nonce);
            vm.mockCall(d, abi.encodeCall(Deploy.isAllowedChain, (1)), abi.encode(true));
        }
        Deploy extended = new Deploy();
        vm.mockCall(address(extended), abi.encodeCall(Deploy.isAllowedChain, (1)), abi.encode(true));
        assertTrue(extended.isAllowedChain(1));

        assertFalse(seed.isSeedChain(1));
        vm.chainId(1);
        vm.expectRevert(bytes("testnet only"));
        seed.run();
    }

    function test_seedVotes_revertsOffLocalAnvil() public {
        vm.chainId(1);
        vm.expectRevert(bytes("local anvil only"));
        seedVotes.run();

        vm.chainId(11155111);
        vm.expectRevert(bytes("local anvil only"));
        seedVotes.run();
    }
}
