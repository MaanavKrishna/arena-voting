import { BaseError, ContractFunctionRevertedError } from "viem";
import { arenaAbi } from "@/generated";

export type ErrorAction = "retry" | "switch-network" | "connect";
export type ExplainedError = {
  title: string;
  detail?: string;
  action?: ErrorAction;
};

type ArenaErrorName = Extract<
  (typeof arenaAbi)[number],
  { type: "error" }
>["name"];

const FALLBACK_TITLE = "Something went wrong. Try again.";

const BEACON_LOST = "We lost the room signal — listening again.";
const ENTRY_GONE = "That entry isn't in this contest anymore.";

/**
 * Copy for every custom error in the contract ABI. Typed against `arenaAbi`, so adding an error to
 * the contract fails the type check until its copy is written here.
 */
const ARENA_ERRORS: Record<ArenaErrorName, ExplainedError> = {
  // voting
  AlreadyVoted: { title: "You've already voted in this contest." },
  CannotVoteForOwnEntry: { title: "You can't vote for your own team's entry." },
  NotCheckedIn: { title: "Check in at the door first." },
  NotOnTicketList: { title: "This wallet isn't on the guest list." },
  CheckInsStarted: {
    title: "The guest list is locked because check-in has started.",
  },
  VotingNotOpen: { title: "Voting isn't open right now." },
  VotingEnded: { title: "Voting has ended for this contest." },
  VotingNotEnded: {
    title: "Voting hasn't ended yet.",
    detail: "Results can be finalised once the voting window closes.",
  },
  VotingAlreadyStarted: {
    title: "Voting has already started, so this can't be changed.",
  },
  BeaconExpired: { title: BEACON_LOST, action: "retry" },
  InvalidBeaconToken: { title: BEACON_LOST, action: "retry" },
  BeaconGapTooLarge: { title: BEACON_LOST, action: "retry" },
  BeaconSlotOutOfRange: { title: BEACON_LOST, action: "retry" },
  BeaconNotSet: { title: "The organiser hasn't started the room signal yet." },
  InvalidBeacon: {
    title: "The room signal settings aren't valid.",
    detail: "Check the start time and length of the signal and try again.",
  },
  EntryRemoved: { title: ENTRY_GONE },
  EntryNotFound: { title: ENTRY_GONE },
  SubmissionsClosed: { title: "Submissions have closed." },
  NothingToClaim: { title: "Nothing to claim yet." },

  // contest and entry setup
  ContestNotFound: { title: "We couldn't find that contest." },
  InvalidTitle: { title: "The title must be between 1 and 80 bytes." },
  InvalidURI: {
    title: "A link or description is too long or missing.",
    detail: "Links are limited to 200 bytes.",
  },
  InvalidTimeline: {
    title: "The dates don't line up.",
    detail:
      "Submissions must close in the future, voting opens after that, and voting ends within 60 days.",
  },
  InvalidVotingDuration: {
    title: "Voting must last between 5 minutes and 7 days.",
  },
  TicketListMismatch: {
    title: "The guest list and its file don't match.",
    detail: "Provide both, or neither.",
  },
  InvalidDrip: {
    title: "That check-in drip isn't allowed.",
    detail: "It's capped, and only Gated contests can use it.",
  },
  NotOrganiser: { title: "Only the organiser can do that." },
  InvalidPayee: { title: "Enter a valid wallet address for the prize payee." },
  TooManyMembers: { title: "A team can have at most 8 members." },
  InvalidMember: { title: "A team member address is invalid or listed twice." },
  TooManyEntries: {
    title: "This contest already has the maximum number of entries.",
  },

  // presence and check-in
  PresenceNotRequired: { title: "This contest doesn't use a room signal." },
  PresenceNotGated: { title: "This contest doesn't have door check-in." },
  InvalidGatekeeper: {
    title: "Enter a valid wallet address for the door device.",
  },
  NotGatekeeper: { title: "This device isn't allowed to check people in." },
  AlreadyCheckedIn: { title: "This wallet has already checked in." },
  InvalidVoter: { title: "That wallet address isn't valid." },

  // payouts and internals
  AlreadyFinalized: { title: "This contest has already been finalised." },
  TransferFailed: {
    title: "The payment couldn't be sent. Try again.",
    action: "retry",
  },
  ReentrancyGuardReentrantCall: {
    title: "That action is already in progress.",
    detail: "Wait a moment and try again.",
    action: "retry",
  },
};

function isArenaErrorName(name: string): name is ArenaErrorName {
  return Object.prototype.hasOwnProperty.call(ARENA_ERRORS, name);
}

function causes(err: unknown): unknown[] {
  if (err instanceof BaseError) {
    const out: unknown[] = [];
    err.walk((e) => {
      out.push(e);
      return false;
    });
    return out;
  }
  const out: unknown[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 10 && cur && typeof cur === "object"; i++) {
    out.push(cur);
    cur = (cur as { cause?: unknown }).cause;
  }
  return out;
}

function nameOf(e: unknown): string {
  return e && typeof e === "object" && "name" in e
    ? String((e as { name: unknown }).name)
    : "";
}

function codeOf(e: unknown): number | undefined {
  return e &&
    typeof e === "object" &&
    "code" in e &&
    typeof (e as { code: unknown }).code === "number"
    ? (e as { code: number }).code
    : undefined;
}

function textOf(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { shortMessage?: unknown; message?: unknown };
    if (typeof o.shortMessage === "string") return o.shortMessage;
    if (typeof o.message === "string") return o.message;
  }
  return typeof e === "string" ? e : "";
}

/** Turns anything a wallet, RPC or contract can throw into short plain-English copy. */
export function explainError(err: unknown): ExplainedError {
  const chain = causes(err);

  // 1. contract reverts, decoded by custom error name
  for (const e of chain) {
    if (e instanceof ContractFunctionRevertedError) {
      const name = e.data?.errorName;
      if (name && isArenaErrorName(name)) return { ...ARENA_ERRORS[name] };
      if (e.reason)
        return { title: FALLBACK_TITLE, detail: e.reason, action: "retry" };
    } else if (nameOf(e) === "ContractFunctionRevertedError") {
      const name = (e as { data?: { errorName?: string } }).data?.errorName;
      if (name && isArenaErrorName(name)) return { ...ARENA_ERRORS[name] };
    }
  }

  // 2. wallet-side problems
  if (
    chain.some(
      (e) => nameOf(e) === "UserRejectedRequestError" || codeOf(e) === 4001,
    )
  ) {
    return { title: "You cancelled in your wallet." };
  }
  if (
    chain.some((e) =>
      [
        "ConnectorNotConnectedError",
        "ConnectorAccountNotFoundError",
        "AccountNotFoundError",
      ].includes(nameOf(e)),
    )
  ) {
    return { title: "Connect your wallet to continue.", action: "connect" };
  }
  if (
    chain.some((e) =>
      [
        "ChainMismatchError",
        "ConnectorChainMismatchError",
        "ChainNotConfiguredError",
        "SwitchChainError",
      ].includes(nameOf(e)),
    ) ||
    chain.some((e) => codeOf(e) === 4902 || codeOf(e) === 4901)
  ) {
    return {
      title: "Your wallet is on the wrong network.",
      action: "switch-network",
    };
  }
  if (
    chain.some(
      (e) =>
        nameOf(e) === "InsufficientFundsError" ||
        /insufficient funds/i.test(textOf(e)),
    )
  ) {
    return {
      title: "Your wallet needs a little Sepolia ETH for the network fee.",
      detail: "Top up from a faucet, then try again.",
    };
  }

  // 3. network trouble
  if (
    chain.some((e) =>
      [
        "TimeoutError",
        "HttpRequestError",
        "WaitForTransactionReceiptTimeoutError",
        "RpcRequestError",
      ].includes(nameOf(e)),
    ) ||
    chain.some((e) =>
      /timed out|timeout|failed to fetch|network request failed/i.test(
        textOf(e),
      ),
    )
  ) {
    return {
      title: "The network is slow right now.",
      detail:
        "Your action may still go through. Check again in a moment before retrying.",
      action: "retry",
    };
  }

  return { title: FALLBACK_TITLE, action: "retry" };
}
