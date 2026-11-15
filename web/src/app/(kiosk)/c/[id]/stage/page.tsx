import type { Metadata } from "next";
import { Suspense } from "react";
import { StageView } from "@/components/stage/StageView";
import { StageSkeleton } from "@/components/stage/StageStates";

export const metadata: Metadata = { title: "Stage" };

export default function StagePage({ params }: PageProps<"/c/[id]/stage">) {
  return (
    <Suspense fallback={<StageSkeleton />}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: PageProps<"/c/[id]/stage">["params"] }) {
  const { id } = await params;
  return <StageView contestId={id} />;
}
