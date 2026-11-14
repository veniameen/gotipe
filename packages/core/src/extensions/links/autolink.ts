import { GoTipeError } from "../../error";
import type { GoTipeEditor } from "../../types/editor";
import { type Extension, defineExtension } from "../../types/extension";
import { caretText, markedIn } from "../typing/caret";
import { type DefaultProtocol, addressBefore } from "./url";

export interface AutolinkOptions {
  /** Protocol of an address typed as `www.…`. Default `"https"`. */
  defaultProtocol: DefaultProtocol;
}

/**
 * Links the address that ends at the caret, or before the whitespace just typed. Already linked
 * text, inline code and atomic elements are left alone. One transaction: Undo removes the link.
 */
function linkAddress(editor: GoTipeEditor, options: AutolinkOptions, typed: boolean): boolean {
  const context = caretText(editor);
  if (!context) return false;
  let end = context.caret;
  if (typed) {
    if (!/\s/.test(context.text[end - 1] ?? "")) return false;
    end--;
  }
  const found = addressBefore(context.text, end, options.defaultProtocol);
  if (!found) return false;
  const { block } = context;
  for (const type of ["link", "code", null])
    if (markedIn(block, found.from, found.to, type)) return false;
  try {
    return editor.chain().addMark("link", found.from, found.to, { href: found.href }).run();
  } catch (error) {
    // An editor without the Link mark keeps the address as text.
    if (error instanceof GoTipeError && error.code === "VALIDATION_ERROR") return false;
    throw error;
  }
}

function autolink(options: AutolinkOptions): Extension<AutolinkOptions> {
  const extension = defineExtension<AutolinkOptions>({
    name: "autolink",
    options,
    inputRules: [
      {
        pattern: /(?:https?:\/\/|www\.|mailto:)\S/i,
        handler: (editor) => linkAddress(editor, options, true),
      },
    ],
    keybindings: [
      {
        // Enter still splits the block: the link is added first, as its own step.
        key: "Enter",
        command: (editor) => {
          linkAddress(editor, options, false);
          return false;
        },
      },
    ],
  });
  return { ...extension, configure: (next) => autolink({ ...options, ...next }) };
}

/**
 * Typing an address (`https://…`, `www.…`, `mailto:…`) followed by a space or Enter links it
 * with the `link` mark. Never inside code; needs the `Link` extension.
 */
export const Autolink = autolink({ defaultProtocol: "https" });
