#!/usr/bin/env bash
# Deploys Arena to a local Anvil chain, seeds three demo contests, waits for voting to open
# (time travel), then casts a few demo votes. Run `pnpm chain` first.
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="$HOME/.foundry/bin:$PATH"

RPC="http://127.0.0.1:8545"
SENDER="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" # Anvil account 0, unlocked: no key needed

if ! cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "No chain at $RPC. Start one with: pnpm chain" >&2
  exit 1
fi

mkdir -p deployments

forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --unlocked --sender "$SENDER"
forge script script/Seed.s.sol --rpc-url "$RPC" --broadcast --unlocked --sender "$SENDER"

# Seeded contests open voting 60 s after creation; a single script can't wait, so jump the clock.
cast rpc --rpc-url "$RPC" evm_increaseTime 70 >/dev/null
cast rpc --rpc-url "$RPC" evm_mine >/dev/null

forge script script/SeedVotes.s.sol --rpc-url "$RPC" --broadcast

echo "Arena deployed: $(cast call --rpc-url "$RPC" "$(jq -r .address deployments/31337.json)" 'contestCount()(uint256)') contests seeded"
