import type React from "react";

/**
 * Glyphs of the emoji picker and the formula popover from the shared GoTipe set (Atlas
 * `icons.svg`, frames 23–24): 16×16, 1.5 px strokes, `currentColor`, sized by `--gt-icon-size`.
 */
export type AtomIconName =
  | "clock"
  | "smile"
  | "leaf"
  | "cup"
  | "ball"
  | "pin"
  | "bulb"
  | "heart"
  | "flag"
  | "image"
  | "search"
  | "check"
  | "page";

const PATHS: Record<AtomIconName, React.ReactNode> = {
  clock: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3.25l2 1.25" />
    </>
  ),
  smile: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M5.75 9.5a2.75 2.75 0 0 0 4.5 0" />
      <g fill="currentColor" stroke="none">
        <circle cx="6.1" cy="6.6" r="0.75" />
        <circle cx="9.9" cy="6.6" r="0.75" />
      </g>
    </>
  ),
  leaf: <path d="M3.25 12.75C3.25 7 6.75 3.25 12.75 3.25c0 6-3.75 9.5-9.5 9.5ZM3.25 12.75l5-5" />,
  cup: (
    <path d="M3.25 6.25h7.5V9.5a3.25 3.25 0 0 1-3.25 3.25h-1A3.25 3.25 0 0 1 3.25 9.5ZM10.75 7.25h.5a1.75 1.75 0 0 1 0 3.5h-.75M5.5 2.75v1.5M8.5 2.75v1.5" />
  ),
  ball: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M4.1 4.1c2.15 2.15 2.15 5.65 0 7.8M11.9 4.1c-2.15 2.15-2.15 5.65 0 7.8" />
    </>
  ),
  pin: (
    <>
      <path d="M8 13.75s4.25-3.9 4.25-7.25a4.25 4.25 0 0 0-8.5 0c0 3.35 4.25 7.25 4.25 7.25Z" />
      <circle cx="8" cy="6.5" r="1.5" />
    </>
  ),
  bulb: <path d="M5.75 11.25V9.6a4 4 0 1 1 4.5 0v1.65ZM6.5 13.25h3" />,
  heart: <path d="M8 13 3.1 8.1a2.9 2.9 0 0 1 4.1-4.1l.8.8.8-.8a2.9 2.9 0 0 1 4.1 4.1Z" />,
  flag: <path d="M3.75 13.25V2.75M3.75 3.25h8.5l-2 3 2 3h-8.5" />,
  image: (
    <>
      <rect x="2.25" y="3" width="11.5" height="10" rx="1.5" />
      <circle cx="6" cy="6.5" r="1.1" />
      <path d="m2.75 12 3.5-3.25 2.5 2.25 1.75-1.5 2.75 2.5" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3 3" />
    </>
  ),
  check: <path d="M3.75 8.25 6.5 11l5.75-6.25" />,
  page: (
    <path d="M5 2.75h3.75l3 3v6.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1ZM8.75 2.75v2a1 1 0 0 0 1 1h2M6.25 8.75h3.5M6.25 10.75h2.5" />
  ),
};

export function AtomIcon({ name }: { name: AtomIconName }) {
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
