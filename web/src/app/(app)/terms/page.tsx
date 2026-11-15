import type { Metadata } from "next";
import { contentPageMetadata } from "@/app/_site/pageMetadata";
import { ContentPage, List, P, Section, TextLink, type TocItem } from "@/components/content/ContentPage";
import { chainName, currencyLabel } from "@/config/network";

const title = "Terms of use";
const description =
  "Short, plain terms for using Arena: a test network student project, provided as is, with public on-chain data and permanent IPFS uploads.";

export const metadata: Metadata = contentPageMetadata({ title: "Terms", heading: title, description, path: "/terms" });

const toc: TocItem[] = [
  { id: "what-arena-is", label: "What Arena is" },
  { id: "test-network", label: "Test network only" },
  { id: "no-warranty", label: "No warranty" },
  { id: "your-content", label: "What you upload" },
  { id: "organisers", label: "Organisers" },
  { id: "fair-use", label: "Fair use" },
  { id: "third-parties", label: "Other services" },
  { id: "changes", label: "Changes and contact" },
];

export default function TermsPage() {
  return (
    <ContentPage
      title={title}
      lede="By using Arena you agree to these terms. They are short because the project is small, but please read them."
      updated="Last updated 15 November 2026"
      toc={toc}
    >
      <Section id="what-arena-is" title="What Arena is">
        <P>
          Arena is a student project maintained by the Arena project maintainers. It is a website that helps people
          run and vote in contests whose rules and prize are handled by a public smart contract. It is not a company,
          and there is no paid service.
        </P>
      </Section>

      <Section id="test-network" title="Test network only">
        <P>
          Arena runs on {chainName}, a test network. {currencyLabel} has no monetary value, and nothing on Arena
          should be treated as a real prize, payment or financial product. Don&apos;t send real funds to the contract
          or to any address shown in the app.
        </P>
      </Section>

      <Section id="no-warranty" title="No warranty">
        <P>
          Arena is provided as is, without warranties of any kind. The contract has not been audited. It may contain
          bugs, the website may be unavailable, and the network or other services it depends on may fail or change.
          To the extent the law allows, the maintainers are not liable for any loss or harm from using Arena,
          including lost test funds, missed votes or a contest that doesn&apos;t finish as planned.
        </P>
      </Section>

      <Section id="your-content" title="What you upload">
        <P>
          Contest and entry details you add (text, images, links, wallet addresses) are published to IPFS and
          referenced on a public network. They are public, and may be impossible to fully delete. Only upload what you
          have the right to share, and nothing illegal, hateful, or someone else&apos;s personal information without
          their permission.
        </P>
        <P>
          You keep any rights you have in what you upload. By uploading it you allow it to be stored and shown to
          anyone who views the contest.
        </P>
      </Section>

      <Section id="organisers" title="Organisers">
        <P>
          If you run a contest, you are responsible for it: the rules you announce, the entries you accept, the
          devices you run at the event, and being honest about who was in the room. The contract enforces the count
          and the payout; the rest is on you. Arena&apos;s maintainers have no control over your contest and
          can&apos;t reverse anything recorded on the network.
        </P>
      </Section>

      <Section id="fair-use" title="Fair use">
        <List>
          <li>Don&apos;t try to cheat a contest, disrupt the website, or overload the services it relies on.</li>
          <li>
            If you find a security problem, report it rather than using it. See{" "}
            <TextLink href="/trust#report">Report a problem</TextLink>.
          </li>
          <li>Follow the laws that apply to you and to your event.</li>
        </List>
      </Section>

      <Section id="third-parties" title="Other services">
        <P>
          Using Arena also means using your wallet provider, the Alchemy network connection, Pinata for IPFS files,
          and Vercel for hosting. Their own terms apply to their parts. See the{" "}
          <TextLink href="/privacy">privacy notice</TextLink> for what each one handles.
        </P>
      </Section>

      <Section id="changes" title="Changes and contact">
        <P>
          These terms may change as the project does; the date at the top shows the latest version. For questions,
          ask the organiser of your event or open an issue with the Arena project maintainers.
        </P>
      </Section>
    </ContentPage>
  );
}
