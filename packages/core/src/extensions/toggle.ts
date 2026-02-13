import { defineExtension } from "../types/extension";

export const Toggle = defineExtension({
  name: "toggle",
  nodes: [
    {
      name: "toggle",
      group: ["block"],
      content: "richText",
      attrs: {
        open: { type: "bool", default: false },
      },
      topLevel: true,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: true,
      childTypes: ["paragraph", "heading", "bulletList", "orderedList", "codeBlock"],
    },
  ],
  slashCommands: [
    {
      name: "Toggle",
      aliases: ["toggle", "collapsible", "accordion"],
      description: "Insert a toggle/collapsible block",
      icon: "chevron-right",
      group: "style",
      execute: (editor) => editor.chain().insertToggle().run(),
    },
  ],
});
