/**
 * Keys of the find bar (Atlas frame 25). `Mod+F` finds and `Mod+Alt+F` finds and replaces — not
 * `Mod+H`, which hides the window on macOS and is `Mod+Shift+H` highlight's neighbour. They are
 * taken only while the editor or the bar has focus, so the browser's own search works elsewhere.
 */
export const FIND_KEYS = { find: "mod-f", replace: "mod-alt-f" } as const;

const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

/** Which bar a key press asks for. The physical key counts, so any keyboard layout works. */
export function findShortcut(
  event: Pick<KeyboardEvent, "code" | "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  mac = isMac(),
): "find" | "replace" | null {
  const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  const letter = event.code ? event.code === "KeyF" : event.key.toLowerCase() === "f";
  if (!mod || !letter || event.shiftKey) return null;
  return event.altKey ? "replace" : "find";
}
