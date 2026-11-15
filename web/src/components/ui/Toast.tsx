"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { spring } from "@/lib/motion";
import { cn } from "./cn";
import { useIsDesktop } from "./hooks";

export type ToastTone = "status" | "success" | "warning" | "error";
export type ToastInput = { tone?: ToastTone; title: string; description?: string; duration?: number };
type ToastItem = Required<Pick<ToastInput, "tone" | "title" | "duration">> & { id: number; description?: string };

type ToastApi = { toast: (t: ToastInput) => number; dismiss: (id: number) => void };
type ToastState = { items: ToastItem[] };

const ToastApiContext = createContext<ToastApi | null>(null);
const ToastStateContext = createContext<ToastState>({ items: [] });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const toast = useCallback(
    ({ tone = "status", title, description, duration = 4000 }: ToastInput) => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-2), { id, tone, title, description, duration }]);
      if (duration > 0) timers.current.set(id, setTimeout(() => dismiss(id), duration));
      return id;
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  const state = useMemo(() => ({ items }), [items]);
  return (
    <ToastApiContext value={api}>
      <ToastStateContext value={state}>{children}</ToastStateContext>
    </ToastApiContext>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastApiContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const toneIcon = {
  status: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
} as const;

const toneColor = {
  status: "text-accent",
  success: "text-verified",
  warning: "text-warning",
  error: "text-danger",
} as const;

/** Bottom-centre on phone (above the home indicator), top-right on desktop. */
export function Toaster() {
  const { items } = useContext(ToastStateContext);
  const api = useContext(ToastApiContext);
  const desktop = useIsDesktop();
  const from = desktop ? -16 : 24;

  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4",
        desktop ? "top-4 items-end pr-6" : "bottom-0 flex-col-reverse pb-safe",
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((t) => {
          const Icon = toneIcon[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              role={t.tone === "error" ? "alert" : "status"}
              initial={{ opacity: 0, y: from, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: from, scale: 0.96 }}
              transition={spring.smooth}
              className="glass-thick squircle pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md py-3 pr-2 pl-4"
            >
              <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", toneColor[t.tone])} strokeWidth={1.75} />
              <div className="min-w-0 flex-1 py-0.5">
                <p className="text-callout text-fg">{t.title}</p>
                {t.description ? <p className="text-footnote text-fg-muted mt-0.5">{t.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => api?.dismiss(t.id)}
                aria-label="Dismiss"
                className="text-fg-muted hover:text-fg hover:bg-fg/5 grid size-8 shrink-0 place-items-center rounded-full transition-colors"
              >
                <X className="size-4" strokeWidth={1.75} aria-hidden />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
