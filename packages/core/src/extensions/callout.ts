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
        alert: { type: "string" },
        type: {
          type: "enum",
          values: [
            "info",
            "warning",
            "error",
            "success",
            "note",
            "tip",
            "important",
            "caution",
            "agent",
          ],
          default: "info",
        },
      },
      topLevel: true,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: true,
    },
  ],
  slashCommands: [
    {
      name: "Callout",
      aliases: ["callout", "notice", "alert"],
      description: "Insert a callout block",
      icon: "alert-circle",
      group: "style",
      execute: (editor) =>
        editor.chain().insertBlockAfter("callout", { emoji: "💡", type: "info" }).run(),
    },
  ],
});
