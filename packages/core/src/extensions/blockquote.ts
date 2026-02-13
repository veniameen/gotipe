import { defineExtension } from "../types/extension";

export const Blockquote = defineExtension({
  name: "blockquote",
  nodes: [
    {
      name: "blockquote",
      group: ["block"],
      content: "richText",
      attrs: {},
      topLevel: true,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: true,
      childTypes: ["paragraph", "heading"],
    },
  ],
  inputRules: [
    {
      pattern: /^>\s$/,
      handler: (editor) => {
        const state = editor.getViewState();
        const blockId = state.selection.anchor.blockId;
        // Delete the trigger text first, then change block type
        editor.dispatch({
          steps: [{ type: "deleteText", blockId, from: 0, to: 2 }],
        });
        editor.chain().setBlockType("blockquote").run();
      },
    },
  ],
  keybindings: [
    {
      key: "mod-shift-b",
      command: (editor) => editor.chain().setBlockType("blockquote").run(),
    },
  ],
  slashCommands: [
    {
      name: "Quote",
      aliases: ["blockquote", "quote"],
      description: "Insert a quote block",
      icon: "quote",
      group: "style",
      execute: (editor) => editor.chain().setBlockType("blockquote").run(),
    },
  ],
});
