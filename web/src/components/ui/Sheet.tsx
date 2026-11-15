"use client";

import { X } from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  type PanInfo,
} from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fade, projectRelease, spring } from "@/lib/motion";
import { cn } from "./cn";
import { useIsClient, useIsDesktop, useReducedMotionPref } from "./hooks";

export type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Sticky footer (primary action sits in thumb reach on phone). */
  footer?: ReactNode;
  /** Hide the visible title (still labels the dialog for screen readers). */
  hideTitle?: boolean;
  className?: string;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("inert"));
}

/**
 * Modal sheet: draggable bottom sheet on phone, centred dialog ≥ 768px.
 * Focus is trapped, Esc closes, focus returns to whatever opened it.
 */
export function Sheet({ open, onOpenChange, title, description, children, footer, hideTitle, className }: SheetProps) {
  const mounted = useIsClient();

  const desktop = useIsDesktop();
  const reduce = useReducedMotionPref();
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onOpenChange);
  useLayoutEffect(() => {
    closeRef.current = onOpenChange;
  });

  const y = useMotionValue(0);
  const dragControls = useDragControls();

  // Remember the trigger, move focus in, trap Tab, close on Esc, lock page scroll.
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    y.set(0);

    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = focusables(panel).find((el) => !el.dataset.sheetClose) ?? panel;
      first.focus({ preventScroll: true });
    });

    const onKey = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current(false);
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = focusables(panel);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      const target = returnFocus.current;
      returnFocus.current = null;
      if (target && document.contains(target)) target.focus({ preventScroll: true });
    };
  }, [open, y]);

  const onDragEnd = (_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const height = panelRef.current?.offsetHeight ?? 1;
    const current = y.get();
    const velocity = info.velocity.y;
    const projected = projectRelease(current, velocity);
    // Velocity sign decides direction; projected rest position decides whether it clears half the sheet.
    const dismiss = velocity >= 0 && projected > height * 0.5;
    if (dismiss) {
      onOpenChange(false); // exit spring starts from the current y and inherits its velocity
    } else {
      animate(y, 0, { ...(Math.abs(velocity) > 300 ? spring.flick : spring.sheet), velocity });
    }
  };

  if (!mounted) return null;

  const phoneMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: fade }
    : {
        initial: { y: "100%" },
        animate: { y: 0 },
        exit: { y: "100%" },
        transition: spring.sheet,
      };
  const desktopMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: fade }
    : {
        initial: { opacity: 0, scale: 0.96, filter: "blur(8px)" },
        animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
        exit: { opacity: 0, scale: 0.96, filter: "blur(8px)" },
        transition: spring.smooth,
      };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div key="sheet" className="fixed inset-0 z-40 flex items-end justify-center md:items-center md:p-6">
          <motion.div
            aria-hidden
            className="bg-scrim absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            {...(desktop ? desktopMotion : phoneMotion)}
            style={desktop ? undefined : { y }}
            drag={desktop || reduce ? false : "y"}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0.08, bottom: 1 }}
            dragMomentum={false}
            onDragEnd={onDragEnd}
            className={cn(
              "glass-thick squircle relative flex max-h-[92dvh] w-full flex-col overflow-hidden outline-none",
              "rounded-t-lg md:max-w-sheet md:rounded-lg",
              className,
            )}
          >
            <div
              className="touch-none px-5 pt-2 md:cursor-auto md:pt-5"
              onPointerDown={(e) => {
                if (!desktop) dragControls.start(e);
              }}
            >
              <div aria-hidden className="bg-fg/20 mx-auto mb-3 h-1.5 w-10 rounded-full md:hidden" />
              <div className="flex items-start gap-3">
                <div className={cn("min-w-0 flex-1", hideTitle && "sr-only")}>
                  <h2 id={titleId} className="text-title-2 text-fg">
                    {title}
                  </h2>
                  {description ? (
                    <p id={descId} className="text-footnote text-fg-muted mt-1">
                      {description}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  data-sheet-close="true"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close"
                  className="text-fg-muted hover:text-fg bg-fg/6 hover:bg-fg/10 -mr-1 grid size-8 shrink-0 place-items-center rounded-full transition-colors"
                >
                  <X className="size-4" strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>
            <div className="text-body text-fg min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-5">
              {children}
            </div>
            {footer ? <div className="border-border pb-safe border-t px-5 pt-3 md:pb-5">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
