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
      handler: (editor) => {
        const state = editor.getViewState();
        const blockId = state.selection.anchor.blockId;
        // Delete the trigger text first. In a bullet list the item stays as it is.
        editor.dispatch({
          steps: [{ type: "deleteText", blockId, from: 0, to: 2 }],
        });
        editor.chain().setBulletList().run();
      },
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
      handler: (editor) => {
        const state = editor.getViewState();
        const blockId = state.selection.anchor.blockId;
        editor.dispatch({
          steps: [{ type: "deleteText", blockId, from: 0, to: 3 }],
        });
        editor.chain().setTodoList().run();
      },
    },
    {
      pattern: /^\[x\]\s$/,
      handler: (editor) => {
        const state = editor.getViewState();
        const blockId = state.selection.anchor.blockId;
        editor.dispatch({
          steps: [{ type: "deleteText", blockId, from: 0, to: 4 }],
        });
        // The task keeps the block's ID; in an empty task the rule checks it.
        editor.chain().setTodoList().setBlockAttrs(blockId, { checked: true }).run();
      },
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
