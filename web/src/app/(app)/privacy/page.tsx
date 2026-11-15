import type { Metadata } from "next";
import { contentPageMetadata } from "@/app/_site/pageMetadata";
import { ContentPage, List, P, Section, TextLink, type TocItem } from "@/components/content/ContentPage";
import { chainName } from "@/config/network";

const title = "Privacy";
const description =
  "Arena has no accounts, no server database and no tracking. What is public on the network, what goes to IPFS, how the microphone and camera are used, and which services are involved.";

export const metadata: Metadata = contentPageMetadata({ title: "Privacy", heading: title, description, path: "/privacy" });

const toc: TocItem[] = [
  { id: "short-version", label: "The short version" },
  { id: "public", label: "What is public" },
  { id: "device", label: "What stays on your device" },
  { id: "mic-camera", label: "Microphone and camera" },
  { id: "services", label: "Services involved" },
  { id: "rights", label: "Removing your data" },
  { id: "contact", label: "Questions" },
];

export default function PrivacyPage() {
  return (
    <ContentPage
      title={title}
      lede="Arena is a student project run by the Arena project maintainers. It is built to know as little about you as possible."
      updated="Last updated 15 November 2026"
      toc={toc}
    >
      <Section id="short-version" title="The short version">
        <List>
          <li>There are no accounts, no sign-up and no server database. We don&apos;t store anything about you.</li>
          <li>No analytics, no advertising, no tracking. The only cookie remembers your wallet connection.</li>
          <li>Votes, check-ins and entries are recorded on a public network that anyone can read, permanently.</li>
          <li>Images and text you upload for an entry or a contest are public and may never be fully deleted.</li>
          <li>The microphone and camera are used only on your device and nothing is recorded or uploaded.</li>
        </List>
      </Section>

      <Section id="public" title="What is public">
        <P>
          Arena runs on {chainName}, a public network. Anything you do through the contract is recorded there in the
          open and can&apos;t be erased by us or anyone else: your wallet address, which contests you created, which
          entries you submitted or are part of, whether you checked in, which entry you voted for, and any prize you
          claimed.
        </P>
        <P>
          Your wallet address isn&apos;t your name, but it can be linked to you if you&apos;ve shared it or used it
          elsewhere. If you want to keep your votes separate from your other activity, use a fresh wallet for the
          event.
        </P>
        <P>
          Contest and entry details (titles, descriptions, images, links, ticket lists of wallet addresses) are
          uploaded to IPFS, a public file network, through a service called Pinata. Anyone with the link can view
          them, and copies can live on in other places even if the original is removed. Don&apos;t upload anything you
          wouldn&apos;t put on a public noticeboard.
        </P>
      </Section>

      <Section id="device" title="What stays on your device">
        <P>
          Your browser keeps a few things so the app works. One cookie remembers which wallet you connected and
          its address, so pages can show you as connected when they load; it travels with your page requests but
          isn&apos;t saved or logged by Arena. Your light or dark theme choice sits in local storage. Organisers&apos;
          Stage and Gate devices also keep their own small wallets and the room signal in local storage. Clearing
          your browser&apos;s data for this site removes all of it.
        </P>
      </Section>

      <Section id="mic-camera" title="Microphone and camera">
        <P>
          The microphone is used only to hear the room signal the Stage plays during voting. Sound is processed on
          your phone, looking for that signal; nothing is recorded, saved or uploaded. You can scan the code on the
          Stage screen instead.
        </P>
        <P>
          The camera is used only on the Gate device and the scan screens, to read QR codes. Frames are processed on
          the device and never leave it. Both are asked for only when you tap a button that needs them, and you can
          turn them off in your browser at any time.
        </P>
      </Section>

      <Section id="services" title="Services involved">
        <P>These services handle requests when you use Arena. Each has its own privacy policy.</P>
        <List>
          <li>
            <strong className="font-semibold">Your wallet provider</strong> (for example MetaMask, a WalletConnect
            wallet, or a passkey wallet) handles your keys and every approval. Arena never sees your recovery phrase.
          </li>
          <li>
            <strong className="font-semibold">Alchemy</strong> provides the connection to the network. It receives
            the requests your browser makes to read the contract, which include your IP address and wallet address.
          </li>
          <li>
            <strong className="font-semibold">Pinata</strong> stores and serves the files uploaded to IPFS.
          </li>
          <li>
            <strong className="font-semibold">Vercel</strong> hosts this website and, like any web host, processes
            basic request data such as IP addresses to deliver pages.
          </li>
        </List>
      </Section>

      <Section id="rights" title="Removing your data">
        <P>
          Because we don&apos;t hold any data about you, there is nothing for us to export or delete. What&apos;s on
          the public network is permanent by design. An organiser can take an entry out of a contest
          before voting opens, but files already uploaded to IPFS may stay available.
        </P>
      </Section>

      <Section id="contact" title="Questions">
        <P>
          Ask the organiser of your event, or open an issue with the Arena project maintainers. See also the{" "}
          <TextLink href="/terms">terms of use</TextLink>.
        </P>
      </Section>
    </ContentPage>
  );
}
