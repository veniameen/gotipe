import { defineExtension } from "../types/extension";

export const Bold = defineExtension({
  name: "bold",
  marks: [{ name: "bold", attrs: {}, rank: 1 }],
  keybindings: [
    {
      key: "mod-b",
      command: (editor) => editor.chain().toggleBold().run(),
    },
  ],
  inputRules: [
    {
      pattern: /\*\*(.+)\*\*$/,
      handler: (editor, _match) => {
        editor.chain().toggleBold().run();
      },
    },
  ],
});

export const Italic = defineExtension({
  name: "italic",
  marks: [{ name: "italic", attrs: {}, rank: 2 }],
  keybindings: [
    {
      key: "mod-i",
      command: (editor) => editor.chain().toggleItalic().run(),
    },
  ],
  inputRules: [
    {
      pattern: /\*(.+)\*$/,
      handler: (editor) => {
        editor.chain().toggleItalic().run();
      },
    },
  ],
});

export const Underline = defineExtension({
  name: "underline",
  marks: [{ name: "underline", attrs: {}, rank: 3 }],
  keybindings: [
    {
      key: "mod-u",
      command: (editor) => editor.chain().toggleUnderline().run(),
    },
  ],
});

export const Strikethrough = defineExtension({
  name: "strikethrough",
  marks: [{ name: "strikethrough", attrs: {}, rank: 4 }],
  keybindings: [
    {
      key: "mod-shift-x",
      command: (editor) => editor.chain().toggleStrikethrough().run(),
    },
  ],
  inputRules: [
    {
      pattern: /~~(.+)~~$/,
      handler: (editor) => {
        editor.chain().toggleStrikethrough().run();
      },
    },
  ],
});

export const InlineCode = defineExtension({
  name: "code",
  marks: [{ name: "code", attrs: {}, rank: 5 }],
  keybindings: [
    {
      key: "mod-e",
      command: (editor) => editor.chain().toggleCode().run(),
    },
  ],
  inputRules: [
    {
      pattern: /`(.+)`$/,
      handler: (editor) => {
        editor.chain().toggleCode().run();
      },
    },
  ],
});

export const Link = defineExtension({
  name: "link",
  marks: [
    {
      name: "link",
      attrs: {
        href: { type: "string", required: true },
        title: { type: "string" },
        target: { type: "string", default: "_blank" },
        rel: { type: "string", default: "noopener noreferrer" },
      },
      rank: 6,
    },
  ],
  keybindings: [
    {
      key: "mod-k",
      command: (editor) => {
        editor.emit("openLinkDialog");
        return true;
      },
    },
  ],
});

export const Highlight = defineExtension({
  name: "highlight",
  marks: [
    {
      name: "highlight",
      attrs: {
        color: { type: "string", default: "yellow" },
      },
      rank: 7,
    },
  ],
  keybindings: [
    {
      key: "mod-shift-h",
      command: (editor) => editor.chain().toggleHighlight().run(),
    },
  ],
});

export const Superscript = defineExtension({
  name: "superscript",
  marks: [{ name: "superscript", exclusiveGroup: "script", attrs: {}, rank: 8 }],
  keybindings: [
    {
      key: "mod-.",
      command: (editor) => editor.chain().toggleSuperscript().run(),
    },
  ],
});

export const Subscript = defineExtension({
  name: "subscript",
  marks: [{ name: "subscript", exclusiveGroup: "script", attrs: {}, rank: 9 }],
  keybindings: [
    {
      key: "mod-,",
      command: (editor) => editor.chain().toggleSubscript().run(),
    },
  ],
});

/** Foreground color; exported HTML accepts only inert CSS color values. */
export const TextColor = defineExtension({
  name: "textColor",
  marks: [{ name: "textColor", attrs: { color: { type: "string", required: true } }, rank: 10 }],
});
