---
title: Menus and controls
description: The slash menu, the block handle and block menu, the formatting bubble, table and media controls, and the framework-free bubble and floating menus.
packages: ["@gotipe/block-editor", "@gotipe/react", "@gotipe/core"]
---

`BlockEditor` and `PageEditor` share one set of controls. Most come from the commercial
`@gotipe/block-editor`; the table bars, media controls and menu primitives are part of the
MIT packages.

| Control | Package | Appears |
|---|---|---|
| Slash menu | `@gotipe/block-editor` | Typing `/` at the start of a block or after a space |
| Block handle and block menu | `@gotipe/block-editor` | Pointer over a block row in the `notion` view, or a touch |
| Formatting bubble | `@gotipe/block-editor` | A selection in an editable editor |
| Table column and row menus | `@gotipe/block-editor` | Editable tables in the ready editors |
| Table bars, resize handles, media controls | `@gotipe/react` | Editable tables, image and file blocks |
| `BubbleMenu`, `FloatingMenu` | `@gotipe/react` | Your own React menus; see [React](/docs/frameworks/react) |
| `createBubbleMenu`, `createFloatingMenu` | `@gotipe/core/menus` | Your own menus without a framework |

## Slash menu

The menu opens when you type `/` at the start of a block or after a space, and from the
handle's `+` button. The text after `/` filters it. A space, deleting the `/`, Escape or a
click outside closes it; running a command removes the `/` and the query.

Filtering matches the name and the aliases: a prefix ranks first, then a substring, then
letters in order. Built-in commands show in the UI language and keep their English names as
aliases. A row shows its Markdown shortcut where one exists (`#`, `-`, `1.`, `[]`, `>`,
` ``` `, `---`). Commands are grouped as AI, Style, Insert and Upload, in that order.

Keys: ↑ and ↓ move, Home and End jump, Enter runs, Escape closes and keeps the caret.

Commands come from the extensions (`editor.getSlashCommands()`). Pass `slashCommands` to
change the list:

```tsx title="DocumentEditor.tsx"
import { BlockEditor } from "@gotipe/block-editor";
import type { SlashCommandDef } from "@gotipe/core";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { useMemo } from "react";

const warning: SlashCommandDef = {
  name: "Warning",
  aliases: ["warn", "caution"],
  icon: "alert-circle",
  group: "insert",
  execute: (editor) => editor.chain().setBlockType("callout", { type: "warning" }).run(),
};

export function DocumentEditor() {
  const editor = useEditor({ extensions: [FullPreset] });
  const commands = useMemo(() => (editor ? [...editor.getSlashCommands(), warning] : undefined), [editor]);
  return <BlockEditor editor={editor} slashCommands={commands} showAiCommandBar={false} />;
}
```

To change groups, labels or row icons, render `SlashMenu` yourself as a child of
`BlockEditor` with `showSlashMenu={false}`:

| Prop | Type | Default | Description |
|---|---|---|---|
| `editor` | `GoTipeEditor` | — | The editor. |
| `commands` | `SlashCommandDef[]` | `[]` | Commands to offer. |
| `groups` | `{ id: string; label: string }[]` | AI, Style, Insert, Upload | Group order and labels; groups not listed are hidden. |
| `renderIcon` | `(command) => ReactNode` | built-in icons | Row icon. By default an icon name outside the built-in set draws the command's first letter. |
| `renderMeta` | `(command) => ReactNode` | Markdown shortcut | Right-hand side of a row. |
| `labels` | `{ menu?, list?, empty?, results?(count) }` | i18n strings | Accessible names, the empty state and the result count. |
| `className` | `string` | — | Added to `.gotipe-slash-menu`. |

## Block handle

In the `notion` view a handle appears beside the block under the pointer, from about
120 px left of the text to 560 px right of its start. Touching a block shows it too. It is
hidden while the editor is read-only.

- **`+`** adds an empty block below; Alt-click (Option-click on macOS) adds it above. On a
  list row the new block is a row of the same list. With the slash menu on, the new block
  starts with `/` and the menu opens; the insertion is one undo step.
- **The grip** drags the block. On a list row it moves the row; Alt-drag moves the whole
  list. With touch or a pen, hold the grip for 300 ms, then drag; moving more than 10 px
  before that cancels. Near the top or bottom edge the page scrolls. Escape cancels a touch
  drag. A drop is one undo step.
- **Clicking the grip** (or a short tap) opens the block menu.

| Block menu item | Action |
|---|---|
| Turn into | Text, Heading 1–3, Bullet list, Numbered list, To-do list, Quote, Code block |
| Copy link to block | Copies the page URL with `?gotipe-block=<id>`; a page opened with it scrolls to the block |
| Duplicate | Copies the block below itself |
| Reset formatting | Turns the block into a paragraph |
| Copy to clipboard | Copies the plain text of the block and its children |
| Delete | Removes the block |

The menu acts on the top-level block under the pointer. On a list row, Duplicate and Delete
apply to the whole list, and Turn into to the row with the caret or the first row.

## Formatting bubble

The bubble appears over a selection while the editor is editable. From left to right:

- **Improve** asks the AI extension to rewrite the selection. Shown with `showAiCommandBar`.
- **Block type**: Paragraph, Heading 1–3, Bullet list, Numbered list, Todo list, Quote, Code.
  Disabled in table cells.
- **Bold, Italic, Underline, Strikethrough, Code**; each tooltip shows its shortcut.
- **Link** opens the link editor. It accepts `http:`, `https:`, `mailto:` and relative
  links, and reports anything else in the field. Enter applies, Remove link appears when the
  selection has a link, and Escape returns the caret to the selection.
- **Colour**: text Gray, Red, Amber, Green, Blue; highlight Yellow, Green, Blue, Red, Gray;
  and Reset. A mark stores the colour for a light page; the editor draws it through the
  `--gt-tc-*` and `--gt-bg-*` tokens, so it follows dark mode.
- **More**: Superscript, Subscript, Clear formatting, Copy as Markdown.

## Tables

| Control | Where | Action |
|---|---|---|
| Add row bar | Under the table | Adds a row at the end |
| Add column bar | Right of the table | Adds a column at the end and scrolls to it |
| Resize handle | Right edge of each first-row cell | Drag between 64 and 1600 px, or ← and → by 16 px |
| Column menu | Chevron in a header cell | Type: Text, Code, Number, Yes / no; Add row; Add column after it; Delete column |
| Row menu | Beside the first cell of a body row | Add row above, Add row below, Delete row |

Number aligns the column right. Code puts every body cell in inline code. Yes / no turns
values such as `yes`, `true`, `1` or `x` into the UI's word for yes, and empty or negative
values into its word for no; other values stay. Deleting the last row deletes the table.
A wide table scrolls inside its block. Each action is one undo step. The bars and resize
handles come with `@gotipe/react`; the column and row menus need the ready editors. More
in [tables](/docs/extensions/tables).

## Images and files

An image shows a toolbar on hover or focus: Alternative text, Original size, Fit to width,
Caption, Zoom, Download and More options. More options has a search field and: Edit
alternative text, Crop image, Replace image, Copy image URL, Download image, Edit caption,
Copy link to block, Duplicate image, Move up, Move down, Delete image. The side handles
resize the image from 80 px to the width of its container; with focus, ← and → resize by
16 px. Crop takes percentages and saves a PNG through the host. An empty image offers
upload, a link, your host's image sources, or a dropped file. A file block opens or
downloads on its name and offers Replace and Remove. See [media](/docs/extensions/media).

## Menus without a framework

`@gotipe/core/menus` positions your own elements:

```ts title="menus.ts"
import type { GoTipeEditor, ViewState } from "@gotipe/core";
import { createBubbleMenu, createFloatingMenu } from "@gotipe/core/menus";

const hasRange = ({ selection }: ViewState) =>
  selection.anchor.blockId !== selection.head.blockId ||
  selection.anchor.offset !== selection.head.offset;

export function attachMenus(editor: GoTipeEditor, bubble: HTMLElement, insert: HTMLElement) {
  const menus = [
    createBubbleMenu(editor, {
      element: bubble,
      shouldShow: ({ editor, state }) => editor.isEditable && hasRange(state),
    }),
    createFloatingMenu(editor, { element: insert }),
  ];
  return () => menus.forEach((menu) => menu.destroy());
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `element` | `HTMLElement` | — | Your menu. It gets `position: fixed`, a z-index and `display: none` until shown. |
| `shouldShow` | `({ editor, state }) => boolean` | see below | When to show the element; replaces the default condition. |
| `offset` | `{ x: number; y: number }` | `{ x: 0, y: 0 }` | Bubble only: added to its position. |

By default the bubble shows for a non-empty selection inside one block, centred 8 px above
it; the floating menu shows when the caret is in an empty top-level paragraph, 8 px left of
it. Both update on selection changes, not on scroll or resize, and do not check
editability. `destroy()` hides the element and stops listening.

## Limitations

- Mod+K emits the `openLinkDialog` event, but no built-in control listens to it yet. Open
  the link editor from the bubble, or handle the event yourself.
- The block handle and block menu have no keyboard path, and show only in the `notion`
  view.
- The Vue package has only a minimal slash menu and toolbar; see [Vue](/docs/frameworks/vue).

## Related

- [Block editor](/docs/ui/block-editor) · [Keyboard and accessibility](/docs/ui/keyboard)
- [Commands](/docs/concepts/commands) · [Tables](/docs/extensions/tables) · [Media](/docs/extensions/media)
