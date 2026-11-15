import type { Metadata } from "next";
import { Suspense } from "react";
import { ManageView } from "@/components/manage/ManageView";
import { PageSkeleton } from "@/components/manage/pageBits";

export const metadata: Metadata = { title: "Control room" };

export default function ManagePage({ params }: PageProps<"/c/[id]/manage">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: PageProps<"/c/[id]/manage">["params"] }) {
  const { id } = await params;
  return <ManageView contestId={id} />;
}
