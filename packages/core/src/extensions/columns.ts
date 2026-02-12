import { defineExtension } from "../types/extension";

export const Columns = defineExtension({
  name: "columns",
  nodes: [
    {
      name: "columns",
      group: ["block"],
      content: "empty",
      attrs: {
        count: { type: "number", default: 2 },
      },
      topLevel: true,
      marksAllowed: "none",
      leaf: false,
      allowsChildren: true,
      childTypes: ["column"],
    },
    {
      name: "column",
      group: ["column"],
      content: "empty",
      attrs: {},
      topLevel: false,
      marksAllowed: "none",
      leaf: false,
      allowsChildren: true,
      childTypes: ["paragraph", "heading", "bulletList", "orderedList", "codeBlock", "image"],
    },
  ],
  slashCommands: [
    {
      name: "Columns",
      aliases: ["columns", "cols", "layout"],
      description: "Insert a multi-column layout",
      icon: "columns",
      group: "insert",
      execute: (editor) => editor.chain().insertBlockAfter("columns", { count: 2 }).run(),
    },
  ],
});
