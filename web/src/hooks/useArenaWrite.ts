"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { useConfig, useConnection } from "wagmi";
import type { ContractFunctionArgs, ContractFunctionName, Hash, TransactionReceipt } from "viem";
import { arenaAbi } from "@/generated";
import { targetChain } from "@/config/network";
import { explainError, type ExplainedError } from "@/lib/errors";
import { useArena } from "./useArena";

export type WriteStatus = "idle" | "simulating" | "confirm-in-wallet" | "pending" | "confirmed" | "error";

export type WriteState = {
  status: WriteStatus;
  error: ExplainedError | null;
  rawError?: unknown;
  txHash?: Hash;
  receipt?: TransactionReceipt;
};

export const idleWrite: WriteState = { status: "idle", error: null };

type Receiptish = { status: "success" | "reverted" };

/**
 * The write pipeline: simulate (free, no wallet) → wallet prompt → wait for the receipt.
 * A simulation failure ends the run before the wallet is ever asked, so a doomed vote shows
 * "You've already voted" instead of a wallet pop-up that then fails. Never throws.
 */
export async function runWrite<S>(
  steps: {
    simulate: () => Promise<S>;
    send: (simulated: S) => Promise<Hash>;
    wait: (hash: Hash) => Promise<Receiptish>;
  },
  emit: (state: WriteState) => void,
): Promise<WriteState> {
  let txHash: Hash | undefined;
  const fail = (err: unknown): WriteState => {
    const state: WriteState = { status: "error", error: explainError(err), rawError: err, txHash };
    emit(state);
    return state;
  };
  try {
    emit({ status: "simulating", error: null });
    const simulated = await steps.simulate();
    emit({ status: "confirm-in-wallet", error: null });
    txHash = await steps.send(simulated);
    emit({ status: "pending", error: null, txHash });
    const receipt = await steps.wait(txHash);
    if (receipt.status === "reverted") {
      const state: WriteState = {
        status: "error",
        error: { title: "The transaction failed on the network.", detail: "Nothing was changed. Try again.", action: "retry" },
        rawError: receipt,
        txHash,
        receipt: receipt as TransactionReceipt,
      };
      emit(state);
      return state;
    }
    const done: WriteState = { status: "confirmed", error: null, txHash, receipt: receipt as TransactionReceipt };
    emit(done);
    return done;
  } catch (err) {
    return fail(err);
  }
}

/** The wallet isn't connected. Named so `explainError` offers "connect". */
class WalletNotConnectedError extends Error {
  override name = "ConnectorNotConnectedError";
  constructor() {
    super("Wallet not connected");
  }
}

type WriteName = ContractFunctionName<typeof arenaAbi, "nonpayable" | "payable">;
type WriteArgs<F extends WriteName> = ContractFunctionArgs<typeof arenaAbi, "nonpayable" | "payable", F>;
export type ArenaWriteVariables<F extends WriteName> = (WriteArgs<F> extends readonly []
  ? { args?: undefined }
  : { args: WriteArgs<F> }) & { value?: bigint };

/**
 * One Arena contract write. `write(vars)` simulates, then opens the wallet, then waits for the
 * receipt, reporting `status` as it goes. It resolves to the tx hash (or `undefined` on failure)
 * and never rejects: read `error` (plain-English copy) instead.
 */
export function useArenaWrite<F extends WriteName>(functionName: F) {
  const config = useConfig();
  const { address: account } = useConnection();
  const { address } = useArena();
  const [state, setState] = useState<WriteState>(idleWrite);
  const run = useRef(0);

  useEffect(
    () => () => {
      run.current += 1; // drop updates from a run that outlives the component
    },
    [],
  );

  const write = useCallback(
    async (vars?: ArenaWriteVariables<F>): Promise<Hash | undefined> => {
      const id = ++run.current;
      const emit = (s: WriteState) => {
        if (run.current === id) setState(s);
      };
      const chainId = targetChain.id as never;
      const final = await runWrite(
        {
          simulate: async () => {
            if (!account) throw new WalletNotConnectedError();
            if (!address) throw new Error("The Arena contract isn't deployed on this network.");
            const { request } = await simulateContract(config, {
              abi: arenaAbi,
              address,
              functionName,
              args: vars?.args,
              value: vars?.value,
              account,
              chainId,
            } as never);
            return request;
          },
          send: (request) => writeContract(config, request as never),
          wait: (hash) => waitForTransactionReceipt(config, { hash, chainId }),
        },
        emit,
      );
      return final.status === "confirmed" ? final.txHash : undefined;
    },
    [account, address, config, functionName],
  );

  const reset = useCallback(() => {
    run.current += 1;
    setState(idleWrite);
  }, []);

  return {
    write,
    reset,
    status: state.status,
    /** Plain-English copy for the failure, or `null`. */
    error: state.error,
    rawError: state.rawError,
    txHash: state.txHash,
    receipt: state.receipt,
    /** True from simulation until the transaction settles. */
    isBusy: state.status === "simulating" || state.status === "confirm-in-wallet" || state.status === "pending",
  };
}
