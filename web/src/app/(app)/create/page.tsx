import type { Metadata } from "next";
import { CreateWizard } from "@/components/create/CreateWizard";

export const metadata: Metadata = {
  title: "Create a contest",
  description: "Set up a contest, choose who can vote and lock in a prize.",
};

export default function CreatePage() {
  return (
    <div className="max-w-content mx-auto w-full px-4 py-8 md:px-8 md:py-12">
      <CreateWizard />
    </div>
  );
}
