---
title: Commands
description: The chain API and every built-in GoTipe editor command, grouped by what they change.
packages: ["@gotipe/core"]
license: MIT
---

Commands turn an intent such as "make this bold" into a [transaction](/docs/concepts/transactions)
based on the current selection. `editor.chain()` starts a chain, each call stages one
command, and `run()` dispatches everything as one transaction and one undo step.

```demo
headless
```

## Run a chain

```ts title="commands.ts"
editor.chain().focus().toggleBold().run();

editor
  .chain()
  .setSelection({ type: "text", blockId: "intro", from: 0, to: 5 })
  .setBlockType("heading", { level: 2 })
  .toggleItalic()
  .run();
```

`run()` returns `true` when it dispatched a transaction or only moved focus, and `false`
when nothing was staged or a transaction filter cancelled the change. It throws
`VALIDATION_ERROR` or `TRANSFORM_ERROR` when the result is invalid, for example when a
command inserts a block type the editor's extensions don't declare. Each `chain()` call
returns a new chain; use it once.

### How a chain reads the document

Commands in one chain all read the document and selection as they were when the chain
started; they don't see each other's changes.

- `chain().insertBlockAfter("paragraph").insertBlockAfter("divider")` inserts both right
  after the current block, so the divider ends up first.
- `setSelection()` is the exception: later commands in the chain use the staged
  selection, and it becomes the selection after the transaction. The same holds for
  `selectAll()` and `selectBlock()`. When the chain's own steps remove the staged block
  or shorten its text, the selection moves as the caret does. Text merged into the
  previous block keeps its place there. A removed block gives way to the start of the
  next remaining text block, or the end of the previous one. An offset past the end of
  the text goes to the end. A removed selected block leaves a caret. Chains such as
  `chain().selectAll().deleteBlock().run()` and `setSelection(…).mergeWithPrevious()` rely
  on this.
- `undo()` and `redo()` replace the chain: `run()` performs only the undo or redo and
  drops the other staged commands.

Chain commands that touch different parts of the document, or run separate chains.

### Buttons and focus

A toolbar button takes focus away from the document. Cancel `mousedown` on the button and
start the chain with `focus()`, so the command uses the document's selection and the caret
returns afterwards:

```tsx title="BoldButton.tsx"
import type { GoTipeEditor } from "@gotipe/core";

export function BoldButton({ editor }: { editor: GoTipeEditor }) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => editor.chain().focus().toggleBold().run()}
    >
      Bold
    </button>
  );
}
```

## Marks

Mark commands apply to every rich-text block the selection covers, including the list items
and table cells of a selection across blocks or of a selected list or table. Lists, tables,
dividers, images and code blocks themselves are passed over. With a caret and no selected
text, `toggle*` commands switch the mark on or off for the next text the user types.

| Command | Description |
|---|---|
| `toggleBold()`, `toggleItalic()`, `toggleUnderline()`, `toggleStrikethrough()`, `toggleCode()` | Toggle `bold`, `italic`, `underline`, `strikethrough` or `code`. |
| `toggleSuperscript()`, `toggleSubscript()` | Toggle `superscript` or `subscript`. |
| `toggleHighlight(color?)` | Toggle `highlight`, with `{ color }` when given. |
| `toggleMark(type, attrs?)` | Remove the mark when all selected text has it, otherwise add it. |
| `addMark(type, from?, to?, attrs?)` | Add a mark to the selection, or to `[from, to)` in the block at the selection anchor. Text that has the mark takes the new attributes. |
| `setMark(type, attrs?)` | `addMark` on the selection. |
| `removeMark(type, from?, to?)` | Remove a mark from the selection or the given range. |
| `unsetMark(type)` | `removeMark` on the selection. |
| `setLink(href, target?)` | Add a `link` mark with `href` and `target` (`"_blank"` by default). |
| `removeLink()` | Remove links from the selection. |
| `clearFormatting()` | Remove every mark from the selected text. |

Adding a mark replaces a mark of the same type, so `setLink(href)` changes the address of
a link and `setMark("textColor", { color })` recolours text, as one undo step. Attributes
you leave out get the defaults the mark declares: `setLink` stores `target` and `rel`.
Superscript and subscript share an exclusive group: adding one removes the other.

## Blocks

| Command | Description |
|---|---|
| `setBlockType(type, attrs?)` | Turn the block at the selection anchor into `type`, replacing its attributes and keeping its ID. A list item turned into another type leaves its list, which splits around it. |
| `setBlockAttrs(blockId, attrs)` | Merge `attrs` into a block's attributes. |
| `insertBlockAfter(type, attrs?)`, `insertBlockBefore(type, attrs?)` | Insert an empty block next to the current one. Inside a parent that doesn't accept `type` (a list, a table), it goes next to that parent instead. The caret doesn't move. |
| `insertText(text)` | Replace the selection with unformatted `text` and put the caret after it. Works across blocks. |
| `insertHardBreak()` | `insertText("\n")`: a line break inside the block. |
| `deleteBlock(blockId?)` | Delete a block with its children; the current block by default. |
| `duplicateBlock(blockId?)` | Insert a copy with new IDs after the block. |
| `moveBlockUp(blockId?)`, `moveBlockDown(blockId?)` | Swap the block with its previous or next sibling. |
| `moveBlock(blockId, targetIndex)` | Move a block to `targetIndex` among the top-level blocks. |
| `splitBlock()` | Split the block at the caret; the new block below gets a new ID. The caret stays in the first block. |
| `mergeWithPrevious()` | Append the block to its previous sibling. |

`setBlockType`, `insertBlockAfter`, `insertBlockBefore` and the list commands give the new
block the declared default of every attribute you leave out, such as `type: "info"` for a
callout or `language: ""` (plain text) for a code block. A heading level that the `Heading`
extension doesn't offer stages nothing (see `values` in
[attributes](/docs/concepts/extensions#attributes)).

The content follows the `content` the type declares, for built-in node types and your own
alike: a new block starts with empty rich text (`[]`), raw text (`""`) or none (`null`), and
`setBlockType` keeps the text as spans or as raw text without marks, or drops it for a type
without content. In an editor without a schema (`extensions: []`) no type declares one: a new
block gets rich text and `setBlockType` leaves the content as it is.

## Lists

| Command | Description |
|---|---|
| `toggleBulletList()`, `toggleOrderedList({ start }?)`, `toggleTodoList()` | Wrap a paragraph, heading, quote, code block or callout in a list. In a list of another kind, convert that list. In a list of the same kind, turn all its items into paragraphs. |
| `setBulletList()`, `setOrderedList({ start }?)`, `setTodoList()` | Like the toggles, but never unwrap a list of the same kind. |
| `indent()` | Nest the list item under the previous item. |
| `outdent()` | Move a nested list item one level out. |
| `splitListItem()` | Same as `splitBlock()`. |

## Structures

| Command | Description |
|---|---|
| `insertTable({ rows, cols, withHeader? })` | Insert a table after the current block; `withHeader` makes the first row header cells. At most 5,000 cells. |
| `insertColumns(count = 2)` | Insert 1 to 12 columns, each with an empty paragraph. Needs the `Columns` extension. |
| `insertToggle()` | Insert an open toggle with an empty summary and an empty paragraph. |
| `goToNextCell()`, `goToPrevCell()` | Select the text of the next or previous cell of the same table; at its last or first cell, return `false` from `run()`. |

Rows and columns of an existing table change with `editTable`, a function rather than a
chain command. It dispatches one transaction and returns its result:

```ts
import { editTable } from "@gotipe/core";

editTable(editor, "table-1", { type: "insertRow", index: 1 });
editTable(editor, "table-1", { type: "resizeColumn", index: 0, width: 240 });
```

| Edit | Description |
|---|---|
| `{ type: "insertRow", index }`, `{ type: "deleteRow", index }` | Insert an empty row, or delete one; deleting the only row deletes the table. |
| `{ type: "insertColumn", index }`, `{ type: "deleteColumn", index }` | Insert an empty cell in every row, or delete a column; deleting the only column deletes the table. |
| `{ type: "resizeColumn", index, width }` | Set the column width in pixels, rounded and kept between 64 and 1600. |

`editTable` returns `false` on a read-only or destroyed editor and throws
`VALIDATION_ERROR` when the table is missing, the index is out of range or the table has
merged cells.

## Selection, focus and history

| Command | Description |
|---|---|
| `setSelection(selection)` | Stage a [selection](/docs/concepts/transactions#selection) for the following commands without moving the live caret first. |
| `selectAll()` | Select from the start of the first text block to the end of the last. |
| `selectBlock(blockId?)` | Select a whole block; the current one by default. |
| `focus(position?)` | Focus the mounted editor when the chain runs; `"start"` or `"end"` also moves the caret. |
| `undo()`, `redo()` | Undo or redo instead of the other staged commands. |
| `run()` | Dispatch the staged commands as one transaction. |

## Keyboard shortcuts

The built-in extensions bind these keys. `Mod` is Cmd on macOS and Ctrl elsewhere.

| Keys | Command |
|---|---|
| `Mod-B`, `Mod-I`, `Mod-U`, `Mod-E` | `toggleBold`, `toggleItalic`, `toggleUnderline`, `toggleCode` |
| `Mod-Shift-X`, `Mod-Shift-H` | `toggleStrikethrough`, `toggleHighlight` |
| `Mod-.`, `Mod-,` | `toggleSuperscript`, `toggleSubscript` |
| `Mod-Alt-1` … `Mod-Alt-6` | `setBlockType("heading", { level })` for the configured heading levels |
| `Mod-Shift-7`, `Mod-Shift-8`, `Mod-Shift-9` | `toggleOrderedList`, `toggleBulletList`, `toggleTodoList` |
| `Mod-Shift-B` | `setBlockType("blockquote")` |
| `Tab`, `Shift-Tab` in a list | `indent`, `outdent` |
| `Tab`, `Shift-Tab` in a table | `goToNextCell`, `goToPrevCell` |
| `Mod-Z`; `Mod-Shift-Z` or `Mod-Y` | `undo`; `redo` |
| `Mod-K` | Emits `openLinkDialog`: the link field of `BlockEditor` or `FixedToolbar` opens over selected text, or your own link interface |

The full list, including the editor UI's keys, is in [keyboard](/docs/ui/keyboard).

## Reading state

Interfaces decide what to show from the view state:

| Method | Returns |
|---|---|
| `editor.isActive(name, attrs?)` | `true` when `name` is an active mark at the selection, or the current block has type `name` and the given attribute values. |
| `editor.getCurrentBlock()` | `{ type, id, attrs, isEmpty }` of the block at the selection anchor, or `null`. |
| `editor.getViewState().toolbar` | `activeMarks`, `activeBlockType`, `activeBlockAttrs`, `canUndo`, `canRedo`. |
| `editor.hasExtension(name)` | `true` when the editor was created with an extension of that name, alone or in a preset; fixed for the editor's life. |

Active marks are read at the caret, or at the start of the selected range. In React,
`useEditorState(editor, (state) => state.toolbar)` re-renders when they change.

## Limitations

- `insertText` inserts unformatted text; it ignores marks toggled with a caret.

## Related

- [Transactions](/docs/concepts/transactions) for edits that commands don't cover.
- [Extensions](/docs/concepts/extensions): bind your own keys to commands.
- [Menus](/docs/ui/menus) in the ready UI.
