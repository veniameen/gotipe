import { defineExtension } from "../types/extension";

export const OrderedList = defineExtension({
  name: "orderedList",
  nodes: [
    {
      name: "orderedList",
      group: ["block", "list"],
      content: "empty",
      attrs: {
        start: { type: "number", default: 1 },
      },
      topLevel: true,
      marksAllowed: "none",
      leaf: false,
      allowsChildren: true,
      childTypes: ["listItem"],
    },
  ],
  inputRules: [
    {
      pattern: /^(\d+)\.\s$/,
      handler: (editor, match) => {
        const state = editor.getViewState();
        const blockId = state.selection.anchor.blockId;
        const triggerLen = match[0]!.length;
        const start = Number.parseInt(match[1]!, 10) || 1;
        editor.dispatch({
          steps: [{ type: "deleteText", blockId, from: 0, to: triggerLen }],
        });
        // In a numbered list the item stays as it is, and so does the list's numbering.
        editor
          .chain()
          .setOrderedList(start !== 1 ? { start } : undefined)
          .run();
      },
    },
  ],
  keybindings: [
    {
      key: "mod-shift-7",
      command: (editor) => editor.chain().toggleOrderedList().run(),
    },
  ],
  slashCommands: [
    {
      name: "Numbered List",
      aliases: ["ol", "ordered"],
      description: "Create a numbered list",
      icon: "list-ordered",
      group: "style",
      execute: (editor) => editor.chain().setOrderedList().run(),
    },
  ],
});
