#!/usr/bin/env bash
# Installs pinned Solidity dependencies into contracts/lib (not committed).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf lib/forge-std lib/openzeppelin-contracts
forge install foundry-rs/forge-std@v1.17.0 --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.7.0 --no-git
