// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {Arena} from "../src/Arena.sol";

contract DeployTest is Test {
    Deploy internal script;
    string internal outFile;

    function setUp() public {
        script = new Deploy();
        // never overwrite a real local deployment file from a test run
        outFile = string.concat(vm.projectRoot(), "/deployments/test-deploy.json");
        vm.setEnv("ARENA_DEPLOYMENT_FILE", outFile);
    }

    function test_deploy_revertsOnMainnet() public {
        vm.chainId(1);
        vm.expectRevert(bytes("testnet only"));
        script.run();
    }

    function test_deploy_revertsOnUnlistedChain() public {
        vm.chainId(8453);
        vm.expectRevert(bytes("testnet only"));
        script.run();
    }

    function test_deploy_worksOnAnvil() public {
        vm.chainId(31337);
        vm.roll(42);
        Arena arena = script.run();
        assertGt(address(arena).code.length, 0);
        assertEq(arena.contestCount(), 0);

        string memory json = vm.readFile(outFile);
        assertEq(vm.parseJsonAddress(json, ".address"), address(arena));
        assertEq(vm.parseJsonUint(json, ".block"), 42);
        vm.removeFile(outFile);
    }

    function test_deploy_allowedChains() public view {
        assertTrue(script.isAllowedChain(11155111));
        assertTrue(script.isAllowedChain(31337));
        assertFalse(script.isAllowedChain(1));
    }
}
