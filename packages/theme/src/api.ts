import { darkTheme, lightTheme } from "./presets";
import type { ThemeConfig } from "./types";

export type ThemeMode = "light" | "dark" | "system";

export function defineTheme(config: ThemeConfig): ThemeConfig {
  return config;
}

export function applyTheme(config: ThemeConfig, root?: HTMLElement): void {
  const target = root ?? (typeof document === "undefined" ? undefined : document.documentElement);
  if (!target) return;
  if (config.tokens) {
    for (const [key, value] of Object.entries(config.tokens)) {
      const cssVar = key.startsWith("--gt-") ? key : `--gt-${key}`;
      target.style.setProperty(cssVar, value);
    }
  }
}

interface ThemeState {
  mode: ThemeMode;
  resolved: "light" | "dark";
  generation: number;
  cleanup: (() => void) | null;
  listeners: Set<(mode: ThemeMode, resolved: "light" | "dark") => void>;
}
const roots = new WeakMap<HTMLElement, ThemeState>();
const defaultRoot = () => (typeof document === "undefined" ? undefined : document.documentElement);
const preferredTheme = (): "light" | "dark" =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
function stateOf(target: HTMLElement): ThemeState {
  let state = roots.get(target);
  if (!state) {
    const attribute = target.getAttribute("data-theme");
    state = {
      mode: attribute === "dark" || attribute === "light" ? attribute : "system",
      resolved: attribute === "dark" || attribute === "light" ? attribute : preferredTheme(),
      generation: 0,
      cleanup: null,
      listeners: new Set(),
    };
    roots.set(target, state);
  }
  return state;
}

export function getTheme(root = defaultRoot()): { mode: ThemeMode; resolved: "light" | "dark" } {
  if (!root) return { mode: "system", resolved: "light" };
  const state = stateOf(root);
  return { mode: state.mode, resolved: state.resolved };
}

export function onThemeChange(
  listener: (mode: ThemeMode, resolved: "light" | "dark") => void,
  root = defaultRoot(),
): () => void {
  if (!root) return () => {};
  const state = stateOf(root);
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

/** Returns cleanup for the system listener. A later setTheme owns its own lifetime. */
export function setTheme(mode: ThemeMode, root = defaultRoot()): () => void {
  if (!root) return () => {};
  const state = stateOf(root);
  state.cleanup?.();
  state.cleanup = null;
  state.mode = mode;
  const generation = ++state.generation;
  const apply = (resolved: "light" | "dark") => {
    state.resolved = resolved;
    root.setAttribute("data-theme", resolved);
    applyTheme(resolved === "dark" ? darkTheme : lightTheme, root);
    for (const listener of state.listeners) listener(state.mode, resolved);
  };
  if (mode === "system" && typeof window !== "undefined" && window.matchMedia) {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const change = () => apply(query.matches ? "dark" : "light");
    change();
    query.addEventListener("change", change);
    state.cleanup = () => query.removeEventListener("change", change);
  } else apply(mode === "system" ? preferredTheme() : mode);
  return () => {
    if (state.generation !== generation) return;
    state.cleanup?.();
    state.cleanup = null;
  };
}
