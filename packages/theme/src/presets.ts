import tokens from "./design-tokens.json";
import type { ThemeConfig } from "./types";

/** PageEditor and all other controls use one semantic palette. */
export const lightTheme: ThemeConfig = {
  name: "light",
  tokens: { ...tokens.shared, ...tokens.light },
};
export const darkTheme: ThemeConfig = {
  name: "dark",
  tokens: { ...tokens.shared, ...tokens.dark },
};
