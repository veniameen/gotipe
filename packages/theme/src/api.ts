import type { IconSet, ThemeConfig } from "./types";
import { darkTheme, lightTheme } from "./presets";

export type ThemeMode = "light" | "dark" | "system";

export function defineTheme(config: ThemeConfig): ThemeConfig {
  return config;
}

export function defineIcons(icons: IconSet): IconSet {
  return icons;
}

export function applyTheme(config: ThemeConfig, root?: HTMLElement): void {
  const target = root ?? document.documentElement;
  if (config.tokens) {
    for (const [key, value] of Object.entries(config.tokens)) {
      const cssVar = key.startsWith("--gt-") ? key : `--gt-${key}`;
      target.style.setProperty(cssVar, value);
    }
  }
}

let currentMode: ThemeMode = "system";
let systemThemeCleanup: (() => void) | null = null;
const listeners: Set<(mode: ThemeMode, resolved: "light" | "dark") => void> = new Set();

function getResolvedTheme(root?: HTMLElement): "light" | "dark" {
  const target = root ?? document.documentElement;
  return (target.getAttribute("data-theme") as "light" | "dark") ?? "light";
}

export function getTheme(): { mode: ThemeMode; resolved: "light" | "dark" } {
  return { mode: currentMode, resolved: getResolvedTheme() };
}

export function onThemeChange(
  listener: (mode: ThemeMode, resolved: "light" | "dark") => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(resolved: "light" | "dark") {
  for (const listener of listeners) {
    listener(currentMode, resolved);
  }
}

export function setTheme(
  mode: ThemeMode,
  root?: HTMLElement,
): void {
  const target = root ?? document.documentElement;
  currentMode = mode;

  if (systemThemeCleanup) {
    systemThemeCleanup();
    systemThemeCleanup = null;
  }

  if (mode === "system") {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = mql.matches ? "dark" : "light";
      target.setAttribute("data-theme", resolved);
      applyTheme(mql.matches ? darkTheme : lightTheme, target);
      notifyListeners(resolved);
    };
    apply();
    mql.addEventListener("change", apply);
    systemThemeCleanup = () => mql.removeEventListener("change", apply);
  } else {
    target.setAttribute("data-theme", mode);
    applyTheme(mode === "dark" ? darkTheme : lightTheme, target);
    notifyListeners(mode);
  }
}
