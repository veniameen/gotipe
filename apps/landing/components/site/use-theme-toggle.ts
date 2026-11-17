"use client";

import { useCallback, useEffect, useState } from "react";
import type { ResolvedTheme } from "./theme-state";
import { systemTheme } from "./theme-state";
import { useThemeMode } from "./use-theme-mode";

const shown = (): ResolvedTheme =>
  document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

/**
 * One click turns the page light or dark. Turning to the system's own theme follows the system
 * again. Where the browser can, the new theme opens as a circle from the control that turned it
 * (base.css, `site-theme-reveal`); a reader who asked for less motion gets it at once. `dark` is
 * null until the page has started: the server cannot know the theme.
 */
export function useThemeToggle(): {
  dark: boolean | null;
  toggle: (from?: Element | null) => void;
} {
  const [, setMode] = useThemeMode();
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(shown() === "dark");
    sync();
    const theme = new MutationObserver(sync);
    theme.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => theme.disconnect();
  }, []);

  const toggle = useCallback(
    (from?: Element | null) => {
      const next: ResolvedTheme = shown() === "dark" ? "light" : "dark";
      const turn = () => setMode(next === systemTheme() ? "system" : next);
      const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      if (still || typeof document.startViewTransition !== "function") {
        turn();
        return;
      }
      const root = document.documentElement;
      const box = from?.getBoundingClientRect();
      root.style.setProperty("--site-theme-x", `${box ? box.left + box.width / 2 : innerWidth}px`);
      root.style.setProperty("--site-theme-y", `${box ? box.top + box.height / 2 : 0}px`);
      document.startViewTransition(turn);
    },
    [setMode],
  );

  return { dark, toggle };
}
