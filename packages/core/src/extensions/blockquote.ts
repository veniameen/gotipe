import { convertTyped } from "../input/block-rule";
import { defineExtension } from "../types/extension";

export const Blockquote = defineExtension({
  name: "blockquote",
  nodes: [
    {
      name: "blockquote",
      group: ["block"],
      content: "richText",
      attrs: {},
      topLevel: true,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: true,
      childTypes: ["paragraph", "heading"],
    },
  ],
  inputRules: [
    {
      pattern: /^>\s$/,
      handler: (editor) => convertTyped(editor, 2, (chain) => chain.setBlockType("blockquote")),
    },
  ],
  keybindings: [
    {
      key: "mod-shift-b",
      command: (editor) => editor.chain().setBlockType("blockquote").run(),
    },
  ],
  slashCommands: [
    {
      name: "Quote",
      aliases: ["blockquote", "quote"],
      description: "Insert a quote block",
      icon: "quote",
      group: "style",
      execute: (editor) => editor.chain().setBlockType("blockquote").run(),
    },
  ],
});
