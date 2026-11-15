import { convertTyped } from "../input/block-rule";
import { defineExtension } from "../types/extension";

export const BulletList = defineExtension({
  name: "bulletList",
  nodes: [
    {
      name: "bulletList",
      group: ["block", "list"],
      content: "empty",
      attrs: {},
      topLevel: true,
      marksAllowed: "none",
      leaf: false,
      allowsChildren: true,
      childTypes: ["listItem"],
    },
  ],
  inputRules: [
    {
      pattern: /^[-*]\s$/,
      // In a bullet list the item stays as it is.
      handler: (editor) => convertTyped(editor, 2, (chain) => chain.setBulletList()),
    },
  ],
  keybindings: [
    {
      key: "mod-shift-8",
      command: (editor) => editor.chain().toggleBulletList().run(),
    },
    {
      key: "Tab",
      when: "inList",
      command: (editor) => editor.chain().indent().run(),
    },
    {
      key: "shift-Tab",
      when: "inList",
      command: (editor) => editor.chain().outdent().run(),
    },
  ],
  slashCommands: [
    {
      name: "Bullet List",
      aliases: ["ul", "unordered"],
      description: "Create a bullet list",
      icon: "list",
      group: "style",
      execute: (editor) => editor.chain().setBulletList().run(),
    },
  ],
});

export const ListItem = defineExtension({
  name: "listItem",
  nodes: [
    {
      name: "listItem",
      group: ["listItem"],
      content: "richText",
      // `TextDirection` sets it.
      attrs: { dir: { type: "enum", values: ["ltr", "rtl", "auto"] } },
      topLevel: false,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: true,
    },
  ],
});

export const TodoList = defineExtension({
  name: "todoList",
  nodes: [
    {
      name: "todoList",
      group: ["block", "list"],
      content: "empty",
      attrs: {},
      topLevel: true,
      marksAllowed: "none",
      leaf: false,
      allowsChildren: true,
      childTypes: ["todoItem"],
    },
    {
      name: "todoItem",
      group: ["listItem"],
      content: "richText",
      attrs: {
        checked: { type: "bool", default: false },
        dir: { type: "enum", values: ["ltr", "rtl", "auto"] },
      },
      topLevel: false,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: true,
    },
  ],
  keybindings: [
    {
      key: "mod-shift-9",
      command: (editor) => editor.chain().toggleTodoList().run(),
    },
  ],
  inputRules: [
    {
      pattern: /^\[\]\s$/,
      // `[ ]` in Markdown: an unchecked task; in an empty checked task the rule unchecks it.
      handler: (editor) =>
        convertTyped(editor, 3, (chain, id) =>
          chain.setTodoList().setBlockAttrs(id, { checked: false }),
        ),
    },
    {
      pattern: /^\[x\]\s$/,
      // The task keeps the block's ID; in an empty task the rule checks it.
      handler: (editor) =>
        convertTyped(editor, 4, (chain, id) =>
          chain.setTodoList().setBlockAttrs(id, { checked: true }),
        ),
    },
  ],
  slashCommands: [
    {
      name: "To-do List",
      aliases: ["todo", "checkbox", "task"],
      description: "Create a to-do list with checkboxes",
      icon: "check-square",
      group: "style",
      execute: (editor) => editor.chain().setTodoList().run(),
    },
  ],
});
