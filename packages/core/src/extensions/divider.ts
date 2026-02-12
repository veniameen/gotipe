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
    { pattern: /^---$/, handler: (editor) => editor.chain().insertBlockAfter("divider").run() },
  ],
  slashCommands: [
    {
      name: "Divider",
      aliases: ["hr", "separator", "divider"],
      description: "Insert a horizontal divider",
      icon: "minus",
      group: "basic",
      execute: (editor) => editor.chain().insertBlockAfter("divider").run(),
    },
  ],
});
