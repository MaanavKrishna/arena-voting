// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test} from "forge-std/Test.sol";
import {Arena, Presence, CreateParams, BeaconToken, ContestView, EntryView} from "../src/Arena.sol";
import {BeaconStatus} from "../src/lib/BeaconChain.sol";

/// @notice Shared fixtures and helpers for the Arena test suite.
abstract contract ArenaBase is Test {
    Arena internal arena;

    uint64 internal constant T0 = 1_700_000_000;
    uint64 internal constant SUBMISSION_LEN = 1 hours;
    uint64 internal constant LEAD_TO_VOTING = 2 hours;
    uint64 internal constant VOTING_LEN = 1 days;
    uint256 internal constant PRIZE = 1 ether;
    uint96 internal constant DRIP = 0.001 ether;

    bytes32 internal constant SEED = keccak256("arena-test-seed");
    bytes32 internal constant SEED_2 = keccak256("arena-test-seed-rotated");

    address internal organiser = makeAddr("organiser");
    address internal stranger = makeAddr("stranger");
    address internal gatekeeper = makeAddr("gatekeeper");
    address internal voter1 = makeAddr("voter1");
    address internal voter2 = makeAddr("voter2");
    address internal voter3 = makeAddr("voter3");

    // ticket list fixture (OZ StandardMerkleTree over 4 Anvil accounts)
    address[] internal ticketAddrs;
    bytes32 internal ticketRoot;
    bytes32[][] internal ticketProofs;
    string internal constant TICKET_URI = "ipfs://tickets";

    // beacon defaults used by _setBeacon(contestId)
    uint32 internal beaconLength;
    uint64 internal beaconStart;

    function setUp() public virtual {
        vm.warp(T0);
        arena = new Arena();
        vm.deal(organiser, 1000 ether);
        vm.deal(gatekeeper, 100 ether);
        _loadTickets();
    }

    // ----------------------------------------------------------------- tickets

    function _loadTickets() internal {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/tickets.json"));
        address[] memory addrs = vm.parseJsonAddressArray(json, ".addresses");
        ticketRoot = vm.parseJsonBytes32(json, ".root");
        for (uint256 i; i < addrs.length; ++i) {
            ticketAddrs.push(addrs[i]);
            ticketProofs.push(
                vm.parseJsonBytes32Array(json, string.concat(".proofList[", vm.toString(i), "]"))
            );
        }
    }

    function _noProof() internal pure returns (bytes32[] memory p) {
        p = new bytes32[](0);
    }

    // ---------------------------------------------------------------- contests

    function _params(Presence presence) internal view returns (CreateParams memory p) {
        uint64 nowTs = uint64(block.timestamp);
        p.title = "Demo Day";
        p.metadataURI = "ipfs://contest";
        p.submissionEnd = nowTs + SUBMISSION_LEN;
        p.votingStart = nowTs + LEAD_TO_VOTING;
        p.votingEnd = nowTs + LEAD_TO_VOTING + VOTING_LEN;
        p.presence = presence;
        p.openSubmissions = true;
        p.dripPerCheckIn = presence == Presence.Gated ? DRIP : 0;
    }

    function _create(CreateParams memory p, uint256 prize) internal returns (uint256 id) {
        vm.prank(organiser);
        id = arena.createContest{value: prize}(p);
    }

    function _createContest(Presence presence) internal returns (uint256) {
        return _create(_params(presence), PRIZE);
    }

    function _createCurated(Presence presence) internal returns (uint256) {
        CreateParams memory p = _params(presence);
        p.openSubmissions = false;
        return _create(p, PRIZE);
    }

    function _payee(uint256 i) internal pure returns (address) {
        return address(uint160(0xBEEF0000 + i));
    }

    function _submit(uint256 id, address who, address payee) internal returns (uint32) {
        vm.prank(who);
        return arena.submitEntry(id, payee, "ipfs://entry", new address[](0));
    }

    function _addEntries(uint256 id, uint256 n) internal returns (uint32[] memory ids) {
        ids = new uint32[](n);
        for (uint256 i; i < n; ++i) {
            ids[i] = _submit(id, organiser, _payee(i + 1));
        }
    }

    function _warpToVoting(uint256 id) internal {
        vm.warp(arena.getContest(id).votingStart);
    }

    function _warpToEnd(uint256 id) internal {
        vm.warp(arena.getContest(id).votingEnd);
    }

    function _vote(uint256 id, address voter, uint32 entryId) internal {
        vm.prank(voter);
        arena.vote(id, entryId, BeaconToken(0, bytes16(0)), _noProof());
    }

    // ------------------------------------------------------------------ beacon

    /// @dev c[k] for the chain built from `seed` (independent of BeaconChain.sol).
    function _linkFrom(bytes32 seed, uint256 k) internal pure returns (bytes16 r) {
        r = bytes16(keccak256(abi.encodePacked(seed)));
        for (uint256 i; i < k; ++i) {
            r = bytes16(keccak256(abi.encodePacked(r)));
        }
    }

    function _anchor(bytes32 seed, uint32 length) internal pure returns (bytes16) {
        return _linkFrom(seed, length);
    }

    /// @dev Token for `slot` on the default seed and the current default length.
    function _beaconToken(uint32 slot) internal view returns (BeaconToken memory) {
        return BeaconToken(slot, _linkFrom(SEED, uint256(beaconLength) - 1 - slot));
    }

    function _tokenFrom(bytes32 seed, uint32 length, uint32 slot) internal pure returns (BeaconToken memory) {
        return BeaconToken(slot, _linkFrom(seed, uint256(length) - 1 - slot));
    }

    /// @dev Sizes the chain like the Stage does and calls setBeacon as organiser.
    function _setBeacon(uint256 id) internal {
        ContestView memory c = arena.getContest(id);
        uint64 base = c.votingStart > block.timestamp ? c.votingStart : uint64(block.timestamp);
        uint64 start = ((base - 60) / 10) * 10;
        uint32 length = uint32((c.votingEnd - start + 9) / 10 + 6);
        _setBeacon(id, start, length);
    }

    function _setBeacon(uint256 id, uint64 start, uint32 length) internal {
        beaconStart = start;
        beaconLength = length;
        bytes16 anchor = _anchor(SEED, length);
        vm.prank(organiser);
        arena.setBeacon(id, anchor, start, length);
    }

    function _slotNow() internal view returns (uint32) {
        return uint32((block.timestamp - beaconStart) / 10);
    }

    function _voteWithBeacon(uint256 id, address voter, uint32 entryId, BeaconToken memory t) internal {
        vm.prank(voter);
        arena.vote(id, entryId, t, _noProof());
    }

    // -------------------------------------------------------------------- gate

    function _authoriseGate(uint256 id) internal {
        vm.prank(organiser);
        arena.setGatekeeper(id, gatekeeper, true);
    }

    function _checkIn(uint256 id, address voter) internal {
        vm.prank(gatekeeper);
        arena.checkIn(id, voter, _noProof());
    }
}
