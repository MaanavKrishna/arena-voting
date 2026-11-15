import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

const base =
  "text-body inline-flex h-12 items-center justify-center gap-2 rounded-sm px-5 whitespace-nowrap transition-[background-color,transform,box-shadow] duration-150 active:scale-[0.97]";
const variants = {
  primary: "bg-accent text-accent-fg shadow-md hover:bg-accent/90",
  secondary: "glass-thin text-fg hover:bg-bg-elevated/90",
} as const;

/** A link that looks like a Button (an anchor, not a button inside an anchor). */
export function LinkButton({
  variant = "primary",
  icon,
  iconAfter,
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & { variant?: keyof typeof variants; icon?: ReactNode; iconAfter?: ReactNode }) {
  return (
    <Link className={cn(base, variants[variant], className)} {...rest}>
      {icon}
      {children}
      {iconAfter}
    </Link>
  );
}
