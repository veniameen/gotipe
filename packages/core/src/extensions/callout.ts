import { defineExtension } from "../types/extension";

export const Callout = defineExtension({
  name: "callout",
  nodes: [
    {
      name: "callout",
      group: ["block"],
      content: "richText",
      attrs: {
        emoji: { type: "string", default: "💡" },
        type: {
          type: "enum",
          values: ["info", "warning", "error", "success", "note"],
          default: "info",
        },
      },
      topLevel: true,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: false,
    },
  ],
  slashCommands: [
    {
      name: "Callout",
      aliases: ["callout", "notice", "alert"],
      description: "Insert a callout block",
      icon: "alert-circle",
      group: "basic",
      execute: (editor) =>
        editor.chain().insertBlockAfter("callout", { emoji: "💡", type: "info" }).run(),
    },
  ],
});
