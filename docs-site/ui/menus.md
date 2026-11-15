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
| «@» and «:» lists, emoji picker, formula popover | `@gotipe/block-editor` | Typing `@` or `:`, «/» → Emoji, a click on a formula; needs `atomExtensions()` |

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

## Mentions, emoji and formulas

GoTipe Atlas, frames 22–24. All four need the editor to include `atomExtensions()` from
`@gotipe/block-editor`; the data comes from the `mentions` and `emoji` props of `BlockEditor`
and `PageEditor` ([Inline atoms](/docs/extensions/inline-atoms#the-block-editors-interface)).

**The «@» list.** Typing `@` at the start of a word opens it at the caret with the host's
people and pages for the text after `@`: initials for a person, the page glyph for a page,
the match in bold, a group label wherever the kind changes («People», «Pages»). The first row
is chosen and shows ↵. ArrowDown and ArrowUp move the choice, Enter or a click inserts the
mention in place of `@query`, Escape closes the list until the caret leaves the trigger, and
so does moving the focus away. An empty answer is one line: «No one found». Return people
before pages from `mentions.items`, as the list groups consecutive rows.

**The «:» list.** Typing `:` at the start of a word lists Unicode emoji by shortcode and, with
the Russian interface, by Russian name (`:пра` → 🎉 праздник, ✅ правильно, ✍️ правка, 👉 направо),
then the team's emoji from `emoji.custom`. Right after `:` it shows the recent emoji. The keys
are those of the «@» list; Enter inserts the character (a custom emoji as an atom) and moves it
to the front of the recent list.

**The emoji picker.** «/» → Emoji opens it at the caret: a search field with the focus, the
categories as glyphs (recent, faces, nature, food, activities, travel, objects, symbols, flags,
the team's own), the recent row first, then a grid of nine columns. A tab scrolls to its
category and the tab of the category in view is marked. ArrowDown from the field enters the
grid; the arrow keys walk it row by row across the categories, ArrowUp from the first row goes
back to the field; Enter or Space inserts, Enter in the field inserts the first result. The
name of the emoji under the pointer or the focus shows in a tooltip. Escape or a click outside
closes it and returns the caret.

**The formula popover.** A click on a formula, Enter with a formula selected, «/» → Inline
formula and typing `$x^2$` open it under the formula. The closing `$` makes the formula only when
the opening one starts a word and is followed by neither a space nor a digit, so `costs $5-$`
stays text, and Escape right after it brings the typed dollars back. The popover holds the
TeX in a monospace field with the caret at its end, a confirm button and the drawing under it as
you type. TeX that cannot be read marks the field red and names the reason in a tooltip
(«Missing closing “}”»); it can still be confirmed and then shows in the line as TeX on a red
tint. Enter or the button confirms in one undo step (`updateInlineMath` or `insertInlineMath`),
Escape or a click outside cancels. The formula stays selected while the popover is open.

Every list and popover is measured before it shows, flips above the caret when there is no
room below and follows the caret on scroll and resize. The lists keep the focus in the document:
the editor element carries `aria-controls`, `aria-expanded` and `aria-activedescendant` of the
chosen row, as the slash menu does. In the picker and the formula popover Tab cycles through their
own controls; when the focus leaves them (a click elsewhere) they close and leave it there. Keys
of an input method's composition never choose or move.

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

- **Improve** asks the AI extension to rewrite the selection. Shown with `showAiCommandBar`
  when the editor has `defineAi` and `defineAiContext`; without them the bubble starts with the
  block type.
- **Block type**: Paragraph, Heading 1–3, Bullet list, Numbered list, Todo list, Quote, Code.
  Disabled in table cells.
- **Bold, Italic, Underline, Strikethrough, Code**; each tooltip shows its shortcut.
- **Link** opens the link editor; Mod+K opens it too. It accepts `http:`, `https:`,
  `mailto:` and relative links, and reports anything else in the field. Enter applies,
  Remove link appears when the selection has a link, and Escape returns the caret to the
  selection.
- **Colour**: text Gray, Red, Amber, Green, Blue; highlight Yellow, Green, Blue, Red, Gray;
  and Reset. A mark stores the colour for a light page; the editor draws it through the
  `--gt-tc-*` and `--gt-bg-*` tokens, so it follows dark mode.
- **More**: alignment; Superscript and Subscript when the editor has those marks
  (`FullPreset` does, `DefaultPreset` does not); Clear formatting; Copy as Markdown.

## Tables

| Control | Where | Action |
|---|---|---|
| Add row bar | Under the table | Adds a row at the end |
| Add column bar | Right of the table | Adds a column at the end and scrolls to it |
| Resize handle | Right edge of the topmost cell ending each column | Drag between 64 and 1600 px, or ← and → by 16 px |
| Column menu | Chevron in a header cell | Type: Text, Code, Number, Yes / no; Cells: Merge cells, Split cell; Add row; Add column after it; Delete column (Delete columns under a header over several columns, which has no type) |
| Row menu | Beside the first cell of a body row | Row: Add row above, Add row below; Cells: Merge cells, Split cell; Delete row |

Number aligns the column right. Code puts every body cell in inline code. Yes / no turns
values such as `yes`, `true`, `1` or `x` into the UI's word for yes, and empty or negative
values into its word for no; other values stay. Deleting the last row deletes the table.
**Merge cells** is available while two or more cells are selected (drag across cells,
Shift+click or Shift+arrows); **Split cell** while the menu's cell or the caret's cell is
merged; ⌘⇧M (Ctrl+Shift+M) does either from the table. An unavailable row stays focusable,
is paler and shows the reason in its tooltip. `PageEditor` refuses a merge that Markdown could
not keep (a table with mentions, formulas or fonts, or inside a list or quote).
After an action the document takes the keys back, so ⌘Z undoes it.
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

- Mod+K opens the link field only over selected text: with a caret alone it opens nothing,
  as GoTipe Atlas draws the field only over a selection. One field opens: the bubble's, or
  without a bubble the `FixedToolbar` one while its Link tool is on the bar (not in a closed
  More).
- The block handle and block menu have no keyboard path, and show only in the `notion`
  view.
- The Vue package has only a minimal slash menu and toolbar; see [Vue](/docs/frameworks/vue).

## Related

- [Block editor](/docs/ui/block-editor) · [Keyboard and accessibility](/docs/ui/keyboard)
- [Commands](/docs/concepts/commands) · [Tables](/docs/extensions/tables) · [Media](/docs/extensions/media)
