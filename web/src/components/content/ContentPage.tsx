import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Layout and text pieces for the plain content pages (how it works, organisers, FAQ, trust,
 * privacy, terms). One H1, a readable measure (~66ch), real heading levels, and anchor links on
 * every section. Long pages pass `toc` for an "On this page" list.
 */

export type TocItem = { id: string; label: string };

const linkClass =
  "text-fg underline decoration-fg/30 underline-offset-4 transition-colors hover:decoration-fg focus-visible:outline-accent rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2";

export function ContentPage({
  title,
  lede,
  toc,
  updated,
  children,
}: {
  title: string;
  lede: ReactNode;
  toc?: TocItem[];
  /** Shown under the lede, e.g. "Last updated 15 November 2026". */
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="max-w-content mx-auto w-full px-4 py-10 md:px-8 md:py-14">
      <div className={cn(toc && "lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-16")}>
        <article className="max-w-prose min-w-0">
          <header className="mb-10">
            <h1 className="text-display text-fg text-balance">{title}</h1>
            <div className="text-title-3 text-fg-muted mt-4 font-normal text-pretty">{lede}</div>
            {updated ? <p className="text-footnote text-fg-muted mt-4">{updated}</p> : null}
          </header>
          {toc ? <Toc items={toc} className="mb-12 lg:hidden" /> : null}
          <div className="flex flex-col gap-12">{children}</div>
        </article>
        {toc ? (
          <aside className="hidden lg:block">
            <Toc items={toc} className="sticky top-24" />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function Toc({ items, className }: { items: TocItem[]; className?: string }) {
  return (
    <nav aria-label="On this page" className={className}>
      <p className="text-callout text-fg mb-2">On this page</p>
      <ol className="border-border flex flex-col border-l">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="text-footnote text-fg-muted hover:text-fg hover:border-fg focus-visible:outline-accent -ml-px flex min-h-11 items-center lg:min-h-9 border-l border-transparent py-1 pl-4 transition-colors focus-visible:outline-2"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A section with an H2 that links to itself, so any part of a page can be shared. */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24">
      <h2 id={`${id}-heading`} className="text-title-1 text-fg group mb-4 text-balance">
        <a href={`#${id}`} className="focus-visible:outline-accent rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2">
          {title}
          <span aria-hidden className="text-fg-subtle ml-2 opacity-0 transition-opacity group-hover:opacity-100">
            #
          </span>
        </a>
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function H3({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3 id={id} className="text-title-3 text-fg mt-4 scroll-mt-24 text-balance">
      {children}
    </h3>
  );
}

export function P({ className, ...rest }: ComponentProps<"p">) {
  return <p className={cn("text-body text-fg text-pretty", className)} {...rest} />;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-footnote text-fg-muted text-pretty">{children}</p>;
}

export function List({ ordered, children }: { ordered?: boolean; children: ReactNode }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      className={cn(
        "text-body text-fg marker:text-fg-muted flex flex-col gap-2 pl-6",
        ordered ? "list-decimal" : "list-disc",
      )}
    >
      {children}
    </Tag>
  );
}

/** Internal links use next/link; anything with a protocol opens in a new tab. */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={linkClass}>
      {children}
    </Link>
  );
}

/** A two-or-more column table that scrolls sideways on narrow screens instead of squashing. */
export function Table({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: ReactNode[][];
}) {
  return (
    // Focusable so keyboard users can scroll it sideways on narrow screens.
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="border-border focus-visible:outline-accent -mx-4 overflow-x-auto border-y focus-visible:outline-2 md:mx-0 md:rounded-md md:border"
    >
      <table className="text-callout w-full min-w-xl border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-border border-b">
            {head.map((h) => (
              <th key={h} scope="col" className="text-footnote text-fg-muted px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-border border-b last:border-b-0">
              {row.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="text-fg px-4 py-3 align-top font-normal">
                    {cell}
                  </th>
                ) : (
                  <td key={j} className="text-fg-muted px-4 py-3 align-top">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
