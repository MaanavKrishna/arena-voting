"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfig, useConnection } from "wagmi";
import { signMessage } from "wagmi/actions";
import type { Address, Hex } from "viem";
import { anchorOf } from "@/lib/beacon/chain";
import { deriveSeed, seedMessage } from "@/lib/beacon/seed";
import {
  backupFileName,
  beaconFromContest,
  parseBackup,
  planChain,
  readStoredSeed,
  rebuildVerdict,
  seedStorageKey,
  serializeBackup,
  setupDecision,
  type OnChainBeacon,
} from "@/lib/beacon/stage";
import { explainError } from "@/lib/errors";
import type { ContestView } from "@/hooks/types";
import { buildChainOffThread } from "./chainBuilder";

export type Purpose = "setup" | "recover" | "rotate";

/** A chain the organiser signed for but that isn't on-chain yet (first set-up or rotation). */
export type PendingBeacon = {
  purpose: "setup" | "rotate";
  seed: Hex;
  chain: Hex[];
  anchor: Hex;
  start: bigint;
  length: number;
  rotation: number;
  /** The wallet gave the same signature twice (regular wallet): the seed can be re-derived later. */
  deterministic: boolean;
  backedUp: boolean;
};

/** The chain the Stage is broadcasting from; it matches the on-chain anchor. */
export type ActiveBeacon = { seed: Hex; chain: Hex[]; anchor: Hex; start: bigint; length: number; rotation: number };

export type Flow =
  | { kind: "loading" }
  | { kind: "not-required" }
  | { kind: "ended" }
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "sign"; purpose: Purpose; rotation: number }
  | { kind: "signing"; purpose: Purpose; rotation: number; step: 1 | 2 }
  | { kind: "building"; purpose: Purpose }
  | { kind: "backup-required"; pending: PendingBeacon }
  | { kind: "publish"; pending: PendingBeacon }
  | { kind: "mismatch"; rotation: number; reason: "wrong-wallet" | "smart-wallet" | "backup" }
  | { kind: "error"; purpose: Purpose; rotation: number; message: string };

type Ids = { chainId: number; arena: Address | undefined; contestId: bigint | undefined };

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function sameHex(a: Hex, b: Hex): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * The Stage's set-up / recovery state machine (docs/ground-presence.md table). It never calls
 * setBeacon itself: a first set-up or rotation ends in `flow.kind === "publish"` and the page shows
 * a TxButton; a rebuilt anchor that doesn't match ends in `mismatch` and waits for the organiser.
 */
export function useBeaconController({
  contest,
  chainNow,
  ids,
}: {
  contest: ContestView | undefined;
  chainNow: bigint;
  ids: Ids;
}) {
  const config = useConfig();
  const { address: account } = useConnection();
  const [flow, setFlow] = useState<Flow>({ kind: "loading" });
  const [active, setActive] = useState<ActiveBeacon | null>(null);
  const pendingRef = useRef<PendingBeacon | null>(null);
  const run = useRef(0);

  const onChain: OnChainBeacon | null = contest ? beaconFromContest(contest) : null;
  const onChainKey = onChain ? `${onChain.anchor}|${onChain.rotation}|${onChain.start}|${onChain.length}` : "";
  const ready = contest !== undefined && ids.arena !== undefined && ids.contestId !== undefined && chainNow > 0n;
  const ended = contest !== undefined && chainNow > 0n && chainNow >= contest.votingEnd;
  const presence = contest?.presence;
  const organiser = contest?.organiser;

  const keyFor = useCallback(
    (rotation: number) =>
      ids.arena && ids.contestId !== undefined
        ? seedStorageKey({ chainId: ids.chainId, arena: ids.arena, contestId: ids.contestId, rotation })
        : null,
    [ids.arena, ids.chainId, ids.contestId],
  );

  const remember = useCallback(
    (rotation: number, seed: Hex, start: bigint, length: number) => {
      const key = keyFor(rotation);
      if (key) storage()?.setItem(key, JSON.stringify({ seed, start: start.toString(), length }));
    },
    [keyFor],
  );

  // Re-evaluate whenever the on-chain beacon changes (first load, our own setBeacon, a rotation elsewhere).
  useEffect(() => {
    if (!ready || !contest || !onChain) return;
    const id = ++run.current;
    const pending = pendingRef.current;

    if (active && sameHex(active.anchor, onChain.anchor) && active.rotation === onChain.rotation) return;
    // Our own set-up/rotation just landed: adopt the chain we already hold.
    if (pending && sameHex(pending.anchor, onChain.anchor) && onChain.length === pending.length) {
      pendingRef.current = null;
      setActive({ seed: pending.seed, chain: pending.chain, anchor: pending.anchor, start: pending.start, length: pending.length, rotation: onChain.rotation });
      setFlow({ kind: "idle" });
      return;
    }

    const key = keyFor(onChain.rotation);
    const stored = key ? readStoredSeed(storage() ?? { getItem: () => null }, key) : null;
    const decision = setupDecision({
      presence: contest.presence,
      votingEnd: contest.votingEnd,
      now: chainNow,
      beacon: onChain,
      storedSeed: stored?.seed ?? null,
    });
    setActive(null);
    switch (decision.kind) {
      case "not-required":
      case "ended":
        setFlow({ kind: decision.kind });
        return;
      case "setup":
        setFlow({ kind: "sign", purpose: "setup", rotation: 1 });
        return;
      case "recover-sign":
        setFlow({ kind: "sign", purpose: "recover", rotation: decision.rotation });
        return;
      case "rebuild-stored":
        setFlow({ kind: "checking" });
        buildChainOffThread(decision.seed, onChain.length)
          .then((chain) => {
            if (run.current !== id) return;
            if (rebuildVerdict(chain, onChain) === "resume") {
              setActive({ seed: decision.seed, chain, anchor: anchorOf(chain), start: onChain.start, length: onChain.length, rotation: onChain.rotation });
              setFlow({ kind: "idle" });
            } else {
              setFlow({ kind: "sign", purpose: "recover", rotation: onChain.rotation });
            }
          })
          .catch(() => run.current === id && setFlow({ kind: "sign", purpose: "recover", rotation: onChain.rotation }));
        return;
    }
    // `active` and `chainNow` are read, not watched: only an on-chain change (or voting ending) re-runs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, onChainKey, ended, presence, keyFor]);

  const isOrganiser = Boolean(account && organiser && account.toLowerCase() === organiser.toLowerCase());

  /** Organiser signs the seed message twice (determinism check), then rebuilds or plans a chain. */
  const sign = useCallback(async () => {
    if (flow.kind !== "sign" && flow.kind !== "error") return;
    if (!contest || !onChain || !ids.arena || ids.contestId === undefined) return;
    const { purpose, rotation } = flow;
    const id = ++run.current;
    const message = seedMessage({ contestId: ids.contestId, chainId: ids.chainId, arena: ids.arena, rotation });
    try {
      setFlow({ kind: "signing", purpose, rotation, step: 1 });
      const sig1 = await signMessage(config, { message });
      if (run.current !== id) return;
      setFlow({ kind: "signing", purpose, rotation, step: 2 });
      const sig2 = await signMessage(config, { message });
      if (run.current !== id) return;
      const deterministic = sig1.toLowerCase() === sig2.toLowerCase();
      const seed = deriveSeed(sig1);
      setFlow({ kind: "building", purpose });

      if (purpose === "recover") {
        const chain = await buildChainOffThread(seed, onChain.length);
        if (run.current !== id) return;
        if (rebuildVerdict(chain, onChain) === "resume") {
          remember(rotation, seed, onChain.start, onChain.length);
          setActive({ seed, chain, anchor: anchorOf(chain), start: onChain.start, length: onChain.length, rotation });
          setFlow({ kind: "idle" });
        } else {
          setFlow({ kind: "mismatch", rotation, reason: deterministic ? "wrong-wallet" : "smart-wallet" });
        }
        return;
      }

      const plan = planChain({ chainNow, votingStart: contest.votingStart, votingEnd: contest.votingEnd });
      const chain = await buildChainOffThread(seed, plan.length);
      if (run.current !== id) return;
      const pending: PendingBeacon = {
        purpose,
        seed,
        chain,
        anchor: anchorOf(chain),
        start: plan.start,
        length: plan.length,
        rotation,
        deterministic,
        backedUp: false,
      };
      pendingRef.current = pending;
      remember(rotation, seed, plan.start, plan.length);
      setFlow(deterministic ? { kind: "publish", pending } : { kind: "backup-required", pending });
    } catch (err) {
      if (run.current !== id) return;
      setFlow({ kind: "error", purpose, rotation, message: explainError(err).title });
    }
  }, [flow, contest, onChain, ids, config, chainNow, remember]);

  const backupText = useCallback(
    (b: { seed: Hex; start: bigint; length: number; rotation: number }) =>
      ids.arena && ids.contestId !== undefined
        ? serializeBackup({ chainId: ids.chainId, arena: ids.arena, contestId: ids.contestId, ...b })
        : null,
    [ids],
  );

  /** Downloads `arena-beacon-<contest>.json` for the pending chain (if any) or the active one. */
  const downloadBackup = useCallback(() => {
    const src = flow.kind === "backup-required" || flow.kind === "publish" ? flow.pending : active;
    if (!src || ids.contestId === undefined) return;
    const text = backupText(src);
    if (!text) return;
    downloadText(backupFileName(ids.contestId), text);
    if (flow.kind === "backup-required") {
      const pending = { ...flow.pending, backedUp: true };
      pendingRef.current = pending;
      setFlow({ kind: "publish", pending });
    }
  }, [flow, active, ids.contestId, backupText]);

  /** Restores from a backup file: same rotation as on-chain, rebuilt anchor must match. */
  const restoreBackup = useCallback(
    async (text: string): Promise<string | null> => {
      if (!onChain || !ids.arena || ids.contestId === undefined) return "The contest isn't loaded yet.";
      const parsed = parseBackup(text, { chainId: ids.chainId, arena: ids.arena, contestId: ids.contestId });
      if (!parsed.ok) return parsed.reason === "other-contest" ? "That backup belongs to a different contest." : "That file isn't an Arena beacon backup.";
      if (parsed.backup.rotation !== onChain.rotation) return "That backup is from an older beacon. Rotate the beacon instead.";
      const id = ++run.current;
      setFlow({ kind: "checking" });
      const chain = await buildChainOffThread(parsed.backup.seed, onChain.length);
      if (run.current !== id) return null;
      if (rebuildVerdict(chain, onChain) !== "resume") {
        setFlow({ kind: "mismatch", rotation: onChain.rotation, reason: "backup" });
        return "That backup doesn't match the beacon on the network.";
      }
      remember(onChain.rotation, parsed.backup.seed, onChain.start, onChain.length);
      setActive({ seed: parsed.backup.seed, chain, anchor: anchorOf(chain), start: onChain.start, length: onChain.length, rotation: onChain.rotation });
      setFlow({ kind: "idle" });
      return null;
    },
    [onChain, ids, remember],
  );

  const startRotate = useCallback(() => {
    if (!onChain) return;
    run.current++;
    setFlow({ kind: "sign", purpose: "rotate", rotation: onChain.rotation + 1 });
  }, [onChain]);

  /** Back out of a rotation (or a sign prompt for it) and keep broadcasting the current chain. */
  const cancel = useCallback(() => {
    run.current++;
    pendingRef.current = null;
    if (active) setFlow({ kind: "idle" });
    else if (onChain) setFlow({ kind: "sign", purpose: onChain.rotation === 0 ? "setup" : "recover", rotation: Math.max(1, onChain.rotation) });
  }, [active, onChain]);

  const pending = flow.kind === "publish" || flow.kind === "backup-required" ? flow.pending : null;

  return {
    flow,
    active,
    pending,
    onChain,
    isOrganiser,
    organiser,
    sign,
    downloadBackup,
    restoreBackup,
    startRotate,
    cancel,
  };
}

export type BeaconController = ReturnType<typeof useBeaconController>;
