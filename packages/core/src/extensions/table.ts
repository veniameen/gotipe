import { defineExtension } from "../types/extension";

export const Table = defineExtension({
  name: "table",
  nodes: [
    {
      name: "table",
      group: ["block"],
      content: "empty",
      attrs: {},
      topLevel: true,
      marksAllowed: "none",
      leaf: false,
      allowsChildren: true,
      childTypes: ["tableRow"],
    },
    {
      name: "tableRow",
      group: ["tableRow"],
      content: "empty",
      attrs: {},
      topLevel: false,
      marksAllowed: "none",
      leaf: false,
      allowsChildren: true,
      childTypes: ["tableCell", "tableHeader"],
    },
    {
      name: "tableCell",
      group: ["tableCell"],
      content: "richText",
      attrs: {
        colspan: { type: "number", default: 1 },
        rowspan: { type: "number", default: 1 },
      },
      topLevel: false,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: false,
    },
    {
      name: "tableHeader",
      group: ["tableCell"],
      content: "richText",
      attrs: {
        colspan: { type: "number", default: 1 },
        rowspan: { type: "number", default: 1 },
      },
      topLevel: false,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: false,
    },
  ],
  keybindings: [
    {
      key: "Tab",
      when: "inTable",
      command: (editor) => editor.chain().goToNextCell().run(),
    },
    {
      key: "shift-Tab",
      when: "inTable",
      command: (editor) => editor.chain().goToPrevCell().run(),
    },
  ],
  slashCommands: [
    {
      name: "Table",
      aliases: ["table", "grid"],
      description: "Insert a table",
      icon: "table",
      group: "advanced",
      execute: (editor) => editor.chain().insertTable({ rows: 3, cols: 3, withHeader: true }).run(),
    },
  ],
});
