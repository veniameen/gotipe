import type { ReactNode } from "react";

/**
 * Line icons of the document blocks: the GoTipe set — a 16 grid, 1.5 strokes, `currentColor`.
 * Sized by `--gt-icon-size` in the theme.
 */
export type ContentIconName =
  | "copy"
  | "check"
  | "chevron"
  | "info"
  | "warning"
  | "error"
  | "success"
  | "note"
  | "plus"
  | "link"
  | "external"
  | "page";

const PATHS: Record<ContentIconName, ReactNode> = {
  copy: (
    <>
      <rect x="5.25" y="5.25" width="7.5" height="7.5" rx="1.75" />
      <path d="M10.75 5.25v-.5a1.5 1.5 0 0 0-1.5-1.5h-4.5a1.5 1.5 0 0 0-1.5 1.5v4.5a1.5 1.5 0 0 0 1.5 1.5h.5" />
    </>
  ),
  check: <path d="M3.75 8.25 6.5 11l5.75-6.25" />,
  chevron: <path d="M6.25 4.5 9.75 8l-3.5 3.5" />,
  info: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 7.25v3.5" />
      <circle cx="8" cy="5.25" r=".75" fill="currentColor" stroke="none" />
    </>
  ),
  warning: (
    <>
      <path d="M7.13 2.9a1 1 0 0 1 1.74 0l5.53 9.6a1 1 0 0 1-.87 1.5H2.47a1 1 0 0 1-.87-1.5Z" />
      <path d="M8 6.25v3" />
      <circle cx="8" cy="11.4" r=".8" fill="currentColor" stroke="none" />
    </>
  ),
  error: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5.25v3.5" />
      <circle cx="8" cy="10.75" r=".75" fill="currentColor" stroke="none" />
    </>
  ),
  success: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M5.75 8.1 7.4 9.75l2.9-3.25" />
    </>
  ),
  note: (
    <path d="M4.75 2.75h6.5a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5h-6.5a1.5 1.5 0 0 1-1.5-1.5v-7.5a1.5 1.5 0 0 1 1.5-1.5ZM5.75 6h4.5M5.75 8.5h4.5M5.75 11h2.5" />
  ),
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  link: (
    <path d="M7 9a3 3 0 0 0 4.25.25l1.75-1.75a3 3 0 0 0-4.25-4.25l-.9.9M9 7a3 3 0 0 0-4.25-.25L3 8.5a3 3 0 0 0 4.25 4.25l.9-.9" />
  ),
  page: (
    <path d="M5 2.75h3.75l3 3v6.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1ZM8.75 2.75v2a1 1 0 0 0 1 1h2M6.25 8.75h3.5M6.25 10.75h2.5" />
  ),
  external: (
    <path d="M9.25 3.25h3.5v3.5M12.75 3.25 7.5 8.5M11 9.75V12a1 1 0 0 1-1 1H4.25a1 1 0 0 1-1-1V6.25a1 1 0 0 1 1-1H6.5" />
  ),
};

export function ContentIcon({ name }: { name: ContentIconName }) {
  return (
    <svg
      className="gotipe-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

const CALLOUT_ICONS: Record<string, ContentIconName> = {
  info: "info",
  important: "info",
  warning: "warning",
  error: "error",
  caution: "error",
  success: "success",
  tip: "success",
  note: "note",
  agent: "note",
};

/** The glyph of a callout without its own emoji: the kind of the callout. */
export function calloutIconOf(variant: string): ContentIconName {
  return CALLOUT_ICONS[variant] ?? "info";
}
