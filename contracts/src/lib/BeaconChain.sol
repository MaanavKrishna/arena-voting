// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// @notice Result of checking a beacon token against a contest's hash chain.
enum BeaconStatus {
    Ok,
    NotSet,
    SlotOutOfRange,
    Expired,
    GapTooLarge,
    Invalid
}

/// @title BeaconChain
/// @notice Verifies room-beacon tokens from a one-way hash chain (TESLA style).
/// @dev Chain: c[0] = bytes16(keccak256(seed)), c[k+1] = next(c[k]), anchor = c[length].
///      The token for slot s is c[length - 1 - s]; newer slots have lower chain indices.
///      The state caches the newest verified link so each check hashes only a few steps.
library BeaconChain {
    uint64 internal constant SLOT_SECONDS = 10;
    uint64 internal constant MAX_TOKEN_AGE = 120;
    uint64 internal constant MAX_FUTURE_SKEW = 30;
    uint32 internal constant MAX_HASH_STEPS = 4096;
    uint32 internal constant MAX_CHAIN_LENGTH = 100_000;

    struct State {
        bytes16 anchor;
        uint64 start;
        uint32 length;
        uint32 rotation;
        uint32 cachedIndex;
        bytes16 cachedLink;
    }

    /// @notice One step along the chain: the high 16 bytes of keccak256 over exactly 16 bytes.
    function next(bytes16 link) internal pure returns (bytes16) {
        return bytes16(keccak256(abi.encodePacked(link)));
    }

    /// @dev Applies `next` `steps` times.
    function _forward(bytes16 link, uint256 steps) private pure returns (bytes16 out) {
        assembly ("memory-safe") {
            let mask := not(0xffffffffffffffffffffffffffffffff)
            let v := and(link, mask)
            for { let i := 0 } lt(i, steps) { i := add(i, 1) } {
                mstore(0x00, v)
                v := and(keccak256(0x00, 0x10), mask)
            }
            out := v
        }
    }

    /// @notice Checks `token` for `slot`. Never reverts; callers map the status to an error.
    /// @param requireFresh when true, the token must be inside its time window around `nowTs`.
    /// @return status the result
    /// @return idx the token's chain index (`length - 1 - slot`), meaningful when status is Ok
    function check(State storage s, uint32 slot, bytes16 token, uint64 nowTs, bool requireFresh)
        internal
        view
        returns (BeaconStatus status, uint32 idx)
    {
        if (s.anchor == bytes16(0)) return (BeaconStatus.NotSet, 0);
        uint32 length = s.length;
        if (slot >= length) return (BeaconStatus.SlotOutOfRange, 0);

        if (requireFresh) {
            uint256 slotStart = uint256(s.start) + uint256(slot) * SLOT_SECONDS;
            uint256 slotEnd = slotStart + SLOT_SECONDS;
            if (slotStart > uint256(nowTs) + MAX_FUTURE_SKEW || uint256(nowTs) > slotEnd + MAX_TOKEN_AGE) {
                return (BeaconStatus.Expired, 0);
            }
        }

        idx = length - 1 - slot;
        uint32 cachedIndex = s.cachedIndex;
        if (idx < cachedIndex) {
            // newer than the cache: hash the token forward to the cached link
            uint256 steps = cachedIndex - idx;
            if (steps > MAX_HASH_STEPS) return (BeaconStatus.GapTooLarge, idx);
            if (_forward(token, steps) != s.cachedLink) return (BeaconStatus.Invalid, idx);
        } else {
            // same age or older: hash the cached link forward to the token
            uint256 steps = idx - cachedIndex;
            if (steps > MAX_HASH_STEPS) return (BeaconStatus.GapTooLarge, idx);
            if (_forward(s.cachedLink, steps) != token) return (BeaconStatus.Invalid, idx);
        }
        return (BeaconStatus.Ok, idx);
    }

    /// @notice Moves the cache to a verified link, only if it is newer than the cached one.
    function commit(State storage s, uint32 idx, bytes16 token) internal {
        if (idx < s.cachedIndex) {
            s.cachedIndex = idx;
            s.cachedLink = token;
        }
    }
}
