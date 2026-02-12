import { defineExtension } from "../types/extension";

export interface HeadingOptions {
  levels: number[];
}

export const Heading = defineExtension<HeadingOptions>({
  name: "heading",
  options: { levels: [1, 2, 3, 4, 5, 6] },
  nodes: [
    {
      name: "heading",
      group: ["block"],
      content: "richText",
      attrs: {
        level: { type: "number", default: 1, required: true },
      },
      topLevel: true,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: false,
    },
  ],
  inputRules: [
    {
      pattern: /^#\s$/,
      handler: (editor) => editor.chain().setBlockType("heading", { level: 1 }).run(),
    },
    {
      pattern: /^##\s$/,
      handler: (editor) => editor.chain().setBlockType("heading", { level: 2 }).run(),
    },
    {
      pattern: /^###\s$/,
      handler: (editor) => editor.chain().setBlockType("heading", { level: 3 }).run(),
    },
    {
      pattern: /^####\s$/,
      handler: (editor) => editor.chain().setBlockType("heading", { level: 4 }).run(),
    },
    {
      pattern: /^#####\s$/,
      handler: (editor) => editor.chain().setBlockType("heading", { level: 5 }).run(),
    },
    {
      pattern: /^######\s$/,
      handler: (editor) => editor.chain().setBlockType("heading", { level: 6 }).run(),
    },
  ],
  slashCommands: [
    {
      name: "Heading 1",
      aliases: ["h1", "heading1"],
      description: "Large section heading",
      icon: "heading-1",
      group: "style",
      execute: (editor) => editor.chain().setBlockType("heading", { level: 1 }).run(),
    },
    {
      name: "Heading 2",
      aliases: ["h2", "heading2"],
      description: "Medium section heading",
      icon: "heading-2",
      group: "style",
      execute: (editor) => editor.chain().setBlockType("heading", { level: 2 }).run(),
    },
    {
      name: "Heading 3",
      aliases: ["h3", "heading3"],
      description: "Small section heading",
      icon: "heading-3",
      group: "style",
      execute: (editor) => editor.chain().setBlockType("heading", { level: 3 }).run(),
    },
  ],
  keybindings: [
    {
      key: "mod-alt-1",
      command: (editor) => editor.chain().setBlockType("heading", { level: 1 }).run(),
    },
    {
      key: "mod-alt-2",
      command: (editor) => editor.chain().setBlockType("heading", { level: 2 }).run(),
    },
    {
      key: "mod-alt-3",
      command: (editor) => editor.chain().setBlockType("heading", { level: 3 }).run(),
    },
  ],
});
