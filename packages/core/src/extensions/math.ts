import { convertTyped } from "../input/block-rule";
import { defineExtension } from "../types/extension";
import { paragraphAfter } from "./code-block";

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
      // The formula starts empty: the trigger goes with the change.
      handler: (editor) =>
        convertTyped(editor, 2, (chain) => chain.setBlockType("math", { display: "block" })),
    },
  ],
  keybindings: [
    {
      // Enter adds a line to the source (D-11); Escape leaves the formula as a code block, for an
      // empty paragraph after it. The block decides, not its view: a view without `<pre>` too.
      key: "Escape",
      command: (editor) => {
        const { blocks, selection } = editor.getViewState();
        const block = blocks.find(({ id }) => id === selection.anchor.blockId);
        return block?.type === "math" && paragraphAfter(editor);
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
