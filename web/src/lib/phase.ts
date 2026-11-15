export type Phase = "submissions" | "upcoming" | "voting" | "ended" | "finalized";

/** The subset of ContestView that decides the phase (all times in unix seconds). */
export type ContestTimes = {
  submissionEnd: bigint;
  votingStart: bigint;
  votingEnd: bigint;
  finalized: boolean;
};

export function phaseOf(c: ContestTimes, now: bigint): Phase {
  if (c.finalized) return "finalized";
  if (now < c.submissionEnd) return "submissions";
  if (now < c.votingStart) return "upcoming";
  if (now < c.votingEnd) return "voting";
  return "ended";
}
