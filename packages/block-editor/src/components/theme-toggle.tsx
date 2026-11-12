import { useGoTipeI18n } from "@gotipe/react";
import { type ThemeMode, getTheme, onThemeChange, setTheme } from "@gotipe/theme";
import { useCallback, useEffect, useState } from "react";
import { PageIcon } from "../page/icons";

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => getTheme().mode);
  const i18n = useGoTipeI18n();

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
      aria-label={i18n.t("theme.label")}
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
        aria-label={i18n.t("theme.light")}
        className={mode === "light" ? "active" : ""}
        onClick={handleSetLight}
      >
        <PageIcon name="sun" />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "dark"}
        tabIndex={mode === "dark" ? 0 : -1}
        aria-label={i18n.t("theme.dark")}
        className={mode === "dark" ? "active" : ""}
        onClick={handleSetDark}
      >
        <PageIcon name="moon" />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "system"}
        tabIndex={mode === "system" ? 0 : -1}
        aria-label={i18n.t("theme.system")}
        className={mode === "system" ? "active" : ""}
        onClick={handleSetSystem}
      >
        <PageIcon name="system" />
      </button>
    </div>
  );
}
