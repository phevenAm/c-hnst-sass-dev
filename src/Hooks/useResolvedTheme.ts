import { useEffect, useState } from "react";

import { useAppSelector } from "@store/hooks";
import { selectThemeMode } from "@store/slices/themeSlice";

const QUERY = "(prefers-color-scheme: dark)";

const systemPrefersDark = (): boolean => {
  try {
    return window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
};

/**
 * The appearance actually in effect right now: "light" or "dark".
 * Resolves the "system" preference against the OS setting and re-renders if
 * the OS setting changes while "system" is selected.
 */
export function useResolvedTheme(): "light" | "dark" {
  const mode = useAppSelector(selectThemeMode);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setPrefersDark(mq.matches);
    mq.addEventListener("change", onChange);
    // resync in case it changed between render and effect
    setPrefersDark(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode;
}
