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
    { pattern: /^\d+\.\s$/, handler: (editor) => editor.chain().toggleOrderedList().run() },
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
      group: "basic",
      execute: (editor) => editor.chain().toggleOrderedList().run(),
    },
  ],
});
