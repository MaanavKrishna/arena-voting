"use client";

import { Check, Copy, Share } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useFinePointer, useIsClient } from "@/components/ui/hooks";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";

/** Phones get the system share sheet; everything else (or a share failure) gets our QR sheet. */
export function shouldUseNativeShare(nav: { share?: unknown } | undefined, finePointer: boolean): boolean {
  return !finePointer && typeof nav?.share === "function";
}

/** Share a contest: copy link + QR, or the phone's own share sheet. */
export function ShareButton({ contestId, title }: { contestId: bigint; title: string }) {
  const client = useIsClient();
  const fine = useFinePointer();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { toast } = useToast();
  useEffect(() => () => clearTimeout(timer.current), []);

  const url = client ? `${window.location.origin}/c/${contestId}` : `/c/${contestId}`;

  const onShare = async () => {
    if (shouldUseNativeShare(typeof navigator === "undefined" ? undefined : navigator, fine)) {
      try {
        await navigator.share({ title, text: `Vote in “${title}” on Arena`, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return; // closed the share sheet
      }
    }
    setOpen(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({ tone: "error", title: "Couldn't copy", description: "Select the link and copy it by hand." });
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={onShare} icon={<Share className="size-4" strokeWidth={1.75} aria-hidden />}>
        Share
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Share this contest" description="Scan to open it on a phone.">
        <div className="flex flex-col items-center gap-5">
          <div className="rounded-md bg-white p-4 shadow-sm ring-1 ring-black/5">
            <QRCodeSVG value={url} size={208} level="M" marginSize={0} title={`QR code for ${url}`} />
          </div>
          <div className="bg-bg-sunken border-border flex w-full items-center gap-2 rounded-sm border py-1 pr-1 pl-3">
            <span className="text-mono text-fg-muted min-w-0 flex-1 truncate" title={url}>
              {url}
            </span>
            <Button
              size="sm"
              variant={copied ? "secondary" : "primary"}
              onClick={copy}
              icon={
                copied ? (
                  <Check className="size-4" strokeWidth={2.5} aria-hidden />
                ) : (
                  <Copy className="size-4" strokeWidth={1.75} aria-hidden />
                )
              }
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <span className="sr-only" aria-live="polite">
            {copied ? "Link copied" : ""}
          </span>
        </div>
      </Sheet>
    </>
  );
}
