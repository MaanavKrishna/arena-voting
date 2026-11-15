import type { Metadata } from "next";
import { contentPageMetadata } from "@/app/_site/pageMetadata";
import { ContentPage, H3, List, Note, P, Section, TextLink, type TocItem } from "@/components/content/ContentPage";
import { chainName, currencyLabel, isTestnet } from "@/config/network";

const title = "Running a contest on the day";
const description =
  "A step-by-step guide for organisers: create the contest, add entries, set up the Stage laptop and the Gate device, fund them, and finalise when voting closes.";

export const metadata: Metadata = contentPageMetadata({ title: "For organisers", heading: title, description, path: "/organisers" });

const toc: TocItem[] = [
  { id: "before", label: "What to have ready" },
  { id: "create", label: "1. Create the contest" },
  { id: "entries", label: "2. Add the entries" },
  { id: "stage", label: "3. Set up the Stage laptop" },
  { id: "gate", label: "4. Set up the Gate device" },
  { id: "funding", label: "5. Fund the Stage and Gate" },
  { id: "test", label: "6. Test with your own phone" },
  { id: "finalise", label: "7. Finalise and pay out" },
  { id: "if-something-breaks", label: "If something breaks" },
];

export default function OrganisersPage() {
  return (
    <ContentPage
      title={title}
      lede="Most of the work happens the night before. On the day you open two screens, press start, and let the room vote. This guide follows that order."
      toc={toc}
    >
      <Section id="before" title="What to have ready">
        <List>
          <li>
            A regular browser wallet such as MetaMask for the organiser. Arena rebuilds the room signal by asking this
            wallet to approve the same message again, which only works reliably with a regular wallet. If you use a
            passkey or smart wallet, the Stage asks you to download a backup file instead. Keep it safe.
          </li>
          <li>
            Enough {currencyLabel} for the prize, a little for network fees, and roughly 0.003 per guest if you use
            the Door check (it pays for each guest&apos;s vote). For a room of 100 people, about 0.5 is comfortable.
            {isTestnet ? " Test faucets limit how much you can claim per day, so start collecting early." : null}
          </li>
          <li>A laptop for the Stage, plugged in, with Chrome, speakers and a projector or big screen.</li>
          <li>For the Door check only: a laptop or tablet with a camera for each entrance.</li>
        </List>
      </Section>

      <Section id="create" title="1. Create the contest">
        <P>
          Go to <TextLink href="/create">Create</TextLink> and work through the four steps: the basics (title,
          description, an optional cover image), timing (when submissions close, when voting opens and closes), who can
          vote, and the prize.
        </P>
        <P>For who can vote, pick one:</P>
        <List>
          <li>
            <strong className="font-semibold">Anywhere</strong> if people will vote online.
          </li>
          <li>
            <strong className="font-semibold">Room</strong> for most live events. Voters&apos; phones have to hear or
            see the Stage.
          </li>
          <li>
            <strong className="font-semibold">Door</strong> for ticketed events where you can staff the entrance.
            Guests check in with a live pass and get a little {currencyLabel} to vote with.
          </li>
        </List>
        <P>
          You can also add a ticket list of wallet addresses so only registered guests can vote. It locks once voting
          or check-in starts.
        </P>
        <P>
          When you press Create, your wallet asks you to confirm and the prize moves into the contract. Timing and the
          prize can&apos;t be changed after this, so check them on the review card first. You land in the control room
          for your contest.
        </P>
      </Section>

      <Section id="entries" title="2. Add the entries">
        <P>
          In a curated contest, add each entry from the control room with <strong className="font-semibold">Add an
          entry</strong>: a name, a short line, an image, and the wallet that should receive the prize. You can add up
          to eight team member wallets; they won&apos;t be able to vote for their own entry.
        </P>
        <P>
          In an open contest, share the link and entrants submit their own (up to three each) until submissions close.
          You can remove an entry until voting opens, but not after.
        </P>
      </Section>

      <Section id="stage" title="3. Set up the Stage laptop">
        <P>
          The Stage is the screen the room watches: live results, a big QR code to join, and the room signal that
          proves phones are present. Skip this step for Anywhere contests, except as a results screen.
        </P>
        <List ordered>
          <li>
            The night before, open the Stage from the control room (<strong className="font-semibold">Open the
            Stage</strong>) on the laptop you&apos;ll use. Connect the organiser wallet and follow{" "}
            <strong className="font-semibold">Set up the room signal</strong>. You approve one message and confirm once
            in your wallet.
          </li>
          <li>
            On the day: laptop plugged in, sleep turned off, Chrome, volume between 60 and 80 percent, projector
            mirrored.
          </li>
          <li>
            Press <strong className="font-semibold">Start beacon</strong>. You can start it before voting opens; it
            begins broadcasting when voting does. Check the clock indicator is green.
          </li>
        </List>
        <Note>
          If the laptop crashes, open the Stage again on any laptop and approve the same message with the same wallet.
          It picks up where it left off without a new confirmation.
        </Note>
      </Section>

      <Section id="gate" title="4. Set up the Gate device">
        <P>Door contests only.</P>
        <List ordered>
          <li>
            Open the Gate from the control room (<strong className="font-semibold">Open the Gate</strong>) on the door
            device. It creates its own small wallet and shows its address.
          </li>
          <li>
            Back in the control room, press <strong className="font-semibold">Authorise this gate</strong> and confirm
            in your wallet. Only authorised gates can check people in.
          </li>
          <li>Put the camera at chest height in good light. Guests hold their phone up to it.</li>
        </List>
        <P>
          Big entrance? Run several Gates at once. Each one has its own wallet and needs authorising and funding.
        </P>
      </Section>

      <Section id="funding" title="5. Fund the Stage and Gate">
        <P>
          The Stage and each Gate send small updates to the contract on their own, so they need a little{" "}
          {currencyLabel} of their own. Use <strong className="font-semibold">Fund the stage</strong> (about 0.02 is
          enough for a day) and <strong className="font-semibold">Fund this gate</strong> for each Gate.
        </P>
        <H3>How much for a Gate?</H3>
        <P>
          Each check-in passes the drip amount you chose (0.003 by default) to the guest, plus a small network fee. The
          Gate shows its balance and roughly how many check-ins are left, and warns you below ten.
        </P>
      </Section>

      <Section id="test" title="6. Test with your own phone">
        <P>
          Before doors open, use your own phone: check in at the Gate if you use one, open the contest and wait for{" "}
          <strong className="font-semibold">In the room</strong>. Don&apos;t vote in the real contest; one wallet
          gets one vote. If you want to try the whole flow, run a small test contest first.
        </P>
      </Section>

      <Section id="finalise" title="7. Finalise and pay out">
        <P>
          When voting closes, the Stage shows <strong className="font-semibold">Finalise and reveal</strong>. Press it
          and confirm in your wallet; the winner is revealed on screen. Anyone can finalise, so it still happens if you
          can&apos;t.
        </P>
        <P>
          Winners claim the prize from their phone, on the contest page or under their activity. Ties split the prize
          equally. If no one voted, the prize goes back to you.
        </P>
      </Section>

      <Section id="if-something-breaks" title="If something breaks">
        <List>
          <li>
            <strong className="font-semibold">Phones can&apos;t hear the room.</strong> Turn the volume up, or switch
            the sound type to the audible chirp on the Stage. Phones can also scan the small QR under the results.
          </li>
          <li>
            <strong className="font-semibold">A Gate is lost or stolen.</strong> Revoke it in the control room. A
            Gate can only check people in; it can&apos;t vote or touch the prize.
          </li>
          <li>
            <strong className="font-semibold">You think the room signal leaked.</strong> Use{" "}
            <strong className="font-semibold">Rotate the room signal</strong>. Old signals stop working.
          </li>
          <li>
            <strong className="font-semibold">A Gate runs low.</strong> Fund it again from the control room; the queue
            keeps going.
          </li>
        </List>
        <P>
          Want to know what the contract enforces and what it trusts you with? See{" "}
          <TextLink href="/trust">Trust</TextLink>.
        </P>
        {isTestnet ? (
          <Note>
            Arena runs on {chainName}, a test network, so every amount on this page is free test money.
          </Note>
        ) : null}
      </Section>
    </ContentPage>
  );
}
