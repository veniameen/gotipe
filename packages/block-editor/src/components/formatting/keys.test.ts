import { TextAlign } from "@gotipe/core/extensions";
import { FullPreset } from "@gotipe/core/presets";
import { describe, expect, it } from "vitest";
import { ALIGN_KEYS, BLOCK_KEYS, HISTORY_KEYS, MARK_KEYS, ariaKeys, keyLabel } from "./keys";

type WithKeys = { keybindings?: { key: string }[] };
const bound = new Set(
  (FullPreset as unknown as WithKeys[]).flatMap((extension) =>
    (extension.keybindings ?? []).map((binding) => binding.key.toLowerCase()),
  ),
);

describe("shown keys", () => {
  it("are bound by the core extensions", () => {
    for (const key of [
      ...Object.values(MARK_KEYS),
      ...Object.values(BLOCK_KEYS),
      ...Object.values(HISTORY_KEYS),
    ])
      expect(bound, key).toContain(key);
    const align = (TextAlign.keybindings ?? []).map((binding) => binding.key.toLowerCase());
    for (const key of Object.values(ALIGN_KEYS)) expect(align, key).toContain(key);
  });

  it("read as the platform writes them", () => {
    expect(keyLabel("mod-shift-x", true)).toBe("⇧⌘X");
    expect(keyLabel("mod-alt-1", true)).toBe("⌥⌘1");
    expect(keyLabel("mod-shift-x", false)).toBe("Ctrl+Shift+X");
    expect(ariaKeys("mod-b", true)).toBe("Meta+B");
    expect(ariaKeys("mod-alt-2", false)).toBe("Control+Alt+2");
  });
});
