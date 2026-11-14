import { plainTextPayload } from "../../clipboard/insertion";
import { insertDraftPayload } from "../../clipboard/paste-rules";
import { findBlockInTree } from "../../document/tree";
import { GoTipeError } from "../../error";
import { defineExtension } from "../../types/extension";
import { markedIn } from "../typing/caret";
import { type DefaultProtocol, linkHref } from "./url";

export interface LinkOnPasteOptions {
  /** Protocol of a pasted `www.…` address. Default `"https"`. */
  defaultProtocol: DefaultProtocol;
}

/**
 * Pasting a single web or mail address links the selected text with it, or inserts the address
 * as a link at the caret. In code, or when the address is not safe, it is pasted as text.
 * Needs the `Link` extension.
 */
export const LinkOnPaste = defineExtension<LinkOnPasteOptions>({
  name: "linkOnPaste",
  options: { defaultProtocol: "https" },
  pasteRules: [
    {
      match: /^\s*(?:https?:\/\/|www\.|mailto:)\S+\s*$/i,
      handler(draft, data, configured) {
        if (typeof data !== "string") return;
        const { defaultProtocol } = configured as LinkOnPasteOptions;
        const address = data.trim();
        const href = linkHref(address, defaultProtocol);
        const { selection, blocks } = draft.getViewState();
        const { anchor, head } = selection;
        const block = findBlockInTree(blocks, head.blockId);
        const collapsed =
          selection.type === "text" &&
          anchor.blockId === head.blockId &&
          anchor.offset === head.offset;
        const inCode =
          !block ||
          !Array.isArray(block.content) ||
          (collapsed && markedIn(block, Math.max(0, head.offset - 1), head.offset, "code"));
        try {
          if (!href || inCode) {
            // Plain text, as an ordinary paste inserts it.
          } else if (!collapsed) {
            if (draft.chain().addMark("link", undefined, undefined, { href }).run()) return;
          } else {
            const from = head.offset;
            const chain = draft.chain().insertText(address);
            if (chain.addMark("link", from, from + address.length, { href }).run()) return;
          }
        } catch (error) {
          // Without the Link mark in the schema the address is pasted as text.
          if (!(error instanceof GoTipeError) || error.code !== "VALIDATION_ERROR") throw error;
        }
        insertDraftPayload(draft, plainTextPayload(data));
      },
    },
  ],
});
