export type Presence = "Anywhere" | "Room" | "Gated";

/** `ContestView.presence` is the contract enum as a number. */
export function presenceOf(value: number): Presence {
  return value === 2 ? "Gated" : value === 1 ? "Room" : "Anywhere";
}

export const PRESENCE_LABEL: Record<Presence, { name: string; blurb: string }> = {
  Anywhere: { name: "Open voting", blurb: "Anyone with the link can vote from anywhere." },
  Room: { name: "In the room", blurb: "Voters must hear the room signal from the Stage." },
  Gated: { name: "Door check-in", blurb: "Voters are checked in at the door, then hear the room signal." },
};
