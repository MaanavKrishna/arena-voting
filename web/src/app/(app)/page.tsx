import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { LiveStrip } from "@/components/landing/LiveStrip";
import { TrustStrip } from "@/components/landing/TrustStrip";

export default function Home() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <TrustStrip />
      <LiveStrip />
      <p className="text-footnote text-fg-muted max-w-content mx-auto w-full px-4 pb-4 md:px-8">
        Already part of a contest?{" "}
        <Link
          href="/me"
          className="text-accent hover:text-accent/80 focus-visible:outline-accent inline-flex items-center gap-1 rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          See your activity
          <ArrowRight className="size-3.5" strokeWidth={1.75} aria-hidden />
        </Link>
      </p>
    </>
  );
}
