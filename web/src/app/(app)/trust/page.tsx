import type { Metadata } from "next";
import { contentPageMetadata } from "@/app/_site/pageMetadata";
import { ContentPage, List, Note, P, Section, Table, TextLink, type TocItem } from "@/components/content/ContentPage";
import { arenaAddress } from "@/config/contracts";
import { chainName, explorerAddressUrl, isTestnet, targetChain } from "@/config/network";

const title = "What you can trust, and why";
const description =
  "What the Arena contract guarantees, what the organiser is trusted with, what Ground stops and what it doesn't, and how to check the contract yourself. Not audited; test network only.";

export const metadata: Metadata = contentPageMetadata({ title: "Trust", heading: title, description, path: "/trust" });

const toc: TocItem[] = [
  { id: "status", label: "Status" },
  { id: "contract", label: "What the contract guarantees" },
  { id: "organiser", label: "What the organiser is trusted with" },
  { id: "others", label: "Everyone else involved" },
  { id: "threats", label: "What Ground stops" },
  { id: "check-it", label: "Check it yourself" },
  { id: "report", label: "Report a problem" },
];

const blocked = "Blocked";

export default function TrustPage() {
  const address = arenaAddress(targetChain.id);
  const explorer = address ? explorerAddressUrl(address) : null;

  return (
    <ContentPage
      title={title}
      lede="Arena splits a contest into what a contract enforces and what a person is trusted to do. This page lists both, including the parts that can still be gamed."
      toc={toc}
    >
      <Section id="status" title="Status">
        <P>
          <strong className="font-semibold">
            The Arena contract has not been audited.{isTestnet ? ` It runs on ${chainName}, a test network only.` : ""}
          </strong>{" "}
          It has an extensive automated test suite, but no independent security firm has reviewed it. Every amount
          involved today is free test money. Please don&apos;t treat it as a place to hold anything of value.
        </P>
      </Section>

      <Section id="contract" title="What the contract guarantees">
        <P>These rules are written into the contract. Nobody, including the organiser and the people who built Arena, can bend them for a contest that already exists.</P>
        <List>
          <li>The prize is locked in when the contest is created and can only leave as a payout or a refund.</li>
          <li>Voting times can&apos;t be changed after creation.</li>
          <li>Each wallet votes once per contest, inside the voting window, and the vote can&apos;t be changed.</li>
          <li>Nobody can vote for an entry they receive the prize for or are a team member of.</li>
          <li>Entries can&apos;t be removed once voting opens.</li>
          <li>In Room and Door contests, a vote needs a fresh room signal; in Door contests, a check-in as well.</li>
          <li>
            The count is the contract&apos;s own. Ties split the prize equally; with no votes, it goes back to the
            organiser. Anyone can trigger the payout after voting closes.
          </li>
        </List>
      </Section>

      <Section id="organiser" title="What the organiser is trusted with">
        <P>
          The organiser runs the room, so they are trusted for <strong className="font-semibold">presence</strong>:
          deciding who counts as being there.
        </P>
        <List>
          <li>They hold the key behind the room signal, so they could hand it to someone outside.</li>
          <li>They authorise the Gate devices, so they could check in wallets that never came through the door.</li>
          <li>In curated contests they choose the entries, until voting opens.</li>
        </List>
        <P>
          They are <strong className="font-semibold">not</strong> trusted with the count or the money. They can&apos;t
          add or remove votes, change the winner, move the timing, or take back the prize.
        </P>
      </Section>

      <Section id="others" title="Everyone else involved">
        <Table
          caption="Who is trusted for what"
          head={["Part", "Trusted for", "Can't do"]}
          rows={[
            ["Gate devices", "Checking in wallets they've seen at the door", "Vote for anyone or move the prize"],
            [
              "This website",
              "Showing things clearly",
              "Make an invalid vote count. Even a broken or tampered site can't get past the contract's rules",
            ],
            ["IPFS (entry images and text)", "Keeping files available", "Change the results"],
            ["Network providers", "Keeping the connection up", "Change the results; your wallet approves each action"],
          ]}
        />
      </Section>

      <Section id="threats" title="What Ground stops">
        <P>
          Ground is Arena&apos;s presence check. It doesn&apos;t make cheating impossible. It makes cheating from
          outside the room, or at scale, cost more than a contest is worth.
        </P>
        <Table
          caption="Common attempts to cheat and what each presence level does about them"
          head={["Attempt", "Anywhere", "Room", "Door"]}
          rows={[
            ["Vote from home", "Allowed", blocked, blocked],
            ["A friend inside sends the room signal to someone outside", "Allowed", "Possible for about 2 minutes", blocked],
            ["Record the signal and replay it later", "—", blocked, blocked],
            ["Screenshot someone's door pass", "—", "—", blocked],
            ["Hold a video call of a phone up to the Gate", "—", "—", "Possible, in plain view of staff"],
            ["One person with many wallets", "Possible", "Possible", "Each wallet needs its own live pass; a ticket list makes it much harder"],
            ["Organiser lets friends in who weren't there", "Possible", "Possible", "Possible"],
            ["Vote for your own entry", blocked, blocked, blocked],
          ]}
        />
        <Note>
          The organiser row is the honest cost of running presence through a person. Everything they could do is
          limited to who gets to vote; none of it touches the count or the prize.
        </Note>
        <P>
          One more thing worth knowing: votes are public. Anyone can see which wallet voted for which entry.
        </P>
      </Section>

      <Section id="check-it" title="Check it yourself">
        {address && explorer ? (
          <P>
            The contract&apos;s source code is published and verified on the block explorer, so you can read exactly
            what it does and see every vote and payout: <TextLink href={explorer}>Arena contract on {chainName}</TextLink>{" "}
            (<span className="text-mono break-all">{address}</span>).
          </P>
        ) : address ? (
          <P>
            On this network the contract lives at <span className="text-mono break-all">{address}</span>.
          </P>
        ) : (
          <P>The contract isn&apos;t deployed on {chainName} yet.</P>
        )}
        <P>
          For a plainer walk-through of the rules, see <TextLink href="/how-it-works">How it works</TextLink>.
        </P>
      </Section>

      <Section id="report" title="Report a problem">
        <P>
          Found a bug or a way to cheat? Tell the organiser of your event, or open an issue with the Arena project
          maintainers. Please describe what you saw and how to repeat it, and don&apos;t use it against a live
          contest.
        </P>
      </Section>
    </ContentPage>
  );
}
