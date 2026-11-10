import { evaluateWhen, matchKeybinding } from "../input/keybindings";
import type { GoTipeEditor } from "../types/editor";
import type { Extension } from "../types/extension";

/** Extension callbacks intentionally receive the public editor contract. */
export function createExtensionEvents(extensions: Extension[], editor: GoTipeEditor) {
  return {
    input(text: string): boolean {
      for (const extension of extensions)
        for (const rule of extension.inputRules ?? []) {
          const match = text.match(rule.pattern);
          if (match) {
            rule.handler(editor, match);
            return true;
          }
        }
      return false;
    },
    keydown(event: KeyboardEvent, target: HTMLElement): boolean {
      for (const extension of extensions)
        for (const binding of extension.keybindings ?? []) {
          if (
            !matchKeybinding(event, binding.key) ||
            (binding.when && !evaluateWhen(binding.when, target))
          )
            continue;
          if (binding.command(editor) !== false) return true;
        }
      return false;
    },
  };
}
