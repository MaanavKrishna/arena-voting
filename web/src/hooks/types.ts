import type { ContractEventName, ContractFunctionReturnType } from "viem";
import type { arenaAbi } from "@/generated";

export type ContestView = ContractFunctionReturnType<typeof arenaAbi, "view", "getContest">;
export type EntryView = ContractFunctionReturnType<typeof arenaAbi, "view", "getEntries">[number];
export type ArenaEventName = ContractEventName<typeof arenaAbi>;
