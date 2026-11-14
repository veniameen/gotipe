import type React from "react";
import { AtomIcon } from "../../atoms/icons";
import { PageIcon, type PageIconName } from "../../page/icons";

/** Icons of slash commands from the shared GoTipe set (Atlas frame 7). */
const ICONS: Record<string, PageIconName> = {
  sparkles: "sparkle",
  sparkle: "sparkle",
  type: "text",
  "heading-1": "h1",
  "heading-2": "h2",
  "heading-3": "h3",
  list: "bullet",
  "list-ordered": "numbered",
  "check-square": "todo",
  quote: "quote",
  code: "code",
  table: "table",
  minus: "divider",
  image: "image",
  paperclip: "file",
  "alert-circle": "callout",
  "chevron-right": "toggle",
  columns: "columns",
  "external-link": "link",
  "function-square": "math",
  function: "math",
};

/** The Markdown shortcut that inserts the same block, shown at the right of its row. */
const SHORTCUTS: Record<string, string> = {
  "heading-1": "#",
  "heading-2": "##",
  "heading-3": "###",
  list: "-",
  "list-ordered": "1.",
  "check-square": "[]",
  quote: ">",
  code: "```",
  minus: "---",
};

export function renderIcon(icon: string, name: string): React.ReactNode {
  if (icon.toLowerCase() === "smile") return <AtomIcon name="smile" />;
  const known = ICONS[icon.toLowerCase()];
  if (known) return <PageIcon name={known} />;
  const fallback = name.trim().charAt(0).toUpperCase() || "•";
  return <span className="gotipe-slash-menu-item-icon-text">{fallback}</span>;
}

export function markdownShortcut(icon: string): string | null {
  return SHORTCUTS[icon.toLowerCase()] ?? null;
}

export function isAccentIcon(icon: string, name: string): boolean {
  const key = icon.toLowerCase();
  if (key === "sparkles" || key === "sparkle") return true;
  return name.toLowerCase().includes("ai");
}
