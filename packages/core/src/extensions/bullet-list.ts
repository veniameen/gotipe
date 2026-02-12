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
    { pattern: /^[-*]\s$/, handler: (editor) => editor.chain().toggleBulletList().run() },
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
      execute: (editor) => editor.chain().toggleBulletList().run(),
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
      attrs: {},
      topLevel: false,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: true,
      childTypes: ["bulletList", "orderedList"],
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
      },
      topLevel: false,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: false,
    },
  ],
  inputRules: [
    { pattern: /^\[\]\s$/, handler: (editor) => editor.chain().toggleTodoList().run() },
    { pattern: /^\[x\]\s$/, handler: (editor) => editor.chain().toggleTodoList().run() },
  ],
  slashCommands: [
    {
      name: "To-do List",
      aliases: ["todo", "checkbox", "task"],
      description: "Create a to-do list with checkboxes",
      icon: "check-square",
      group: "style",
      execute: (editor) => editor.chain().toggleTodoList().run(),
    },
  ],
});
