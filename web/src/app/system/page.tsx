import type { Metadata } from "next";
import { SystemPage } from "./_components/SystemPage";

export const metadata: Metadata = {
  title: "Design system",
  description: "Arena's living design system: tokens, type, materials, motion, components and effects.",
};

export default function Page() {
  return <SystemPage />;
}
