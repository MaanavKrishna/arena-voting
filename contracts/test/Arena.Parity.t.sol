// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test} from "forge-std/Test.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Arena} from "../src/Arena.sol";
import {BeaconChain} from "../src/lib/BeaconChain.sol";

/// @notice Re-derives every value in fixtures/parity.json independently of the TypeScript libs.
contract ArenaParityTest is Test {
    string internal json;
    Arena internal arena;

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/parity.json"));
        arena = new Arena();
    }

    // ------------------------------------------------------------ hash chain

    function _chain(bytes32 seed, uint256 length) internal pure returns (bytes16[] memory c) {
        c = new bytes16[](length + 1);
        c[0] = bytes16(keccak256(abi.encodePacked(seed)));
        for (uint256 i; i < length; ++i) {
            c[i + 1] = BeaconChain.next(c[i]);
        }
    }

    function _token(uint256 slot) internal view returns (bytes16) {
        bytes memory b = vm.parseJsonBytes(json, string.concat(".chain.tokensBySlot.", vm.toString(slot)));
        require(b.length == 16, "token length");
        return bytes16(b);
    }

    function test_parity_chainAnchorAndTokens() public view {
        bytes32 seed = vm.parseJsonBytes32(json, ".seed");
        uint256 length = vm.parseJsonUint(json, ".chain.length");
        bytes16 anchor = bytes16(vm.parseJsonBytes(json, ".chain.anchor"));
        bytes16[] memory c = _chain(seed, length);

        assertEq(c[0], bytes16(keccak256(abi.encodePacked(seed))), "c[0]");
        assertEq(c[length], anchor, "anchor");

        uint256[3] memory slots = [uint256(0), 7, 19];
        for (uint256 i; i < slots.length; ++i) {
            uint256 s = slots[i];
            bytes16 tok = _token(s);
            // token for slot s is c[length - 1 - s]
            assertEq(c[length - 1 - s], tok, "token by index");
            // and it must hash forward to the anchor in exactly s + 1 steps
            bytes16 h = tok;
            for (uint256 k; k < s + 1; ++k) {
                h = arena.computeNextLink(h);
            }
            assertEq(h, anchor, "token hashes to anchor");
        }
    }

    // ------------------------------------------------------------ tickets

    function _leaf(address a) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(a))));
    }

    function test_parity_ticketProofsVerify() public view {
        bytes32 root = vm.parseJsonBytes32(json, ".tickets.root");
        address[] memory addrs = vm.parseJsonAddressArray(json, ".tickets.addresses");
        assertGt(addrs.length, 0);
        for (uint256 i; i < addrs.length; ++i) {
            bytes32[] memory proof =
                vm.parseJsonBytes32Array(json, string.concat(".tickets.proofs.", vm.toString(addrs[i])));
            assertTrue(MerkleProof.verify(proof, root, _leaf(addrs[i])), "proof verifies");
        }
        // an address outside the list must not verify with someone else's proof
        bytes32[] memory p0 =
            vm.parseJsonBytes32Array(json, string.concat(".tickets.proofs.", vm.toString(addrs[0])));
        assertFalse(MerkleProof.verify(p0, root, _leaf(address(0xBEEF))), "outsider rejected");
    }

    // ------------------------------------------------------------ pass

    function test_parity_checkInTypedDataHash() public view {
        uint256 chainId = vm.parseJsonUint(json, ".pass.chainId");
        address verifying = vm.parseJsonAddress(json, ".pass.arena");
        assertEq(chainId, 31337);
        assertEq(verifying, 0x5FbDB2315678afecb367f032d93F642f64180aa3);

        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("Arena"),
                keccak256("1"),
                chainId,
                verifying
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "CheckInRequest(uint256 contestId,address voter,address sessionKey,uint64 issuedAt)"
                ),
                vm.parseJsonUint(json, ".pass.contestId"),
                vm.parseJsonAddress(json, ".pass.voter"),
                vm.parseJsonAddress(json, ".pass.sessionKey"),
                uint64(vm.parseJsonUint(json, ".pass.issuedAt"))
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        assertEq(digest, vm.parseJsonBytes32(json, ".pass.typedDataHash"), "typedDataHash");
    }

    function test_parity_tickDigest() public view {
        bytes32 d = keccak256(
            abi.encode(
                "arena-tick-v1",
                vm.parseJsonUint(json, ".pass.chainId"),
                vm.parseJsonAddress(json, ".pass.arena"),
                vm.parseJsonUint(json, ".pass.contestId"),
                vm.parseJsonAddress(json, ".pass.voter"),
                uint64(vm.parseJsonUint(json, ".pass.tick"))
            )
        );
        assertEq(d, vm.parseJsonBytes32(json, ".pass.tickDigest"), "tickDigest");
    }
}
