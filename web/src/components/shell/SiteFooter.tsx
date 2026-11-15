import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { arenaAddress } from "@/config/contracts";
import { chainName, explorerAddressUrl, isTestnet, targetChain } from "@/config/network";
import { shortAddress } from "@/lib/format";

/** Contract link (block explorer when the network has one) and the testnet reassurance line. */
export function SiteFooter() {
  const address = arenaAddress(targetChain.id);
  const explorer = address ? explorerAddressUrl(address) : null;

  return (
    <footer className="text-footnote text-fg-muted pb-safe mt-24">
      <div className="max-w-content mx-auto flex flex-col gap-4 px-4 pt-8 md:flex-row md:items-center md:justify-between md:px-8 md:pb-8">
        <div className="flex flex-col gap-1">
          <span className="text-callout text-fg">Arena</span>
          {isTestnet ? <span>Free test ETH, no real money.</span> : null}
        </div>
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1">
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
