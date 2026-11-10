import { type ThemeMode, getTheme, onThemeChange, setTheme } from "@gotipe/theme";
import { useCallback, useEffect, useState } from "react";

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => getTheme().mode);

  useEffect(() => {
    return onThemeChange((newMode) => setMode(newMode));
  }, []);

  const handleSetLight = useCallback(() => setTheme("light"), []);
  const handleSetDark = useCallback(() => setTheme("dark"), []);
  const handleSetSystem = useCallback(() => setTheme("system"), []);

  return (
    <div
      className="gotipe-theme-toggle"
      role="radiogroup"
      aria-label="Theme"
      onKeyDown={(event) => {
        const modes: ThemeMode[] = ["light", "dark", "system"];
        const direction = ["ArrowRight", "ArrowDown"].includes(event.key)
          ? 1
          : ["ArrowLeft", "ArrowUp"].includes(event.key)
            ? -1
            : 0;
        if (!direction && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const index =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? 2
              : (modes.indexOf(mode) + direction + modes.length) % modes.length;
        setTheme(modes[index]!);
        event.currentTarget
          .querySelectorAll<HTMLButtonElement>('button[role="radio"]')
          [index]?.focus();
      }}
    >
      <button
        type="button"
        role="radio"
        aria-checked={mode === "light"}
        tabIndex={mode === "light" ? 0 : -1}
        aria-label="Light theme"
        className={mode === "light" ? "active" : ""}
        onClick={handleSetLight}
      >
        ☀
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "dark"}
        tabIndex={mode === "dark" ? 0 : -1}
        aria-label="Dark theme"
        className={mode === "dark" ? "active" : ""}
        onClick={handleSetDark}
      >
        ☾
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "system"}
        tabIndex={mode === "system" ? 0 : -1}
        aria-label="System theme"
        className={mode === "system" ? "active" : ""}
        onClick={handleSetSystem}
      >
        ⊙
      </button>
    </div>
  );
}
