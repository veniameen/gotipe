import { createId } from "../document/id";
import type { GoTipeEditor } from "../types/editor";
import { defineExtension } from "../types/extension";

/**
 * Escape in a code block or a formula: an empty paragraph after the top-level block with the
 * caret, and the caret in it. Inside a nested block it does nothing and returns `false`.
 */
export function paragraphAfter(editor: GoTipeEditor): boolean {
  const state = editor.getViewState();
  const blockId = state.selection.anchor.blockId;
  const blockIndex = state.blocks.findIndex((b) => b.id === blockId);
  if (blockIndex === -1) return false;

  const paragraphId = createId();
  editor.dispatch({
    steps: [
      {
        type: "insertBlock",
        parentId: null,
        index: blockIndex + 1,
        block: { id: paragraphId, type: "paragraph", attrs: {}, content: [], children: [] },
      },
    ],
  });
  editor.setSelection({
    anchor: { blockId: paragraphId, offset: 0 },
    head: { blockId: paragraphId, offset: 0 },
  });
  editor.focus();
  return true;
}

export interface CodeBlockOptions {
  languages: string[];
  defaultLanguage: string;
  syntaxHighlight: boolean;
}

export const CodeBlock = defineExtension<CodeBlockOptions>({
  name: "codeBlock",
  options: {
    languages: [
      "javascript",
      "typescript",
      "python",
      "rust",
      "go",
      "html",
      "css",
      "json",
      "sql",
      "bash",
    ],
    defaultLanguage: "",
    syntaxHighlight: true,
  },
  nodes: [
    {
      name: "codeBlock",
      group: ["block"],
      content: "rawText",
      attrs: {
        // "" is plain text: a new block writes a bare fence and a bare <pre><code>.
        language: { type: "string", default: "" },
        meta: { type: "string" },
      },
      topLevel: true,
      marksAllowed: "none",
      leaf: false,
      allowsChildren: false,
    },
  ],
  inputRules: [
    {
      pattern: /^```(\w+)?\s$/,
      handler: (editor, match) => {
        const language = match[1] ?? "";
        const state = editor.getViewState();
        const blockId = state.selection.anchor.blockId;
        const triggerLen = match[0].length;
        // Delete the trigger text first, then change block type
        editor.dispatch({
          steps: [{ type: "deleteText", blockId, from: 0, to: triggerLen }],
        });
        editor.chain().setBlockType("codeBlock", { language }).run();
      },
    },
  ],
  keybindings: [
    {
      key: "Tab",
      when: "inCodeBlock",
      command: (editor) => {
        editor.chain().insertText("  ").run();
        return true;
      },
    },
    {
      key: "shift-Tab",
      when: "inCodeBlock",
      command: (editor) => {
        // Dedent: remove up to 2 leading spaces from current line
        const state = editor.getViewState();
        const block = state.blocks.find((b) => b.id === state.selection.anchor.blockId);
        if (!block || typeof block.content !== "string") return false;
        const offset = state.selection.anchor.offset;
        const before = block.content.slice(0, offset);
        const lineStart = before.lastIndexOf("\n") + 1;
        const linePrefix = block.content.slice(lineStart, offset);
        const spacesToRemove = linePrefix.startsWith("  ") ? 2 : linePrefix.startsWith(" ") ? 1 : 0;
        if (spacesToRemove > 0) {
          editor.dispatch({
            steps: [
              {
                type: "deleteRange",
                blockId: block.id,
                from: lineStart,
                to: lineStart + spacesToRemove,
              },
            ],
          });
        }
        return true;
      },
    },
    { key: "Escape", when: "inCodeBlock", command: paragraphAfter },
  ],
  slashCommands: [
    {
      name: "Code Block",
      aliases: ["code", "pre", "codeblock"],
      description: "Insert a code block",
      icon: "code",
      group: "style",
      execute: (editor) => editor.chain().setBlockType("codeBlock").run(),
    },
  ],
});
