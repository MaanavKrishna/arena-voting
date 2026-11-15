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
    </>
  );
}
