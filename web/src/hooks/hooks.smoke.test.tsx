import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { isDeployed } from "@/config/contracts";
import { targetChain } from "@/config/network";
import { WalletProviders } from "@/components/wallet/WalletProviders";
import { useArenaWrite, type ArenaWriteVariables } from "./useArenaWrite";
import { useChainTime } from "./useChainTime";
import { useContest } from "./useContest";
import { useContests } from "./useContests";
import { useEntries } from "./useEntries";
import { useLiveContest } from "./useLiveContest";
import { useLogs } from "./useLogs";
import { useMetadata } from "./useMetadata";
import { useNow } from "./useNow";
import { useTicketList } from "./useTicketList";
import { useVoterState } from "./useVoterState";

/**
 * Compile-time usage check for the thin wagmi wrappers (these calls are type-checked by `tsc`), and
 * a mount smoke test: with no deployment on the target network every hook reports "not deployed"
 * instead of throwing.
 */
function Probe() {
  const now = useNow();
  const chain = useChainTime();
  const contests = useContests({ tab: "live", search: "x" });
  const contest = useContest("1");
  const entries = useEntries(1n);
  const voter = useVoterState("1");
  useLiveContest("1");
  const entryMeta = useMetadata("ipfs://bafyexample", "entry");
  const contestMeta = useMetadata("", "contest");
  const tickets = useTicketList("1");
  const logs = useLogs("VoteCast", { contestId: 1n });
  const vote = useArenaWrite("vote");
  const withdraw = useArenaWrite("withdraw");

  // argument typing is checked here, never executed
  const _typed = () => {
    const v: ArenaWriteVariables<"vote"> = {
      args: [1n, 1, { slot: 0, token: "0x00000000000000000000000000000000" }, []],
    };
    void vote.write(v);
    void withdraw.write();
    void withdraw.write({ value: 0n });
  };
  void _typed;

  return (
    <ul>
      <li data-testid="now">{now > 0n ? "ticking" : "unknown"}</li>
      <li data-testid="skew">{String(chain.skewWarning)}</li>
      <li data-testid="contests">{String(contests.notDeployed)}</li>
      <li data-testid="contest">{String(contest.notDeployed)}</li>
      <li data-testid="entries">{String(entries.notDeployed)}</li>
      <li data-testid="voter">{String(voter.hasVoted)}</li>
      <li data-testid="entry-meta">{entryMeta.data.name}</li>
      <li data-testid="contest-meta">{contestMeta.status}</li>
      <li data-testid="tickets">{String(tickets.hasList)}</li>
      <li data-testid="logs">{logs.fetchStatus}</li>
      <li data-testid="write">{vote.status}</li>
    </ul>
  );
}

describe("hooks mount inside WalletProviders", () => {
  it("mounts cleanly and reports a missing deployment instead of throwing", () => {
    render(
      <WalletProviders>
        <Probe />
      </WalletProviders>,
    );
    const missing = String(!isDeployed(targetChain.id));
    expect(screen.getByTestId("contests").textContent).toBe(missing);
    expect(screen.getByTestId("contest").textContent).toBe(missing);
    expect(screen.getByTestId("entries").textContent).toBe(missing);
    expect(screen.getByTestId("voter").textContent).toBe("false");
    expect(screen.getByTestId("skew").textContent).toBe("false");
    expect(screen.getByTestId("entry-meta").textContent).toBe("Untitled entry");
    expect(screen.getByTestId("contest-meta").textContent).toBe("missing");
    expect(screen.getByTestId("tickets").textContent).toBe("false");
    if (!isDeployed(targetChain.id)) expect(screen.getByTestId("logs").textContent).toBe("idle");
    expect(screen.getByTestId("write").textContent).toBe("idle");
  });
});
