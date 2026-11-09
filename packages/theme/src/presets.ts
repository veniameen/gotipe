import type { ThemeConfig } from "./types";

export const lightTheme: ThemeConfig = {
  name: "light",
  tokens: {
    // Surface
    "--gt-bg": "#ffffff",
    "--gt-bg-hover": "#f7f7f5",
    "--gt-bg-active": "#efefed",
    "--gt-bg-selected": "#e8f0fe",
    "--gt-bg-code": "#f7f6f3",
    "--gt-bg-callout": "#f7f6f3",

    // Text
    "--gt-text-base": "#1f1f1f",
    "--gt-text-secondary": "#6b6b6b",
    "--gt-text-tertiary": "#a3a3a3",
    "--gt-text-placeholder": "#a3a3a3",
    "--gt-text-link": "#2563eb",
    "--gt-text-code": "#eb5757",

    // Border
    "--gt-border": "#e5e5e5",
    "--gt-border-hover": "#d4d4d4",
    "--gt-border-focus": "#2563eb",
    "--gt-border-divider": "#e5e5e5",
    "--gt-border-light": "rgba(0,0,0,0.05)",

    // Accent
    "--gt-accent": "#2563eb",
    "--gt-accent-hover": "#1d4ed8",
    "--gt-accent-text": "#ffffff",

    // Status
    "--gt-error": "#dc2626",
    "--gt-warning": "#ca8a04",
    "--gt-success": "#16a34a",
    "--gt-info": "#2563eb",

    // Border-radius scale
    "--gt-radius-sm": "6px",
    "--gt-radius-md": "8px",
    "--gt-radius-lg": "12px",
    "--gt-radius-xl": "16px",
    "--gt-radius-card": "20px",

    // Shadows — 4-layer soft elevation
    "--gt-shadow-sm": "0 1px 2px rgba(0,0,0,0.05)",
    "--gt-shadow-md": "0 4px 12px rgba(0,0,0,0.08)",
    "--gt-shadow-lg": "0 8px 24px rgba(0,0,0,0.12)",
    "--gt-shadow-elevated":
      "0px 16px 48px 0px rgba(17,24,39,0.04), 0px 12px 24px 0px rgba(17,24,39,0.04), 0px 6px 8px 0px rgba(17,24,39,0.02), 0px 2px 3px 0px rgba(17,24,39,0.02)",

    // Typography — Inter first
    "--gt-font-body": '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    "--gt-font-mono": '"SF Mono", "Fira Code", "JetBrains Mono", Consolas, monospace',
    "--gt-font-heading": "var(--gt-font-body)",

    // Text size scale
    "--gt-text-xs": "12px",
    "--gt-text-sm": "14px",
    "--gt-text-base-size": "16px",
    "--gt-text-lg": "18px",
    "--gt-text-xl": "20px",
    "--gt-text-2xl": "24px",
    "--gt-text-3xl": "30px",

    // Line heights
    "--gt-line-height-body": "1.5",
    "--gt-letter-spacing": "-0.011em",

    // Spacing scale
    "--gt-space-1": "4px",
    "--gt-space-2": "8px",
    "--gt-space-3": "12px",
    "--gt-space-4": "16px",
    "--gt-space-5": "20px",
    "--gt-space-6": "24px",
    "--gt-space-8": "32px",
    "--gt-space-10": "40px",
    "--gt-space-12": "48px",
    "--gt-space-16": "64px",

    // Legacy spacing aliases
    "--gt-spacing-xs": "4px",
    "--gt-spacing-sm": "8px",
    "--gt-spacing-md": "12px",
    "--gt-spacing-lg": "16px",
    "--gt-spacing-xl": "24px",

    // Editor layout
    "--gt-editor-padding-x": "64px",
    "--gt-editor-padding-y": "48px",
    "--gt-editor-max-width": "720px",
    "--gt-editor-min-height": "200px",

    // Block spacing
    "--gt-block-gap": "4px",
    "--gt-block-indent": "24px",

    // Animation
    "--gt-duration-fast": "100ms",
    "--gt-duration-normal": "150ms",
    "--gt-duration-slow": "200ms",
    "--gt-duration-enter": "200ms",
    "--gt-duration-exit": "100ms",
    "--gt-ease-out": "cubic-bezier(0.16, 1, 0.3, 1)",
    "--gt-ease-in": "cubic-bezier(0.5, 0, 0.75, 0)",
    "--gt-ease-in-out": "cubic-bezier(0.45, 0, 0.55, 1)",
    "--gt-ease-spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",

    // Z-index scale
    "--gt-z-content": "1",
    "--gt-z-block-handle": "10",
    "--gt-z-selection": "20",
    "--gt-z-toolbar": "30",
    "--gt-z-bubble": "40",
    "--gt-z-slash": "50",
    "--gt-z-modal": "60",
    "--gt-z-ai": "70",
    "--gt-z-toast": "80",
    "--gt-z-drag": "100",

    // Collaboration cursors
    "--gt-cursor-1": "#f87171",
    "--gt-cursor-2": "#60a5fa",
    "--gt-cursor-3": "#34d399",
    "--gt-cursor-4": "#fbbf24",
    "--gt-cursor-5": "#a78bfa",
    "--gt-cursor-6": "#fb923c",
    "--gt-cursor-7": "#f472b6",
    "--gt-cursor-8": "#38bdf8",

    // AI
    "--gt-ai-ghost": "#9ca3af",
    "--gt-ai-highlight": "#dbeafe",
    "--gt-ai-border": "#93c5fd",

    // Highlight palette — 5 colors
    "--gt-highlight-blue-bg": "#dbeafe",
    "--gt-highlight-blue-text": "#1e40af",
    "--gt-highlight-green-bg": "#dcfce7",
    "--gt-highlight-green-text": "#166534",
    "--gt-highlight-yellow-bg": "#fef9c3",
    "--gt-highlight-yellow-text": "#854d0e",
    "--gt-highlight-red-bg": "#fecaca",
    "--gt-highlight-red-text": "#991b1b",
    "--gt-highlight-purple-bg": "#f3e8ff",
    "--gt-highlight-purple-text": "#6b21a8",
  },
};

export const darkTheme: ThemeConfig = {
  name: "dark",
  tokens: {
    // Surface
    "--gt-bg": "#191919",
    "--gt-bg-hover": "#222222",
    "--gt-bg-active": "#2d2d2d",
    "--gt-bg-selected": "#1e3a5f",
    "--gt-bg-code": "#2d2d2d",
    "--gt-bg-callout": "#252525",

    // Text
    "--gt-text-base": "#e8e8e8",
    "--gt-text-secondary": "#999999",
    "--gt-text-tertiary": "#666666",
    "--gt-text-placeholder": "#666666",
    "--gt-text-link": "#60a5fa",
    "--gt-text-code": "#f87171",

    // Border
    "--gt-border": "#333333",
    "--gt-border-hover": "#444444",
    "--gt-border-focus": "#60a5fa",
    "--gt-border-divider": "#333333",
    "--gt-border-light": "rgba(255,255,255,0.08)",

    // Accent
    "--gt-accent": "#3b82f6",
    "--gt-accent-hover": "#60a5fa",
    "--gt-accent-text": "#ffffff",

    // Status
    "--gt-error": "#ef4444",
    "--gt-warning": "#eab308",
    "--gt-success": "#22c55e",
    "--gt-info": "#3b82f6",

    // Border-radius scale
    "--gt-radius-sm": "6px",
    "--gt-radius-md": "8px",
    "--gt-radius-lg": "12px",
    "--gt-radius-xl": "16px",
    "--gt-radius-card": "20px",

    // Shadows — dark mode: higher opacity
    "--gt-shadow-sm": "0 1px 2px rgba(0,0,0,0.3)",
    "--gt-shadow-md": "0 4px 12px rgba(0,0,0,0.4)",
    "--gt-shadow-lg": "0 8px 24px rgba(0,0,0,0.5)",
    "--gt-shadow-elevated":
      "0px 16px 48px 0px rgba(0,0,0,0.16), 0px 12px 24px 0px rgba(0,0,0,0.12), 0px 6px 8px 0px rgba(0,0,0,0.08), 0px 2px 3px 0px rgba(0,0,0,0.06)",

    // Typography — Inter first
    "--gt-font-body": '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    "--gt-font-mono": '"SF Mono", "Fira Code", "JetBrains Mono", Consolas, monospace',
    "--gt-font-heading": "var(--gt-font-body)",

    // Text size scale
    "--gt-text-xs": "12px",
    "--gt-text-sm": "14px",
    "--gt-text-base-size": "16px",
    "--gt-text-lg": "18px",
    "--gt-text-xl": "20px",
    "--gt-text-2xl": "24px",
    "--gt-text-3xl": "30px",

    // Line heights
    "--gt-line-height-body": "1.5",
    "--gt-letter-spacing": "-0.011em",

    // Spacing scale
    "--gt-space-1": "4px",
    "--gt-space-2": "8px",
    "--gt-space-3": "12px",
    "--gt-space-4": "16px",
    "--gt-space-5": "20px",
    "--gt-space-6": "24px",
    "--gt-space-8": "32px",
    "--gt-space-10": "40px",
    "--gt-space-12": "48px",
    "--gt-space-16": "64px",

    // Legacy spacing aliases
    "--gt-spacing-xs": "4px",
    "--gt-spacing-sm": "8px",
    "--gt-spacing-md": "12px",
    "--gt-spacing-lg": "16px",
    "--gt-spacing-xl": "24px",

    // Editor layout
    "--gt-editor-padding-x": "64px",
    "--gt-editor-padding-y": "48px",
    "--gt-editor-max-width": "720px",
    "--gt-editor-min-height": "200px",

    // Block spacing
    "--gt-block-gap": "4px",
    "--gt-block-indent": "24px",

    // Animation
    "--gt-duration-fast": "100ms",
    "--gt-duration-normal": "150ms",
    "--gt-duration-slow": "200ms",
    "--gt-duration-enter": "200ms",
    "--gt-duration-exit": "100ms",
    "--gt-ease-out": "cubic-bezier(0.16, 1, 0.3, 1)",
    "--gt-ease-in": "cubic-bezier(0.5, 0, 0.75, 0)",
    "--gt-ease-in-out": "cubic-bezier(0.45, 0, 0.55, 1)",
    "--gt-ease-spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",

    // Z-index scale
    "--gt-z-content": "1",
    "--gt-z-block-handle": "10",
    "--gt-z-selection": "20",
    "--gt-z-toolbar": "30",
    "--gt-z-bubble": "40",
    "--gt-z-slash": "50",
    "--gt-z-modal": "60",
    "--gt-z-ai": "70",
    "--gt-z-toast": "80",
    "--gt-z-drag": "100",

    // Collaboration cursors
    "--gt-cursor-1": "#f87171",
    "--gt-cursor-2": "#60a5fa",
    "--gt-cursor-3": "#34d399",
    "--gt-cursor-4": "#fbbf24",
    "--gt-cursor-5": "#a78bfa",
    "--gt-cursor-6": "#fb923c",
    "--gt-cursor-7": "#f472b6",
    "--gt-cursor-8": "#38bdf8",

    // AI
    "--gt-ai-ghost": "#6b7280",
    "--gt-ai-highlight": "#1e3a5f",
    "--gt-ai-border": "#2563eb",

    // Highlight palette — dark mode adapted
    "--gt-highlight-blue-bg": "#1e3a5f",
    "--gt-highlight-blue-text": "#93c5fd",
    "--gt-highlight-green-bg": "#14532d",
    "--gt-highlight-green-text": "#86efac",
    "--gt-highlight-yellow-bg": "#422006",
    "--gt-highlight-yellow-text": "#fde68a",
    "--gt-highlight-red-bg": "#450a0a",
    "--gt-highlight-red-text": "#fca5a5",
    "--gt-highlight-purple-bg": "#3b0764",
    "--gt-highlight-purple-text": "#d8b4fe",
  },
};
