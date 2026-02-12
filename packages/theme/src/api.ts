import type { IconSet, ThemeConfig } from "./types";

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
