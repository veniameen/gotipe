"use client";

import { useCallback, useEffect, useState } from "react";
import {
  THEME_STORAGE_KEY,
  type ThemeMode,
  chooseMode,
  followSystem,
  readMode,
  resolve,
} from "./theme-state";

const CHANGE_EVENT = "gotipe-site-theme";
/** The page's one current choice; every control showing it reads and writes this. */
let current: ThemeMode | null = null;

/** The theme choice shared by the head's menu and the narrow-screen menu. */
export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    if (current === null) current = readMode();
    setModeState(current);
    const sync = () => setModeState(current ?? "system");
    const fromOtherTab = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      current = readMode();
      document.documentElement.setAttribute("data-theme", resolve(current));
      sync();
    };
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", fromOtherTab);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", fromOtherTab);
    };
  }, []);

  useEffect(() => {
    if (mode !== "system") return;
    return followSystem(() => {});
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    chooseMode(next);
    current = next;
    setModeState(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [mode, setMode];
}
