// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { getTheme, onThemeChange, setTheme } from "./api";

afterEach(() => vi.unstubAllGlobals());
it("keeps independent theme roots and system subscriptions isolated", () => {
  const callbacks = new Set<() => void>();
  const query = {
    matches: false,
    addEventListener: (_: string, listener: () => void) => callbacks.add(listener),
    removeEventListener: (_: string, listener: () => void) => callbacks.delete(listener),
  };
  vi.stubGlobal("matchMedia", () => query);
  const left = document.createElement("div");
  const right = document.createElement("div");
  const changed = vi.fn();
  const off = onThemeChange(changed, left);
  const dispose = setTheme("system", left);
  setTheme("dark", right);
  expect(getTheme(left)).toEqual({ mode: "system", resolved: "light" });
  expect(getTheme(right)).toEqual({ mode: "dark", resolved: "dark" });
  expect(callbacks.size).toBe(1);
  query.matches = true;
  for (const callback of callbacks) callback();
  expect(getTheme(left).resolved).toBe("dark");
  expect(changed).toHaveBeenLastCalledWith("system", "dark");
  dispose();
  off();
  expect(callbacks.size).toBe(0);
});
it("an obsolete cleanup cannot dispose a newer system listener", () => {
  const callbacks = new Set<() => void>();
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: (_: string, cb: () => void) => callbacks.add(cb),
    removeEventListener: (_: string, cb: () => void) => callbacks.delete(cb),
  }));
  const root = document.createElement("div");
  const old = setTheme("system", root);
  const current = setTheme("system", root);
  old();
  expect(callbacks.size).toBe(1);
  current();
  expect(callbacks.size).toBe(0);
});
