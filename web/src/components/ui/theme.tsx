"use client";

import { useServerInsertedHTML } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useMediaQuery } from "./hooks";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "arena:theme";

/**
 * Runs during HTML parsing, before first paint: applies a stored light/dark choice.
 * "system" leaves <html> without data-theme so CSS follows prefers-color-scheme.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

/** Inserts the no-flash theme script into the streamed <head> once. */
export function ThemeScript() {
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script id="arena-theme" dangerouslySetInnerHTML={{ __html: themeScript }} />;
  });
  return null;
}

const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function applyPreference(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(subscribe, readPreference, () => "system" as const);
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolved: ResolvedTheme = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  // Re-apply after React's dev remount resets <html> attributes; a no-op in production.
  useLayoutEffect(() => {
    applyPreference(readPreference());
  }, []);

  const setPreference = useCallback((pref: ThemePreference) => {
    const commit = () => {
      try {
        if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
        else localStorage.setItem(THEME_STORAGE_KEY, pref);
      } catch {
        // Storage unavailable (private mode): the choice lasts for this page only.
      }
      applyPreference(pref);
      listeners.forEach((l) => l());
    };
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Cross-fade the whole page over 200ms (globals.css) instead of a brightness jump.
    if (!reduce && typeof document.startViewTransition === "function") document.startViewTransition(commit);
    else commit();
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
