---
title: Keyboard and accessibility
description: Every keyboard shortcut of the core and the ready UI, the Markdown shortcuts, and what the editor does for focus, roles, screen readers and reduced motion.
packages: ["@gotipe/core", "@gotipe/react", "@gotipe/block-editor"]
---

Shortcuts come from two places: extensions bind keys in the core, and the UI components
handle keys inside their menus. `Mod` is ⌘ on macOS and Ctrl elsewhere; `Alt` is ⌥ Option
on a Mac. Letter and digit shortcuts follow the physical key, so they also work on
non-Latin layouts such as Russian. In a read-only editor, navigation and copying work and
editing shortcuts are ignored. Menus and tooltips show only keys that are bound.

## Formatting

| Shortcut | Action | Extension |
|---|---|---|
| Mod+B | Bold | `Bold` |
| Mod+I | Italic | `Italic` |
| Mod+U | Underline | `Underline` |
| Mod+Shift+X | Strikethrough | `Strikethrough` |
| Mod+E | Inline code | `InlineCode` |
| Mod+Shift+H | Highlight | `Highlight` |
| Mod+. | Superscript | `Superscript` |
| Mod+, | Subscript | `Subscript` |
| Mod+K | Link: opens the link field over selected text (the `openLinkDialog` event); see the note below | `Link` |

## Blocks and history

| Shortcut | Action | Extension |
|---|---|---|
| Mod+Alt+1 … Mod+Alt+6 | Heading 1–6, for the levels `Heading` offers (1–3 in `DefaultPreset`) | `Heading` |
| Mod+Shift+7 | Numbered list, on or off | `OrderedList` |
| Mod+Shift+8 | Bullet list, on or off | `BulletList` |
| Mod+Shift+9 | To-do list, on or off | `TodoList` |
| Mod+Shift+B | Quote | `Blockquote` |
| Mod+Z | Undo | `History` |
| Mod+Shift+Z, Mod+Y | Redo | `History` |

## Lists, tables and code

| Where | Shortcut | Action |
|---|---|---|
| List | Tab / Shift+Tab | Indent / outdent the item (bound by `BulletList` for every list) |
| Table | Tab / Shift+Tab | Next / previous cell of the same table, row by row, with its text selected |
| Code block | Tab | Insert two spaces |
| Code block | Shift+Tab | Remove up to two spaces at the start of the line |
| Code block | Escape | Add a paragraph after a top-level code block and move there |

Elsewhere Tab is not captured and moves focus to the next control, usually out of the
editor. Tab in the last cell of a table and Shift+Tab in its first are not captured either:
they never move the caret into another table. In the editor UI, Tab from the last cell
reaches the table's Add row button.

## Editing keys

| Key | Action |
|---|---|
| Enter | Split the block. A heading, quote or callout continues as a paragraph; a list item continues as an item. |
| Enter on an empty list item | Leave the list, or go one level up in a nested list. |
| Enter in a table cell | Move to the cell below. |
| Enter in a code block | New line. |
| Shift+Enter | Line break inside the same block. |
| Backspace at the start of a list item with text | Turn the item into a paragraph. |

Copy, cut and paste use the system keys; see [content formats](/docs/concepts/content-formats).

## Markdown shortcuts

Type these in an empty paragraph:

| Type | Result | Extension |
|---|---|---|
| `#` to `######`, then a space | Heading 1–6, for the levels `Heading` offers | `Heading` |
| `-` or `*`, then a space | Bullet list | `BulletList` |
| `1.` or any number and a dot, then a space | Numbered list starting at that number | `OrderedList` |
| `[]`, then a space | To-do list | `TodoList` |
| `[x]`, then a space | To-do list with the item checked | `TodoList` |
| `>`, then a space | Quote | `Blockquote` |
| ```` ``` ````, an optional language, then a space | Code block | `CodeBlock` |
| `---` | Divider | `Divider` |
| `$$` | Empty math block | `Math` |
| `/` | Slash menu; also after a space inside a line | UI |

Anywhere in a line, `**text**`, `*text*`, `~~text~~` and `` `text` `` become bold, italic,
struck-through and code text as you type the closing delimiter; see
[marks](/docs/extensions/marks#input-rules).

## Editor UI

| Where | Keys | Action |
|---|---|---|
| Slash menu | ↑ ↓, Home, End | Move through the commands |
| Slash menu | Enter | Run the command |
| Slash menu | Escape; a space; deleting `/` | Close; the caret stays in place |
| Bubble: Block type, More | ↓ | Open the popup |
| Bubble popups | ← → ↑ ↓, Home, End | Move between the buttons |
| Link field | Enter | Apply the link |
| Bubble popups | Escape | Close; the link editor returns the caret to the selection, the others return focus to their button |
| Block menu | ↑ ↓ | Move through the items |
| Block menu | → on Turn into, ← | Open the submenu, go back |
| Block menu | Escape | Close the submenu, then the menu; focus returns to the grip |
| Table column and row menus | ↑ ↓; Escape | Move; close and return focus to the handle |
| Column resize handle | ← → | Narrow or widen the column by 16 px |
| Image side handle | ← → | Narrow or widen the image by 16 px |
| Resize or touch drag in progress | Escape | Cancel |
| Image dialogs and More options | Escape | Close |
| Anywhere in the editor | Mod+J | Open or close the AI command bar (`showAiCommandBar`) |
| AI command bar | Enter; Escape | Send the prompt; close and cancel a running request |
| AI ghost text | Tab; Escape | Accept; dismiss |
| Theme toggle | ← → ↑ ↓, Home, End | Choose light, dark or system; one Tab stop |
| Page head title | Enter | Calls `onTitleEnter` instead of adding a line |
| Review card | Escape; Enter in the reply field | Close the card; send the reply |
| Callout icon field | Enter; Escape | Save; cancel |

## Accessibility

**Roles and names.** The document is `role="textbox"` with `aria-multiline`, a name
(`ariaLabel`, "Document content" by default and "Page" in `PageEditor`) and `aria-readonly`
when read-only. The slash menu is a `dialog` holding a `listbox` of `option`s in labelled
groups, with `aria-activedescendant` on the active one. The bubble is a `toolbar`: mark
buttons carry `aria-pressed` and `aria-keyshortcuts`, Link and Colour open `dialog`s, More
opens a `menu`, Block type a `listbox`. The [fixed toolbar](/docs/ui/fixed-toolbar) is one
`toolbar` and one Tab stop: ← and → move between its tools, Home and End go to the ends, ↓
opens a list or More, Escape closes it; a tool that can't act is `aria-disabled` and
described by the reason. The block handle is a `toolbar` with named buttons,
and its menu uses `menu` and `menuitem`. Table handles have `aria-haspopup="menu"` and
column types are `menuitemradio`. The theme toggle is a `radiogroup`, the docs outline a
`nav` with `aria-current`, the loading skeleton a `status` with `aria-busy`. Task boxes are
native checkboxes that Space toggles. Tooltips are hidden from assistive technology; each
button keeps its own name.

**Focus.** Controls draw a ring in `--gt-focus` on `:focus-visible`; the document shows the
caret instead of an outline. Closing a menu returns focus to where it came from, as in the
table above. Image dialogs are modal `<dialog>` elements and give focus back when they
close. The image toolbar is `inert` while hidden, so Tab skips it.

**Screen readers.** The slash menu announces the number of results in a polite live
region, and AI progress is a polite status. A failed action puts a visually hidden alert in
its control; the visible toast is hidden from assistive technology so the message is read
once. Formatting changes, block moves and collaborators are not announced.

**Reduced motion.** With `prefers-reduced-motion: reduce`, animations and transitions
inside `.gotipe-editor` shrink to 0.01 ms, review cards and lane avatars stop animating,
the docs outline jumps instead of scrolling smoothly, and review text appears at once.
Elements outside `.gotipe-editor` still animate: the AI command bar and its spinner, the
drop indicator, ghost text and the table menus.

## Limitations

- Mod+K opens the link field of the bubble, or of `FixedToolbar` without a bubble, only
  over selected text: with a caret alone it does nothing.
- The block handle and block menu have no keyboard path. Change block types with the
  shortcuts, the slash menu or the bubble's Block type.
- No shortcut moves focus into the formatting bubble.
- Review cards open from the pointer or from `ref.current.review.focus(id)`; no key steps
  through suggestions.
- Release testing covered roles, names, focus and keyboard paths in three browsers, not a
  screen reader; see [browser support](/docs/resources/browser-support).

## Related

- [Menus and controls](/docs/ui/menus) · [Extensions](/docs/extensions/overview) · [Behaviors](/docs/extensions/behaviors)
- [Commands](/docs/concepts/commands) · [Internationalization](/docs/ui/i18n)
