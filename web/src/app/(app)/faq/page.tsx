import type { Metadata } from "next";
import { contentPageMetadata } from "@/app/_site/pageMetadata";
import type { ReactNode } from "react";
import { ContentPage, H3, P, Section, TextLink, type TocItem } from "@/components/content/ContentPage";
import { chainName, currencyLabel } from "@/config/network";

const title = "Questions people ask";
const description =
  "Do you need crypto, why your phone needs the microphone, whether you can change your vote, what happens on a tie, and who can see how you voted.";

export const metadata: Metadata = contentPageMetadata({ title: "FAQ", heading: title, description, path: "/faq" });

const toc: TocItem[] = [
  { id: "money", label: "Money and wallets" },
  { id: "voting", label: "Voting" },
  { id: "results", label: "Results and prizes" },
  { id: "privacy-and-safety", label: "Privacy and safety" },
];

function Q({ id, q, children }: { id: string; q: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <H3 id={id}>
        <a href={`#${id}`} className="focus-visible:outline-accent rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2">
          {q}
        </a>
      </H3>
      {children}
    </div>
  );
}

export default function FaqPage() {
  return (
    <ContentPage
      title={title}
      lede="Short answers. If yours isn't here, ask the organiser of your event, who can see everything about their contest."
      toc={toc}
    >
      <Section id="money" title="Money and wallets">
        <Q id="what-is-test-eth" q={`What is ${chainName}, and what is ${currencyLabel}?`}>
          <P>
            {chainName} is a test copy of the Ethereum network. It works exactly like the real one, but its currency,{" "}
            {currencyLabel}, is free and has no value. Arena runs there for now, so every prize, fee and amount you see
            is play money.
          </P>
        </Q>
        <Q id="do-i-need-crypto" q="Do I need crypto to vote?">
          <P>
            You need a wallet and a tiny amount of {currencyLabel} for the network fee, but you don&apos;t need to buy
            anything. If the contest checks you in at the door, check-in gives you enough to vote. Otherwise you can
            claim some for free from a public test faucet; your organiser may also hand some out.
          </P>
          <P>
            No wallet yet? The Connect button can create one with Face ID or your fingerprint in a few seconds.
          </P>
        </Q>
        <Q id="which-wallet" q="Which wallet should I use?">
          <P>
            Any of them for most contests: MetaMask or another browser wallet, a wallet on your phone through
            WalletConnect, or a passkey wallet. Contests with a door check need a regular wallet such as MetaMask,
            because a passkey wallet&apos;s approval is too large to fit in the live pass QR code.
          </P>
        </Q>
      </Section>

      <Section id="voting" title="Voting">
        <Q id="why-microphone" q="Why does my phone want the microphone?">
          <P>
            To hear the room. The Stage plays a quiet signal that changes every 10 seconds, and your phone listens for
            it to prove you&apos;re there. Nothing is recorded, saved or uploaded; the phone only looks for that
            signal. If you&apos;d rather not use the mic, tap <strong className="font-semibold">Scan the
            screen</strong> and point your camera at the small code on the Stage instead.
          </P>
        </Q>
        <Q id="not-in-the-room" q="What if I'm not in the room?">
          <P>
            In Room and Door contests, you can&apos;t vote. The contract checks for a fresh room signal (and, at the
            door, a check-in) before it accepts a vote. You can still watch the results live from anywhere. Contests
            marked Anywhere accept votes from anyone with the link.
          </P>
        </Q>
        <Q id="change-vote" q="Can I change my vote?">
          <P>
            No. Each wallet gets one vote per contest, and once it&apos;s confirmed it&apos;s final. Take a second
            before you tap.
          </P>
        </Q>
        <Q id="vote-for-own-entry" q="Can I vote for my own entry?">
          <P>
            No. The wallet that receives an entry&apos;s prize, its team members and, in open contests, whoever submitted it
            can&apos;t vote for it. They can vote for any other entry.
          </P>
        </Q>
      </Section>

      <Section id="results" title="Results and prizes">
        <Q id="ties" q="What happens if there's a tie?">
          <P>All entries tied for first place share the prize equally, and each claims its share.</P>
        </Q>
        <Q id="no-votes" q="What if no one votes?">
          <P>The prize goes back to the organiser when the contest is finalised.</P>
        </Q>
        <Q id="who-pays" q="Who pays the winner?">
          <P>
            The contract. The prize was locked in it when the contest was created. After voting closes, anyone can
            finalise the contest, and winners claim the prize straight to their wallet. The organiser can&apos;t stop
            or redirect the payout.
          </P>
        </Q>
      </Section>

      <Section id="privacy-and-safety" title="Privacy and safety">
        <Q id="who-sees-my-vote" q="Who can see my vote?">
          <P>
            Everyone. Votes are recorded on a public network, so anyone can see which wallet voted for which entry.
            Your name isn&apos;t attached, only your wallet address, but if people know that address is yours, they
            can see your vote. If that matters to you, use a fresh wallet just for the event.
          </P>
        </Q>
        <Q id="is-it-safe" q="Is it safe?">
          <P>
            Arena never asks for your recovery phrase and never moves money without you confirming in your wallet.
            Because it runs on a test network, there is no real money at risk. The contract is open to inspection but
            has not had a professional security audit. The <TextLink href="/trust">Trust</TextLink> page explains
            exactly what it guarantees and what it doesn&apos;t.
          </P>
        </Q>
        <Q id="mainnet" q="Will Arena run with real money?">
          <P>
            Not yet. Moving to the main Ethereum network would need a security audit and a careful checklist first,
            and there is no date for it. Until then, Arena is a test network project.
          </P>
        </Q>
        <Q id="what-is-stored" q="What does Arena keep about me?">
          <P>
            Nothing on a server. There are no accounts and no database. See the{" "}
            <TextLink href="/privacy">privacy notice</TextLink> for the details.
          </P>
        </Q>
      </Section>
    </ContentPage>
  );
}
