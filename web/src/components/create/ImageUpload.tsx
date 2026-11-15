"use client";

import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { ipfsDisplayUrl, uploadToIpfs } from "@/lib/ipfs";
import { ImageError, prepareImage } from "./resizeImage";

export type ImageUploadProps = {
  /** `ipfs://<cid>` of the uploaded image, or "" when there is none. */
  value: string;
  onChange: (uri: string) => void;
  /**
   * Called with `true` when a pick starts preparing/uploading and `false` when it settles (success
   * or failure). Lets a parent hold its submit button until the image URI is final. Also fires if
   * this component unmounts mid-upload, so the flag can't get stuck.
   */
  onBusyChange?: (busy: boolean) => void;
  /** Accessible name for the picker, e.g. "Cover image". */
  label?: string;
  /** Shown inside the empty state. */
  hint?: string;
  /** CSS aspect ratio of the preview box. */
  aspect?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Pick, drop or replace one image. It is shrunk to 1600 px in the browser, uploaded to IPFS through
 * `/api/upload`, and reported back as `ipfs://<cid>`. Reusable for entry images.
 */
export function ImageUpload({
  value,
  onChange,
  onBusyChange,
  label = "Image",
  hint = "PNG, JPEG, WebP or GIF. Big images are shrunk for you.",
  aspect = "16 / 9",
  disabled,
  className,
}: ImageUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Free the temporary preview URL when it's replaced or the component goes away.
  useEffect(() => {
    return () => {
      if (local) URL.revokeObjectURL(local);
    };
  }, [local]);

  const shown = local ?? (value ? ipfsDisplayUrl(value) : null);

  async function pick(file: File | undefined) {
    if (!file || busy || disabled) return;
    setError(null);
    setBusy(true);
    onBusyChange?.(true);
    try {
      const blob = await prepareImage(file);
      setLocal(URL.createObjectURL(blob));
      const uri = await uploadToIpfs(blob);
      onChange(uri);
    } catch (err) {
      setLocal(null);
      setError(
        err instanceof ImageError
          ? err.message
          : "The upload didn't go through. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
      onBusyChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void pick(e.dataTransfer.files[0]);
  }

  const input = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      className="sr-only"
      disabled={disabled || busy}
      aria-label={label}
      onChange={(e) => void pick(e.target.files?.[0])}
    />
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {shown ? (
        <div className="solid squircle shadow-sm relative overflow-hidden rounded-md" style={{ aspectRatio: aspect }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- user-chosen image from a gateway, not a build-time asset */}
          <img src={shown} alt="" className={cn("size-full object-cover transition-opacity", busy && "opacity-50")} />
          {busy ? (
            <div className="absolute inset-0 grid place-items-center">
              <Spinner label="Uploading" />
            </div>
          ) : null}
          <div className="absolute right-2 bottom-2 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || busy}
              icon={<RefreshCw className="size-4" strokeWidth={1.75} aria-hidden />}
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || busy}
              icon={<Trash2 className="size-4" strokeWidth={1.75} aria-hidden />}
              onClick={() => {
                setLocal(null);
                setError(null);
                onChange("");
              }}
            >
              Remove
            </Button>
          </div>
          {input}
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{ aspectRatio: aspect }}
          className={cn(
            "text-fg-muted flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 text-center transition-colors",
            "has-[:focus-visible]:outline-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
            dragging ? "border-accent bg-accent/8 text-accent" : "border-border-strong hover:border-fg-muted hover:text-fg",
            (disabled || busy) && "cursor-not-allowed opacity-60",
          )}
        >
          {busy ? <Spinner label="Uploading" /> : <ImagePlus className="size-6" strokeWidth={1.5} aria-hidden />}
          <span className="text-callout text-fg">{busy ? "Uploading…" : "Add an image"}</span>
          <span className="text-footnote max-w-[28ch] text-pretty">{hint}</span>
          {input}
        </label>
      )}
      {error ? (
        <p role="alert" className="text-footnote text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
