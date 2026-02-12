import { defineExtension } from "../types/extension";

export const Math = defineExtension({
  name: "math",
  nodes: [
    {
      name: "math",
      group: ["block"],
      content: "rawText",
      attrs: {
        display: { type: "enum", values: ["block", "inline"], default: "block" },
      },
      topLevel: true,
      marksAllowed: "none",
      leaf: false,
      allowsChildren: false,
    },
  ],
  inputRules: [
    {
      pattern: /^\$\$$/,
      handler: (editor) => editor.chain().setBlockType("math", { display: "block" }).run(),
    },
  ],
  slashCommands: [
    {
      name: "Math Equation",
      aliases: ["math", "equation", "latex", "katex"],
      description: "Insert a math equation",
      icon: "function-square",
      group: "advanced",
      execute: (editor) => editor.chain().insertBlockAfter("math", { display: "block" }).run(),
    },
  ],
});
