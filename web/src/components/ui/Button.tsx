"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef, useState, type ReactNode } from "react";
import { spring } from "@/lib/motion";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, keeps the width, blocks clicks and sets aria-busy. */
  loading?: boolean;
  /** Toggle buttons: rendered as aria-pressed. */
  pressed?: boolean;
  /** Icon before the label (lucide, 16/20px). */
  icon?: ReactNode;
  iconAfter?: ReactNode;
  children?: ReactNode;
};

const base =
  "relative isolate inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-sm text-callout transition-[background-color,color,box-shadow,opacity] duration-150 disabled:opacity-45 aria-busy:cursor-progress";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg shadow-sm hover:bg-accent/90 data-pressed:bg-accent/85",
  secondary: "glass-thin text-fg hover:bg-bg-elevated/90 data-pressed:bg-bg-elevated",
  ghost: "text-fg hover:bg-fg/6 data-pressed:bg-fg/10",
  danger: "bg-danger text-accent-fg shadow-sm hover:bg-danger/90 data-pressed:bg-danger/85",
};

// sm is 32px tall but its hit area is extended to 44px (§4 touch targets).
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-footnote after:absolute after:-inset-y-1.5 after:inset-x-0",
  md: "h-10 px-4",
  lg: "h-12 px-5 text-body",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    pressed,
    icon,
    iconAfter,
    disabled,
    className,
    children,
    type = "button",
    onClick,
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    ...rest
  },
  ref,
) {
  const [down, setDown] = useState(false);
  const inert = disabled || loading;

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-pressed={pressed}
      aria-disabled={loading || undefined}
      data-pressed={(down && !inert) || undefined}
      data-variant={variant}
      whileTap={inert ? undefined : { scale: 0.97 }}
      transition={spring.snappy}
      onPointerDown={(e) => {
        if (!inert) setDown(true);
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        setDown(false);
        onPointerUp?.(e);
      }}
      onPointerLeave={(e) => {
        setDown(false);
        onPointerLeave?.(e);
      }}
      onPointerCancel={(e) => {
        setDown(false);
        onPointerCancel?.(e);
      }}
      onClick={(e) => {
        if (loading) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
        {icon}
        {children}
        {iconAfter}
      </span>
      {loading ? (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      ) : null}
    </motion.button>
  );
});
