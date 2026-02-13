import { defineExtension } from "../types/extension";

export const Divider = defineExtension({
  name: "divider",
  nodes: [
    {
      name: "divider",
      group: ["block"],
      content: "empty",
      attrs: {},
      topLevel: true,
      marksAllowed: "none",
      leaf: true,
      allowsChildren: false,
    },
  ],
  inputRules: [
    {
      pattern: /^---$/,
      handler: (editor) => {
        const state = editor.getViewState();
        const blockId = state.selection.anchor.blockId;
        const blockIndex = state.blocks.findIndex((b) => b.id === blockId);
        if (blockIndex === -1) return;
        // Replace the trigger paragraph with a divider + new empty paragraph
        editor.dispatch({
          steps: [
            { type: "deleteBlock", blockId },
            {
              type: "insertBlock",
              parentId: null,
              index: blockIndex,
              block: {
                id: crypto.randomUUID(),
                type: "divider",
                attrs: {},
                content: null,
                children: [],
              },
            },
            {
              type: "insertBlock",
              parentId: null,
              index: blockIndex + 1,
              block: {
                id: crypto.randomUUID(),
                type: "paragraph",
                attrs: {},
                content: [],
                children: [],
              },
            },
          ],
        });
      },
    },
  ],
  slashCommands: [
    {
      name: "Divider",
      aliases: ["hr", "separator", "divider"],
      description: "Insert a horizontal divider",
      icon: "minus",
      group: "insert",
      execute: (editor) => editor.chain().insertBlockAfter("divider").run(),
    },
  ],
});
