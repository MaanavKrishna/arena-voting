import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";
import { isContestIdParam } from "@/components/contest/contestLogic";
import { readContestSummary, type ContestSummary } from "./contests.server";
import { ContestOgImage, loadOgFonts, OG_SIZE } from "./og";

/** Title and tally change slowly enough for share previews; a few minutes stale is fine. */
async function summary(id: string): Promise<ContestSummary | null> {
  "use cache";
  cacheLife("minutes");
  return readContestSummary(BigInt(id));
}

/** Share image for /c/[id]. Unknown ids and unreachable RPCs get a generic contest card. */
export async function renderContestOg(id: string): Promise<ImageResponse> {
  const contest = isContestIdParam(id) ? await summary(id) : null;
  return new ImageResponse(
    <ContestOgImage
      title={contest?.title || null}
      totalVotes={contest ? contest.totalVotes : null}
      finalized={contest?.finalized ?? false}
    />,
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
