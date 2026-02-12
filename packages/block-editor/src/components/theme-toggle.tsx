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
    <div className="gotipe-theme-toggle" role="radiogroup" aria-label="Theme">
      <button
        type="button"
        role="radio"
        aria-checked={mode === "light"}
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
        aria-label="System theme"
        className={mode === "system" ? "active" : ""}
        onClick={handleSetSystem}
      >
        ⊙
      </button>
    </div>
  );
}
