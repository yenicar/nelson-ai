"use client";

// Two themes: "dark" (default — navy + liquid glass) and "light" (off-white +
// purple gradient + uplift shadows). Theme is stored in localStorage and applied
// as `data-theme="..."` on <html>. CSS overrides in globals.css do the heavy
// lifting; components don't need theme-aware classes.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

export type Theme = "dark" | "light";

interface Ctx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeCtx = createContext<Ctx | null>(null);
const KEY = "nelson-theme";

// useLayoutEffect on the client, no-op on the server (avoids hydration mismatch)
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  // Sync from localStorage once on mount.
  useIsoLayoutEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY) as Theme | null;
      if (saved === "light" || saved === "dark") setThemeState(saved);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  // Apply to <html> + persist whenever theme changes.
  useIsoLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(KEY, theme);
    } catch {
      /* localStorage unavailable */
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  return <ThemeCtx.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error("useTheme must be inside <ThemeProvider>");
  return c;
}
