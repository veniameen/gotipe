"use client";

import { useRef } from "react";
import { Icon } from "./icon";
import { useThemeToggle } from "./use-theme-toggle";

/**
 * The head's theme button (Atlas frame 20: a quiet icon button): one click turns the page light
 * or dark, no menu. The icon shows where a click leads, the moon on a light page and the sun on a
 * dark one; CSS picks it from `data-theme`, so the server HTML is right before React starts.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { dark, toggle } = useThemeToggle();
  const button = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={button}
      type="button"
      className={`site-button is-quiet site-head-button is-icon ${className}`}
      aria-label="Dark theme"
      aria-pressed={dark ?? undefined}
      onClick={() => toggle(button.current)}
    >
      <span className="site-theme-icons">
        <Icon name="moon" className="site-icon site-theme-to-dark" />
        <Icon name="sun" className="site-icon site-theme-to-light" />
      </span>
    </button>
  );
}
