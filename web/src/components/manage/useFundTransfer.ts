"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfig, useConnection, useSendTransaction } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import type { Address } from "viem";
import { targetChain } from "@/config/network";
import { idleWrite, runWrite, type WriteState } from "@/hooks/useArenaWrite";

class WalletNotConnectedError extends Error {
  override name = "ConnectorNotConnectedError";
  constructor() {
    super("Wallet not connected");
  }
}

/**
 * A plain ETH transfer from the connected wallet, with the same status shape as `useArenaWrite`
 * so it can drive a `TxButton`. Never throws: read `error` for plain-English copy.
 */
export function useFundTransfer() {
  const config = useConfig();
  const { address: account } = useConnection();
  const { mutateAsync } = useSendTransaction();
  const [state, setState] = useState<WriteState>(idleWrite);
  const run = useRef(0);

  useEffect(
    () => () => {
      run.current += 1;
    },
    [],
  );

  const send = useCallback(
    async (to: Address, value: bigint) => {
      const id = ++run.current;
      const chainId = targetChain.id as never;
      const final = await runWrite(
        {
          simulate: async () => {
            if (!account) throw new WalletNotConnectedError();
          },
          send: () => mutateAsync({ to, value, chainId }),
          wait: (hash) => waitForTransactionReceipt(config, { hash, chainId }),
        },
        (s) => {
          if (run.current === id) setState(s);
        },
      );
      return final.status === "confirmed" ? final.txHash : undefined;
    },
    [account, config, mutateAsync],
  );

  const reset = useCallback(() => {
    run.current += 1;
    setState(idleWrite);
  }, []);

  return {
    send,
    reset,
    status: state.status,
    error: state.error,
    txHash: state.txHash,
    isBusy: state.status === "simulating" || state.status === "confirm-in-wallet" || state.status === "pending",
  };
}
