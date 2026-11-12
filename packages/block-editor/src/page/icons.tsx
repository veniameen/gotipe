import type React from "react";

/**
 * Line icons for the page editor: 16×16, 1.5px strokes, `currentColor`.
 * Sized by `--gt-icon-size`.
 */
export type PageIconName =
  | "image"
  | "file"
  | "text"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "todo"
  | "quote"
  | "code"
  | "table"
  | "divider"
  | "callout"
  | "check"
  | "chevron"
  | "grip"
  | "trash"
  | "duplicate"
  | "up"
  | "down"
  | "link"
  | "bold"
  | "italic"
  | "strike"
  | "inlineCode"
  | "hash"
  | "skill"
  | "tool"
  | "user"
  | "send"
  | "close"
  | "warning"
  | "markdown"
  | "plus"
  | "copy"
  | "more"
  | "info"
  | "sun"
  | "moon"
  | "system"
  | "underline"
  | "unlink"
  | "letter"
  | "sparkle"
  | "chevronRight"
  | "swap"
  | "restore"
  | "toggle"
  | "columns"
  | "math"
  | "chevronLeft"
  | "lock"
  | "undo"
  | "redo"
  | "indent"
  | "outdent";

const PATHS: Record<PageIconName, React.ReactNode> = {
  image: (
    <>
      <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="2" />
      <circle cx="5.75" cy="6.25" r="1.1" />
      <path d="M2.75 11.25l3.1-2.85 2.4 2.1 2.05-1.75 2.95 2.6" />
    </>
  ),
  file: (
    <path d="M10.4 6.6 6.3 10.7a1.6 1.6 0 0 1-2.3-2.3l4.9-4.9a2.6 2.6 0 0 1 3.7 3.7l-5 5a3.6 3.6 0 0 1-5.1-5.1l3.9-3.9" />
  ),
  text: (
    <path d="M2.5 12.25 5.25 4.5 8 12.25M3.5 9.75h3.5M10.25 8.4c.5-.5 1.1-.7 1.8-.7 1.1 0 1.7.6 1.7 1.7v2.85M13.75 10.6c-.55-.2-1.05-.3-1.6-.3-1 0-1.65.45-1.65 1.15s.55 1.05 1.25 1.05c.85 0 1.6-.5 2-1.3" />
  ),
  h1: <path d="M2.5 4v8M7.5 4v8M2.5 8h5M11 6.25 12.75 5v7" />,
  h2: (
    <path d="M2.5 4v8M7.5 4v8M2.5 8h5M10.25 6.1c.35-.75 1-1.1 1.8-1.1 1 0 1.7.65 1.7 1.6 0 .7-.35 1.2-1.05 1.85L10.25 11.9h3.6" />
  ),
  h3: (
    <path d="M2.5 4v8M7.5 4v8M2.5 8h5M10.25 5.25h3.25l-1.8 2.3c1.1 0 1.95.65 1.95 1.75 0 1.2-.9 1.95-2 1.95-.75 0-1.35-.3-1.65-.85" />
  ),
  bullet: (
    <>
      <circle cx="3.5" cy="4.5" r=".9" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="11.5" r=".9" fill="currentColor" stroke="none" />
      <path d="M6.5 4.5h7M6.5 11.5h7" />
    </>
  ),
  numbered: (
    <path d="M6.5 4.5h7M6.5 11.5h7M2.75 3.25l1-.6v3.6M2.6 10.4c.2-.4.55-.6 1-.6.55 0 .95.35.95.85 0 .4-.2.65-.6 1.05l-1.3 1.3h1.95" />
  ),
  todo: (
    <>
      <rect x="2.75" y="2.75" width="10.5" height="10.5" rx="2.25" />
      <path d="m5.6 8.1 1.65 1.65 3.2-3.5" />
    </>
  ),
  quote: <path d="M3 3.5v9M6.25 5.5h6.75M6.25 8h6.75M6.25 10.5h4.5" />,
  code: <path d="m5.75 4.75-3.25 3.25 3.25 3.25M10.25 4.75l3.25 3.25-3.25 3.25" />,
  table: (
    <>
      <rect x="2.25" y="3" width="11.5" height="10" rx="1.75" />
      <path d="M2.25 6.5h11.5M2.25 9.75h11.5M6.25 6.5V13" />
    </>
  ),
  divider: <path d="M2.25 8h11.5M2.25 4.5h11.5M2.25 11.5h11.5" opacity=".9" />,
  callout: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 7.25v3.5M8 5.15v.1" />
    </>
  ),
  check: <path d="m3.5 8.25 2.9 2.9 6.1-6.4" />,
  chevron: <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />,
  grip: (
    <>
      <circle cx="5.75" cy="4" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="10.25" cy="4" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="5.75" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="10.25" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="5.75" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="10.25" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  trash: (
    <path d="M3 4.5h10M6.25 4.5V3.25h3.5V4.5M4.5 4.5l.6 8.25h5.8l.6-8.25M6.75 7v3.5M9.25 7v3.5" />
  ),
  duplicate: (
    <>
      <rect x="5.25" y="5.25" width="8.5" height="8.5" rx="1.75" />
      <path d="M10.75 5.25V3.5a1.25 1.25 0 0 0-1.25-1.25H3.5A1.25 1.25 0 0 0 2.25 3.5v6c0 .7.55 1.25 1.25 1.25h1.75" />
    </>
  ),
  up: <path d="M8 13V3.5M4.25 7.25 8 3.5l3.75 3.75" />,
  down: <path d="M8 3v9.5M4.25 8.75 8 12.5l3.75-3.75" />,
  link: (
    <path d="m6.75 9.25 2.5-2.5M7.4 4.6l.9-.9a2.6 2.6 0 0 1 3.7 3.7l-.9.9M8.6 11.4l-.9.9A2.6 2.6 0 0 1 4 8.6l.9-.9" />
  ),
  bold: <path d="M4.5 3h4.25a2.4 2.4 0 0 1 0 4.8H4.5zM4.5 7.8h4.9a2.6 2.6 0 0 1 0 5.2H4.5z" />,
  italic: <path d="M9.75 3H6.5M9.5 13H6.25M9.25 3l-2.5 10" />,
  strike: (
    <path d="M2.75 8h10.5M11 4.75C10.6 3.7 9.5 3 8 3 6.2 3 5 4 5 5.3c0 .9.5 1.55 1.6 2.05M5 11.1c.45 1.15 1.6 1.9 3.1 1.9 1.9 0 3.15-1 3.15-2.45 0-.5-.15-.95-.45-1.3" />
  ),
  inlineCode: (
    <path d="m5.75 4.75-3.25 3.25 3.25 3.25M10.25 4.75l3.25 3.25-3.25 3.25M9.1 3.5 6.9 12.5" />
  ),
  hash: <path d="M5.75 2.75 4.5 13.25M11.5 2.75l-1.25 10.5M2.75 6h11M2.25 10h11" />,
  skill: <path d="M8 2.25 13.25 5v6L8 13.75 2.75 11V5zM2.75 5 8 7.75 13.25 5M8 7.75v6" />,
  tool: (
    <>
      <rect x="2.25" y="3" width="11.5" height="10" rx="1.75" />
      <path d="m4.75 6.25 1.9 1.75-1.9 1.75M8.25 10.25h3" />
    </>
  ),
  user: (
    <>
      <circle cx="8" cy="5.75" r="2.5" />
      <path d="M3.25 13.25c.6-2.05 2.5-3.25 4.75-3.25s4.15 1.2 4.75 3.25" />
    </>
  ),
  send: <path d="M8 12.75V3.5M4.25 7.25 8 3.5l3.75 3.75" />,
  close: <path d="m4.25 4.25 7.5 7.5M11.75 4.25l-7.5 7.5" />,
  warning: <path d="M8 2.75 14 13H2zM8 6.75v3M8 11.4v.1" />,
  markdown: (
    <>
      <rect x="1.75" y="3.5" width="12.5" height="9" rx="1.75" />
      <path d="M4.25 10.25v-4l1.75 2 1.75-2v4M10.75 6.25v4M9.25 8.75l1.5 1.5 1.5-1.5" />
    </>
  ),
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  copy: (
    <>
      <rect x="5.25" y="5.25" width="7.5" height="7.5" rx="1.75" />
      <path d="M10.75 5.25v-.5a1.5 1.5 0 0 0-1.5-1.5h-4.5a1.5 1.5 0 0 0-1.5 1.5v4.5a1.5 1.5 0 0 0 1.5 1.5h.5" />
    </>
  ),
  more: (
    <>
      <circle cx="3.75" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12.25" cy="8" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 7.25v3.5" />
      <circle cx="8" cy="5.25" r=".75" fill="currentColor" stroke="none" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05" />
    </>
  ),
  moon: <path d="M12.9 9.6A5.25 5.25 0 0 1 6.4 3.1a5.25 5.25 0 1 0 6.5 6.5Z" />,
  system: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5a5.5 5.5 0 0 0 0 11Z" fill="currentColor" stroke="none" />
    </>
  ),
  underline: <path d="M5 3v4.5a3 3 0 0 0 6 0V3M4 13.25h8" />,
  unlink: (
    <path d="M8.75 4.15l.9-.9a3 3 0 0 1 4.25 4.25l-.9.9M7.25 11.85l-.9.9A3 3 0 0 1 2.1 8.5l.9-.9M2.75 2.75l10.5 10.5" />
  ),
  letter: <path d="M4.75 11.5 8 3.5l3.25 8M6 8.75h4" />,
  sparkle: (
    <path d="M7 3c.45 2.4 1.6 3.55 4 4-2.4.45-3.55 1.6-4 4-.45-2.4-1.6-3.55-4-4 2.4-.45 3.55-1.6 4-4ZM12.25 1.75v3M10.75 3.25h3" />
  ),
  chevronRight: <path d="M6.25 4.5 9.75 8l-3.5 3.5" />,
  swap: <path d="M3.25 5.5h9l-2.25-2.25M12.75 10.5h-9l2.25 2.25" />,
  restore: <path d="M3.25 8a4.75 4.75 0 1 0 1.4-3.35M3.25 3.25v2.5h2.5" />,
  toggle: <path d="M3 4.25 5 6 3 7.75M7.5 6h6M7.5 10.5h6" />,
  columns: (
    <>
      <rect x="2.25" y="3" width="5" height="10" rx="1.25" />
      <rect x="8.75" y="3" width="5" height="10" rx="1.25" />
    </>
  ),
  math: (
    <path d="M10.5 3.25H8.9a1.6 1.6 0 0 0-1.58 1.33L5.9 12.4a1.6 1.6 0 0 1-1.58 1.35H3.5M5 7h5" />
  ),
  chevronLeft: <path d="M9.75 4.5 6.25 8l3.5 3.5" />,
  lock: (
    <>
      <rect x="3.25" y="7.25" width="9.5" height="6.5" rx="1.75" />
      <path d="M5.25 7.25V5.5a2.75 2.75 0 0 1 5.5 0v1.75" />
    </>
  ),
  undo: <path d="M5.75 4 3 6.75 5.75 9.5M3 6.75h6.5a3.25 3.25 0 0 1 0 6.5H7.5" />,
  redo: <path d="M10.25 4 13 6.75 10.25 9.5M13 6.75H6.5a3.25 3.25 0 0 0 0 6.5h2" />,
  indent: <path d="M2.75 3.75h10.5M7.25 8h6M2.75 12.25h10.5M2.75 6.25 4.75 8l-2 1.75" />,
  outdent: <path d="M2.75 3.75h10.5M7.25 8h6M2.75 12.25h10.5M4.75 6.25 2.75 8l2 1.75" />,
};

export function PageIcon({ name, className }: { name: PageIconName; className?: string }) {
  return (
    <svg
      className={className ? `gotipe-icon ${className}` : "gotipe-icon"}
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
