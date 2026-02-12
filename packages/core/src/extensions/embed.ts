import { defineExtension } from "../types/extension";

export const Embed = defineExtension({
  name: "embed",
  nodes: [
    {
      name: "embed",
      group: ["block"],
      content: "empty",
      attrs: {
        url: { type: "string", required: true },
        type: {
          type: "enum",
          values: ["youtube", "vimeo", "twitter", "codepen", "figma", "generic"],
          default: "generic",
        },
        width: { type: "number" },
        height: { type: "number" },
      },
      topLevel: true,
      marksAllowed: "none",
      leaf: true,
      allowsChildren: false,
    },
  ],
  slashCommands: [
    {
      name: "Embed",
      aliases: ["embed", "iframe", "video"],
      description: "Embed external content",
      icon: "external-link",
      group: "insert",
      execute: (editor) =>
        editor.chain().insertBlockAfter("embed", { url: "", type: "generic" }).run(),
    },
  ],
});
