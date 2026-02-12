import { defineExtension } from "../types/extension";

export const Paragraph = defineExtension({
  name: "paragraph",
  nodes: [
    {
      name: "paragraph",
      group: ["block"],
      content: "richText",
      attrs: {},
      topLevel: true,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: false,
    },
  ],
});
