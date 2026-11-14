import { defineExtension } from "../types/extension";

export const Paragraph = defineExtension({
  name: "paragraph",
  nodes: [
    {
      name: "paragraph",
      group: ["block"],
      content: "richText",
      // `TextAlign` sets it; any paragraph may hold it.
      attrs: { align: { type: "enum", values: ["left", "center", "right", "justify"] } },
      topLevel: true,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: false,
    },
  ],
  slashCommands: [
    {
      name: "Text",
      aliases: ["text", "paragraph", "plain"],
      description: "Plain text block",
      icon: "type",
      group: "style",
      execute: (editor) => editor.chain().setBlockType("paragraph").run(),
    },
  ],
});
