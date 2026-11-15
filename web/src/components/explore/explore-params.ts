import type { ContestTab } from "@/hooks/useContests";

export type ExploreTab = Exclude<ContestTab, "all">;
export const EXPLORE_TABS: readonly ExploreTab[] = ["live", "upcoming", "ended"];
export const DEFAULT_TAB: ExploreTab = "live";

export function parseTab(value: string | null | undefined): ExploreTab {
  return EXPLORE_TABS.find((t) => t === value) ?? DEFAULT_TAB;
}

/** `?tab=&q=` with defaults left out, so the plain URL stays `/explore`. */
export function buildExploreHref(tab: ExploreTab, q: string): string {
  const p = new URLSearchParams();
  if (tab !== DEFAULT_TAB) p.set("tab", tab);
  const term = q.trim();
  if (term) p.set("q", term);
  const s = p.toString();
  return s ? `/explore?${s}` : "/explore";
}
