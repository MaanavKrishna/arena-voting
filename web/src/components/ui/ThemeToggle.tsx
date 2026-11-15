"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { SegmentedControl } from "./SegmentedControl";
import { useTheme, type ThemePreference } from "./theme";

const icon = "size-4";
const options = [
  { value: "light", label: <Sun className={icon} strokeWidth={1.75} aria-hidden />, ariaLabel: "Light" },
  { value: "dark", label: <Moon className={icon} strokeWidth={1.75} aria-hidden />, ariaLabel: "Dark" },
  { value: "system", label: <Monitor className={icon} strokeWidth={1.75} aria-hidden />, ariaLabel: "System" },
] as const;

/** Light / Dark / System. Stored in localStorage `arena:theme`. */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  return (
    <SegmentedControl<ThemePreference>
      aria-label="Theme"
      size="sm"
      options={options}
      value={preference}
      onChange={setPreference}
      className={className}
    />
  );
}
