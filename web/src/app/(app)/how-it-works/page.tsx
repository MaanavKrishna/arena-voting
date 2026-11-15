import type { Metadata } from "next";
import { contentPageMetadata } from "@/app/_site/pageMetadata";
import { ContentPage, H3, List, Note, P, Section, TextLink, type TocItem } from "@/components/content/ContentPage";
import { chainName, currencyLabel, isTestnet } from "@/config/network";

const title = "How Arena works";
const description =
  "Lock the prize, fill the room, and let the contract pay the winner. How Arena runs a contest and how it checks that voters are really in the room.";

export const metadata: Metadata = contentPageMetadata({ title: "How it works", heading: title, description, path: "/how-it-works" });

const toc: TocItem[] = [
  { id: "lock-the-prize", label: "Lock the prize" },
  { id: "fill-the-room", label: "Fill the room" },
  { id: "the-contract-pays", label: "The contract pays" },
  { id: "ground", label: "How Arena knows you're in the room" },
  { id: "limits", label: "What it can't do" },
  { id: "what-you-need", label: "What you need" },
];

export default function HowItWorksPage() {
  return (
    <ContentPage
      title={title}
      lede="A contest on Arena has three beats: the prize is locked before anyone votes, the people in the room vote from their phones, and the contract pays the winner. No one in the middle holds the money or counts the votes."
      toc={toc}
    >
      <Section id="lock-the-prize" title="Lock the prize">
        <P>
          The organiser creates the contest and puts the prize in at the same moment. From then on the prize sits in
          the Arena smart contract, a small program on the {chainName} network that nobody can edit. The organiser
          can&apos;t take it back, lower it, or move the voting times once the contest exists.
        </P>
        <P>
          Entries are added before voting opens. In a curated contest the organiser adds them; in an open contest
          anyone can submit one until submissions close. Each entry names a wallet that will receive the prize if it
          wins.
        </P>
      </Section>

      <Section id="fill-the-room" title="Fill the room">
        <P>
          When voting opens, people in the room open the contest link on their phones, usually from a QR code on the
          screen or a poster. They connect a wallet, pick an entry, and confirm the vote in their wallet. Each wallet
          gets one vote per contest, and nobody can vote for an entry they are part of.
        </P>
        <P>
          Results update live on everyone&apos;s screen. Every vote is a seat in the half-circle chamber, coloured by
          the entry it went to.
        </P>
      </Section>

      <Section id="the-contract-pays" title="The contract pays">
        <P>
          When voting closes, anyone can press <strong className="font-semibold">Finalise</strong>. The contract
          counts the votes it recorded and sets the winner. If two or more entries tie for first, they split the prize
          equally. If nobody voted, the prize goes back to the organiser.
        </P>
        <P>
          Winners then claim the prize from their phone. The money moves from the contract straight to the winning
          wallet. The organiser never touches it.
        </P>
      </Section>

      <Section id="ground" title="How Arena knows you're in the room">
        <P>
          Online voting is easy to rig from a sofa. Arena&apos;s answer is called Ground, and organisers choose one of
          three levels when they create a contest.
        </P>
        <H3>Anywhere</H3>
        <P>
          No presence check. Anyone with the link can vote. Good for online contests, and honest about it: the
          contest page says so.
        </P>
        <H3>Room</H3>
        <P>
          A laptop running the Stage screen plays a quiet signal, mostly above what people can hear, and shows the
          same signal as a small QR code. Voters&apos; phones pick it up through the microphone (or the camera, if the
          sound doesn&apos;t get through). The signal changes every 10 seconds and each one stops working about two
          minutes later. The contract checks the signal before it accepts a vote, so a vote from someone who never
          heard the room is turned away.
        </P>
        <P>
          The phone only listens for that signal. It doesn&apos;t record or upload any audio.
        </P>
        <H3>Door</H3>
        <P>
          Everything in Room, plus a check at the door. Each guest taps <strong className="font-semibold">Get my pass</strong>{" "}
          and holds up a live pass that redraws every two seconds, so a screenshot is useless. A Gate device at the
          entrance scans it and records the check-in on the contract. Only checked-in wallets can vote, and in this
          mode the check-in also gives each guest a little {currencyLabel} to cover the network fee for voting.
        </P>
      </Section>

      <Section id="limits" title="What it can't do">
        <P>
          Ground makes cheating from outside the room cost more than a contest is worth. It doesn&apos;t make
          cheating impossible, and we&apos;d rather say so plainly:
        </P>
        <List>
          <li>
            One wallet isn&apos;t one person. Someone with several wallets can still vote several times unless the
            organiser uses a ticket list or the Door check.
          </li>
          <li>
            In Room mode, a person inside could pass the current signal to a friend outside, who has about two minutes
            to use it. Door mode stops this, because the friend&apos;s wallet was never checked in.
          </li>
          <li>
            The organiser runs the Stage and the Gate, so they are trusted for presence. They are not trusted with the
            count or the prize: the contract handles both.
          </li>
          <li>Votes are public. Anyone can see which wallet voted for which entry.</li>
        </List>
        <P>
          The full breakdown is on the <TextLink href="/trust">Trust</TextLink> page.
        </P>
      </Section>

      <Section id="what-you-need" title="What you need">
        <List>
          <li>A phone with a browser. Chrome or Safari both work.</li>
          <li>
            A wallet: MetaMask or another browser wallet, WalletConnect, or a passkey wallet you create with Face ID or
            a fingerprint. The Connect button walks you through it.
          </li>
          <li>
            A little {currencyLabel} for the network fee when you vote, unless the contest uses the Door check, which
            gives it to you.
          </li>
        </List>
        {isTestnet ? (
          <Note>
            Arena currently runs on {chainName}, a test network. All {currencyLabel} is free test money with no real
            value.
          </Note>
        ) : null}
        <P>
          Questions? The <TextLink href="/faq">FAQ</TextLink> covers the common ones. Running an event? Read the{" "}
          <TextLink href="/organisers">organiser guide</TextLink>.
        </P>
      </Section>
    </ContentPage>
  );
}
