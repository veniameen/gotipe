/**
 * Keys shown in menus and tooltips (GoTipe Atlas: a menu shows only keys that are bound). They are
 * the core extensions' keybindings; keys.test.ts keeps the two in step.
 */
export const MARK_KEYS = {
  bold: "mod-b",
  italic: "mod-i",
  underline: "mod-u",
  strikethrough: "mod-shift-x",
  code: "mod-e",
  link: "mod-k",
  highlight: "mod-shift-h",
} as const;

/** `TextAlign` (Atlas frame 27: the alignment group of «More»). */
export const ALIGN_KEYS = {
  left: "mod-shift-l",
  center: "mod-shift-e",
  right: "mod-shift-r",
  justify: "mod-shift-j",
} as const;

export const BLOCK_KEYS: Record<string, string> = {
  "heading:1": "mod-alt-1",
  "heading:2": "mod-alt-2",
  "heading:3": "mod-alt-3",
  orderedList: "mod-shift-7",
  bulletList: "mod-shift-8",
  todoList: "mod-shift-9",
  blockquote: "mod-shift-b",
};

const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

/** «⌥⇧⌘X» on Apple systems, «Ctrl+Shift+X» elsewhere. */
export function keyLabel(binding: string, mac = isMac()): string {
  const parts = binding.toLowerCase().split("-");
  const main = (parts.pop() ?? "").toUpperCase();
  const has = (part: string) => parts.includes(part);
  if (mac)
    return `${has("alt") ? "⌥" : ""}${has("shift") ? "⇧" : ""}${has("mod") ? "⌘" : ""}${main}`;
  return [has("mod") && "Ctrl", has("alt") && "Alt", has("shift") && "Shift", main]
    .filter(Boolean)
    .join("+");
}

/** The value of aria-keyshortcuts for a binding. */
export function ariaKeys(binding: string, mac = isMac()): string {
  const parts = binding.toLowerCase().split("-");
  const main = (parts.pop() ?? "").toUpperCase();
  const names = parts.map((part) =>
    part === "mod" ? (mac ? "Meta" : "Control") : part === "alt" ? "Alt" : "Shift",
  );
  return [...names, main].join("+");
}
