import type { Metadata } from "next";
import { MyActivity } from "@/components/me/MyActivity";

export const metadata: Metadata = { title: "My activity" };

export default function MePage() {
  return <MyActivity />;
}
