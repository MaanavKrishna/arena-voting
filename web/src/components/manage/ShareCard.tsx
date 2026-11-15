"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsClient } from "@/components/ui/hooks";
import { ControlCard } from "./ControlCard";

export function ShareCard({ contestId, title, onShared }: { contestId: string; title: string; onShared: () => void }) {
  const isClient = useIsClient();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const url = isClient ? `${window.location.origin}/c/${contestId}` : "";
  const canShare = isClient && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onShared();
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ tone: "error", title: "Couldn't copy", description: "Select the link and copy it by hand." });
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title, url });
      onShared();
    } catch {
      // dismissed the share sheet: nothing to do
    }
  };

  return (
    <ControlCard id="share" icon={<Share2 strokeWidth={1.75} />} title="Share" description="Send this link or show the code on a poster.">
      <div className="flex flex-col items-center gap-4">
        <div className="size-40 rounded-md bg-white p-3 shadow-sm" aria-hidden={!url}>
          {url ? <QRCodeSVG value={url} level="M" bgColor="#ffffff" fgColor="#0b0b0f" className="size-full" title={`QR code for ${title}`} /> : null}
        </div>
        <p className="text-footnote text-fg-muted w-full truncate text-center" title={url}>
          {url.replace(/^https?:\/\//, "") || " "}
        </p>
        <div className="flex w-full gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => void copy()}
            disabled={!url}
            icon={copied ? <Check className="size-4" strokeWidth={2} aria-hidden /> : <Copy className="size-4" strokeWidth={1.75} aria-hidden />}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
          {canShare ? (
            <Button className="flex-1" onClick={() => void share()} icon={<Share2 className="size-4" strokeWidth={1.75} aria-hidden />}>
              Share
            </Button>
          ) : null}
        </div>
      </div>
    </ControlCard>
  );
}
