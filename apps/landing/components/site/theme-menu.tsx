"use client";

import { type KeyboardEvent, useCallback, useId, useMemo, useRef, useState } from "react";
import { Icon } from "./icon";
import { MODE_LABEL, THEME_MODES, type ThemeMode } from "./theme-state";
import { useDismiss } from "./use-dismiss";
import { useThemeMode } from "./use-theme-mode";

/**
 * The head's theme button (Atlas frame 20: a quiet icon button) and its menu of three choices.
 * The icon shows where a click leads: the moon on a light page, the sun on a dark one; CSS picks
 * it from `data-theme`, so the server HTML is right before React starts.
 */
export function ThemeMenu({ className = "" }: { className?: string }) {
  const [mode, setMode] = useThemeMode();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const parts = useMemo(() => [button, menu], []);
  const menuId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }, []);
  useDismiss(open, parts, close);

  const focusItem = (index: number) => {
    const items = menu.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']");
    if (!items?.length) return;
    items[(index + items.length) % items.length]?.focus();
  };
  const openMenu = () => {
    setOpen(true);
    requestAnimationFrame(() => focusItem(THEME_MODES.indexOf(mode)));
  };
  const choose = (next: ThemeMode) => {
    setMode(next);
    close(true);
  };
  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']") ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      focusItem(moves[event.key] ?? 0);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className={`site-theme ${className}`}>
      <button
        ref={button}
        type="button"
        className="site-button is-quiet site-head-button is-icon"
        aria-label={`Theme: ${MODE_LABEL[mode]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        <Icon name="moon" className="site-icon site-theme-to-dark" />
        <Icon name="sun" className="site-icon site-theme-to-light" />
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          className="site-menu site-theme-menu"
          role="menu"
          aria-label="Theme"
          onKeyDown={onMenuKey}
        >
          {THEME_MODES.map((item) => (
            <button
              key={item}
              type="button"
              role="menuitemradio"
              aria-checked={mode === item}
              tabIndex={-1}
              className="site-menu-item"
              onClick={() => choose(item)}
            >
              {MODE_LABEL[item]}
              {mode === item && <Icon name="check-16" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
