import type { Presence } from "./presence";

export type ChecklistId = "entries" | "stage" | "gate" | "share";

export type ChecklistItem = {
  id: ChecklistId;
  title: string;
  hint: string;
  done: boolean;
};

export type ChecklistInput = {
  presence: Presence;
  liveEntryCount: number;
  beaconRotation: number;
  /** Authorised gates; `undefined` while the list is still loading. */
  activeGatekeepers: number | undefined;
  shared: boolean;
};

/** Setup steps for one contest, ticked from on-chain state (the share step is the only local one). */
export function buildChecklist(i: ChecklistInput): ChecklistItem[] {
  const items: ChecklistItem[] = [
    {
      id: "entries",
      title: "Add entries",
      hint: i.liveEntryCount > 0 ? `${i.liveEntryCount} in the contest` : "Add at least one entry people can vote for.",
      done: i.liveEntryCount > 0,
    },
  ];
  if (i.presence !== "Anywhere") {
    items.push({
      id: "stage",
      title: "Set up the stage",
      hint: i.beaconRotation > 0 ? "The room signal is set." : "Open the Stage page on the projector laptop.",
      done: i.beaconRotation > 0,
    });
  }
  if (i.presence === "Gated") {
    const n = i.activeGatekeepers ?? 0;
    items.push({
      id: "gate",
      title: "Set up the gate",
      hint: n > 0 ? `${n} gate${n === 1 ? "" : "s"} authorised` : "Open the Gate page on the door device, then authorise it below.",
      done: n > 0,
    });
  }
  items.push({
    id: "share",
    title: "Share the link",
    hint: i.shared ? "Link copied." : "Copy the link or show the QR code.",
    done: i.shared,
  });
  return items;
}
