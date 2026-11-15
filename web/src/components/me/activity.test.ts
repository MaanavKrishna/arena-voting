import { describe, expect, it } from "vitest";
import { entryKey, entryRole, entryUriIndex, newestFirst, uniqueContestIds } from "./activity";

const A = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const B = "0xbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbB";

describe("newestFirst", () => {
  it("sorts by block then log index, descending", () => {
    const logs = [
      { id: "a", blockNumber: 5n, logIndex: 0 },
      { id: "b", blockNumber: 9n, logIndex: 1 },
      { id: "c", blockNumber: 9n, logIndex: 3 },
      { id: "d", blockNumber: null, logIndex: null },
    ];
    expect(newestFirst(logs).map((l) => l.id)).toEqual(["c", "b", "a", "d"]);
  });
  it("does not mutate its input", () => {
    const logs = [{ blockNumber: 1n }, { blockNumber: 2n }];
    newestFirst(logs);
    expect(logs[0]!.blockNumber).toBe(1n);
  });
});

describe("entryRole", () => {
  it("is case-insensitive and tells submitter, payee and both apart", () => {
    expect(entryRole({ submitter: A, payee: B }, A.toLowerCase())).toBe("submitter");
    expect(entryRole({ submitter: A, payee: B }, B.toUpperCase().replace("0X", "0x"))).toBe("payee");
    expect(entryRole({ submitter: A, payee: A }, A)).toBe("both");
    expect(entryRole({ submitter: A, payee: A }, B)).toBeNull();
    expect(entryRole({}, A)).toBeNull();
  });
});

describe("entryUriIndex", () => {
  it("maps contest and entry id to the metadata URI and skips incomplete logs", () => {
    const m = entryUriIndex([
      { args: { contestId: 2n, entryId: 1, metadataURI: "ipfs://x" } },
      { args: { contestId: 2n, entryId: 2 } },
    ]);
    expect(m.get(entryKey(2n, 1))).toBe("ipfs://x");
    expect(m.size).toBe(1);
  });
});

describe("uniqueContestIds", () => {
  it("keeps the first occurrence of each contest", () => {
    expect(uniqueContestIds([{ args: { contestId: 3n } }, { args: { contestId: 1n } }, { args: { contestId: 3n } }, { args: {} }])).toEqual([3n, 1n]);
  });
});
