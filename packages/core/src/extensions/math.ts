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
      handler: (editor) => {
        const blockId = editor.getViewState().selection.anchor.blockId;
        // Delete the trigger first: the formula starts empty.
        editor.dispatch({ steps: [{ type: "deleteText", blockId, from: 0, to: 2 }] });
        editor.chain().setBlockType("math", { display: "block" }).run();
      },
    },
  ],
  slashCommands: [
    {
      name: "Math Equation",
      aliases: ["math", "equation", "latex", "katex"],
      description: "Insert a math equation",
      icon: "function-square",
      group: "insert",
      execute: (editor) => editor.chain().insertBlockAfter("math", { display: "block" }).run(),
    },
  ],
});
