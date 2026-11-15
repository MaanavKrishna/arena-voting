// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Script} from "forge-std/Script.sol";
import {Arena, CreateParams, Presence} from "../src/Arena.sol";

/// @notice Creates three demo contests (Anywhere, Room, Gated) on the deployed Arena.
/// @dev Reads the Arena address from deployments/<chainId>.json. Local Anvil runs broadcast from the
///      unlocked default account (`--unlocked --sender`). Voting opens 60 s after the run, so
///      `SeedVotes.s.sol` has to wait for that (see deploy-local.sh).
contract Seed is Script {
    // Anvil default accounts 2 and 4..9 (public test keys, never used outside local chains)
    address internal constant GATEKEEPER = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    address internal constant PAYEE_4 = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;
    address internal constant PAYEE_5 = 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc;
    address internal constant PAYEE_6 = 0x976EA74026E726554dB657fA54763abd0C3a0aa9;
    address internal constant PAYEE_7 = 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955;
    address internal constant PAYEE_8 = 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f;
    address internal constant PAYEE_9 = 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720;

    /// @notice Chains demo data may be seeded on: Sepolia and local Anvil, hard-coded on purpose.
    /// @dev Independent of Deploy.ALLOWED_CHAINS, so adding a chain to deploys never enables seeding it.
    function isSeedChain(uint256 chainId) public pure returns (bool) {
        return chainId == 11155111 || chainId == 31337;
    }

    function run() external {
        require(isSeedChain(block.chainid), "testnet only");

        string memory path =
            string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        Arena arena = Arena(vm.parseJsonAddress(vm.readFile(path), ".address"));

        uint64 votingStart = uint64(block.timestamp + 60);
        uint64 votingEnd = votingStart + 1 days;

        vm.startBroadcast();

        // 1. Anywhere: anyone with a wallet can vote
        uint256 anywhere = arena.createContest{value: 0.05 ether}(
            _params(
                "Campus Hack Night demo",
                "ipfs://bafyseedcontest1meta",
                votingStart,
                votingEnd,
                Presence.Anywhere,
                0
            )
        );
        _entry(arena, anywhere, PAYEE_4, "ipfs://bafyseedentry1a");
        _entry(arena, anywhere, PAYEE_5, "ipfs://bafyseedentry1b");
        _entry(arena, anywhere, PAYEE_6, "ipfs://bafyseedentry1c");

        // 2. Room: voters must hear the sound beacon
        uint256 room = arena.createContest{value: 0.03 ether}(
            _params(
                "Lecture Hall showdown",
                "ipfs://bafyseedcontest2meta",
                votingStart,
                votingEnd,
                Presence.Room,
                0
            )
        );
        _entry(arena, room, PAYEE_7, "ipfs://bafyseedentry2a");
        _entry(arena, room, PAYEE_8, "ipfs://bafyseedentry2b");
        _entry(arena, room, PAYEE_9, "ipfs://bafyseedentry2c");
        _entry(arena, room, PAYEE_4, "ipfs://bafyseedentry2d");

        // 3. Gated: door check-in plus beacon, with a small gas drip
        uint256 gated = arena.createContest{value: 0.02 ether}(
            _params(
                "Demo Day finals",
                "ipfs://bafyseedcontest3meta",
                votingStart,
                votingEnd,
                Presence.Gated,
                0.003 ether
            )
        );
        arena.setGatekeeper(gated, GATEKEEPER, true);
        _entry(arena, gated, PAYEE_5, "ipfs://bafyseedentry3a");
        _entry(arena, gated, PAYEE_6, "ipfs://bafyseedentry3b");
        _entry(arena, gated, PAYEE_7, "ipfs://bafyseedentry3c");

        vm.stopBroadcast();
    }

    function _params(
        string memory title,
        string memory uri,
        uint64 votingStart,
        uint64 votingEnd,
        Presence presence,
        uint96 drip
    ) internal view returns (CreateParams memory p) {
        p = CreateParams({
            title: title,
            metadataURI: uri,
            submissionEnd: votingStart,
            votingStart: votingStart,
            votingEnd: votingEnd,
            presence: presence,
            openSubmissions: false,
            ticketRoot: bytes32(0),
            ticketListURI: "",
            dripPerCheckIn: drip
        });
        // block.timestamp must precede submissionEnd (guaranteed: votingStart = now + 60)
        require(block.timestamp < p.submissionEnd, "timeline");
    }

    function _entry(Arena arena, uint256 contestId, address payee, string memory uri) internal {
        arena.submitEntry(contestId, payee, uri, new address[](0));
    }
}
