export interface ThemeConfig {
  name: string;
  tokens?: Record<string, string>;
}

export type ThemePreset = "minimal" | "modern" | "notion" | "docs";
