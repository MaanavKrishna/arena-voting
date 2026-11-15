"use client";

import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { ipfsDisplayUrl } from "@/lib/ipfs";

/**
 * 4:3 entry image with blur-up: a soft gradient in the entry's colour shows at once, the image
 * fades and settles in over it when it has loaded. No image (or a broken one) keeps the gradient
 * with the entry's initial, so a gallery of entries without pictures still looks deliberate.
 */
export function EntryImage({
  uri,
  name,
  color,
  className,
  sizes = "lg",
}: {
  uri: string | undefined;
  name: string;
  /** CSS colour, e.g. var(--color-entry-2). */
  color: string;
  className?: string;
  sizes?: "lg" | "xl";
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = uri && !failed ? ipfsDisplayUrl(uri) : null;
  // "Entry 3" (no metadata) shows its number; real names show their first letter.
  const initial = /^Entry (\d+)$/.exec(name)?.[1] ?? (Array.from(name.trim())[0]?.toUpperCase() || "?");

  return (
    <div
      className={cn("bg-bg-sunken relative aspect-4/3 w-full overflow-hidden rounded-sm", className)}
      style={{
        backgroundImage: `radial-gradient(120% 100% at 15% 0%, color-mix(in oklch, ${color} 55%, transparent), transparent 70%), radial-gradient(90% 80% at 100% 100%, color-mix(in oklch, ${color} 30%, transparent), transparent 70%)`,
      }}
    >
      {!src || !loaded ? (
        <span
          aria-hidden
          className={cn(
            "text-fg/25 absolute inset-0 grid place-items-center font-semibold tabular select-none",
            sizes === "xl" ? "text-display-xl" : "text-display",
          )}
        >
          {initial}
        </span>
      ) : null}
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied IPFS gateway URL
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "absolute inset-0 size-full object-cover transition-[opacity,transform] duration-500 ease-out",
            loaded ? "scale-100 opacity-100" : "scale-105 opacity-0",
          )}
        />
      ) : null}
    </div>
  );
}
