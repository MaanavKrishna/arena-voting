import type { Metadata } from "next";
import { Suspense } from "react";
import { GateView } from "@/components/gate/GateView";
import { Skeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = { title: "Gate" };

export default function GatePage({ params }: PageProps<"/c/[id]/gate">) {
  return (
    <Suspense fallback={<Skeleton className="m-4 flex-1 rounded-xl" />}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: PageProps<"/c/[id]/gate">["params"] }) {
  const { id } = await params;
  return <GateView contestId={id} />;
}
