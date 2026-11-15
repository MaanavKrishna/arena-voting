import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ContestPage } from "@/components/contest/ContestPage";
import { ContestSkeleton } from "@/components/contest/ContestStates";
import { isContestIdParam } from "@/components/contest/contestLogic";

export const metadata: Metadata = { title: "Contest" };

async function Contest({ params }: { params: PageProps<"/c/[id]">["params"] }) {
  const { id } = await params;
  if (!isContestIdParam(id)) notFound();
  // Ids cross to the client as strings (never bigint); the client island does all chain reads.
  return <ContestPage id={BigInt(id).toString()} />;
}

export default function Page({ params }: PageProps<"/c/[id]">) {
  return (
    <Suspense fallback={<ContestSkeleton />}>
      <Contest params={params} />
    </Suspense>
  );
}
