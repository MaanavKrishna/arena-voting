"use client";

import { useEffect } from "react";
import type { TransmitStatus } from "./useTransmitter";

/**
 * Stops the room signal the moment voting closes. The contract stops accepting room tokens
 * at votingEnd, so broadcasting after that only adds noise.
 */
export function useAutoStop(closed: boolean, status: TransmitStatus, stop: () => void): void {
  useEffect(() => {
    if (closed && (status === "on" || status === "starting")) stop();
  }, [closed, status, stop]);
}
