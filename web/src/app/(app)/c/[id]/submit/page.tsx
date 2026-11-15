import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/manage/pageBits";
import { SubmitView } from "@/components/submit/SubmitView";

export const metadata: Metadata = { title: "Submit an entry" };

export default function SubmitPage({ params }: PageProps<"/c/[id]/submit">) {
  return (
    <Suspense fallback={<PageSkeleton narrow />}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: PageProps<"/c/[id]/submit">["params"] }) {
  const { id } = await params;
  return <SubmitView contestId={id} />;
}
