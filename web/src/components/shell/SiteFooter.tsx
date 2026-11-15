import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { arenaAddress } from "@/config/contracts";
import { chainName, explorerAddressUrl, isTestnet, targetChain } from "@/config/network";
import { APP_VERSION, RELEASE_URL } from "@/config/release";
import { shortAddress } from "@/lib/format";

const LEARN_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/organisers", label: "For organisers" },
  { href: "/faq", label: "FAQ" },
  { href: "/trust", label: "Trust" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

/** Learn links, contract link (block explorer when the network has one) and the testnet reassurance line. */
export function SiteFooter() {
  const address = arenaAddress(targetChain.id);
  const explorer = address ? explorerAddressUrl(address) : null;

  return (
    <footer className="text-footnote text-fg-muted pb-safe mt-24">
      <div className="max-w-content mx-auto flex flex-col gap-6 px-4 pt-8 md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-8 md:px-8 md:pb-8">
        <div className="flex flex-col gap-1">
          <span className="text-callout text-fg flex items-baseline gap-2">
            Arena
            <a
              href={RELEASE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-mono text-fg-muted hover:text-fg transition-colors"
              aria-label={`Version ${APP_VERSION}, release notes`}
            >
              v{APP_VERSION}
            </a>
          </span>
          {isTestnet ? <span>Free test ETH, no real money.</span> : null}
        </div>
        <nav aria-labelledby="footer-learn">
          <h2 id="footer-learn" className="text-callout text-fg">
            Learn
          </h2>
          <ul className="grid grid-cols-2 gap-x-5 md:flex md:flex-wrap md:items-center">
            {LEARN_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-fg inline-flex h-11 items-center transition-colors">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 md:mt-5.5">
          <li>
            <Link href="/explore" className="hover:text-fg inline-flex h-11 items-center transition-colors">
              Explore
            </Link>
          </li>
          <li>
            <Link href="/create" className="hover:text-fg inline-flex h-11 items-center transition-colors">
              Create
            </Link>
          </li>
          <li>
            {address && explorer ? (
              <a
                href={explorer}
                target="_blank"
                rel="noreferrer"
                className="hover:text-fg inline-flex h-11 items-center gap-1 transition-colors"
              >
                Contract on {chainName}
                <ExternalLink className="size-3.5" strokeWidth={1.75} aria-hidden />
              </a>
            ) : address ? (
              <span className="inline-flex h-11 items-center gap-1.5">
                Contract <span className="text-mono" title={address}>{shortAddress(address)}</span>
                <span>on {chainName}</span>
              </span>
            ) : (
              <span className="inline-flex h-11 items-center">Not deployed on {chainName} yet</span>
            )}
          </li>
        </ul>
      </div>
    </footer>
  );
}
