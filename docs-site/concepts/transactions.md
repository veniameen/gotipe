---
title: Transactions
description: How a GoTipe document changes, steps, atomic dispatch, previews, filters, selection, undo history and UTF-16 offsets.
packages: ["@gotipe/core"]
license: MIT
---

Every change to a document is a transaction: an ordered list of steps plus an optional
selection. The editor checks the whole result against the schema before anything changes,
then commits it as one undo step; text typed in a row shares one (see [History](#history)).
Typing, paste, [commands](/docs/concepts/commands) and collaboration all go through this
path. Use transactions directly when a command doesn't fit, for example to edit a block by
ID from outside the editor.

## Dispatch a transaction

```ts title="dispatch.ts"
import { createEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({
  extensions: [DefaultPreset],
  engine: "js",
  content: {
    version: 1,
    blocks: [
      {
        id: "intro",
        type: "paragraph",
        attrs: {},
        content: [{ text: "Hello world", marks: [] }],
        children: [],
      },
    ],
  },
});

editor.dispatch({
  steps: [
    { type: "insertText", blockId: "intro", offset: 11, text: "!", marks: [] },
    { type: "addMark", blockId: "intro", from: 0, to: 5, mark: { type: "bold", attrs: {} } },
  ],
  selection: { type: "cursor", blockId: "intro", offset: 12 },
});

console.log(editor.getMarkdown()); // "**Hello** world!\n"
```

`dispatch` returns `true` when the transaction was applied and `false` when a
[filter](#filters) cancelled it. It throws when the transaction is invalid.

| Field | Type | Description |
|---|---|---|
| `steps` | `Step[]` | Applied in order; each step sees the result of the previous ones. |
| `selection` | `Selection` | Optional selection after the change. Without it the editor maps the old selection. |
| `metadata` | `Record<string, AttrValue>` | Optional data for filters and `transaction` listeners. |

## Steps

| Step | Fields | Effect |
|---|---|---|
| `insertText` | `blockId`, `offset`, `text`, `marks` | Inserts `text` with `marks`. The block must allow those marks. Of several marks of one type or one exclusive group, the last one counts. |
| `deleteText` | `blockId`, `from`, `to` | Deletes `[from, to)` inside one block. `deleteRange` is an alias. |
| `addMark` | `blockId`, `from`, `to`, `mark` | Adds `mark` to the range. A mark of the same type is replaced in its place, so the text takes the new attributes; marks of the same exclusive group are removed. |
| `removeMark` | `blockId`, `from`, `to`, `markType` | Removes marks of `markType` from the range. |
| `insertBlock` | `parentId`, `index`, `block` | Inserts a block tree; `parentId: null` means top level. Every ID in the tree must be new. An `index` past the end appends. |
| `deleteBlock` | `blockId` | Removes the block with its children. |
| `moveBlock` | `blockId`, `newParentId`, `newIndex` | Moves a block with its children. It can't move into its own subtree. |
| `setBlockType` | `blockId`, `newType`, `attrs` | Changes the type and replaces all attributes. Content converts to the `content` the new type declares: rich text, raw text or none; converting to a type without content drops the text. Without a schema the content stays as it is. |
| `setBlockAttrs` | `blockId`, `attrs` | Merges `attrs` into the existing attributes. |
| `splitBlock` | `blockId`, `offset` | Moves the text after `offset` into a new block below, with a new ID. A heading continues as a paragraph; other types keep type and attributes. Children stay in the first block. |
| `mergeBlocks` | `blockId`, `targetId` | Appends the text of `blockId` to `targetId`, moves its children to the end of the target's children and removes it. Both must hold rich text, or both raw text. |

Steps carry attributes as written: unlike [commands](/docs/concepts/commands), they don't
fill in the defaults a block or mark type declares.

## Atomicity and errors

The editor applies all steps to a staged copy, validates every step and the final document
against the schema, and only then commits. If any part fails, `dispatch` throws a
`GoTipeError` and nothing changes: no document, selection, history or events.

| Code | Cause |
|---|---|
| `VALIDATION_ERROR` | A step or the result doesn't match the schema: unknown type or mark, undeclared or wrong attribute, a block where its parent doesn't accept it. |
| `TRANSFORM_ERROR` | A step can't apply: offset out of range or inside a surrogate pair, duplicate ID, a move into its own subtree, an invalid `selection`, or a filter that dispatches. |

`previewTransaction(transaction)` runs the same staging and validation and returns the
resulting `Document` without committing. It doesn't run filters, touch history or emit
events, and throws the same errors:

```ts
const after = editor.previewTransaction({
  steps: [{ type: "deleteBlock", blockId: "intro" }],
});
console.log(after.blocks.length);
```

## Filters

`addTransactionFilter` registers a function that sees every validated local dispatch
before it commits. Return `false` to cancel it. The function receives detached copies of
`transaction`, `before` and `after`, and returns an unsubscribe function.

```ts title="limit.ts"
import type { Block } from "@gotipe/core";

const LIMIT = 5000;
const textLength = (blocks: Block[]): number =>
  blocks.reduce((sum, block) => {
    const own =
      typeof block.content === "string"
        ? block.content.length
        : (block.content ?? []).reduce((n, span) => n + span.text.length, 0);
    return sum + own + textLength(block.children);
  }, 0);

// Reject changes that grow the text past the limit; deleting is always allowed.
const stop = editor.addTransactionFilter(
  ({ before, after }) => textLength(after.blocks) <= Math.max(LIMIT, textLength(before.blocks)),
);
// Later: stop();
```

A cancelled transaction makes `dispatch` and `chain().run()` return `false`; typing and
paste are cancelled the same way. Filters apply to local dispatches only: Undo and Redo,
`setContent` and remote collaboration updates are not filtered. A filter can't dispatch;
doing so throws `TRANSFORM_ERROR`.

## Selection

| Selection | Fields | Meaning |
|---|---|---|
| `cursor` | `blockId`, `offset` | A caret. |
| `text` | `blockId`, `from`, `to` | A range inside one block; `from` ≤ `to`. |
| `range` | `anchor`, `head` (each `{ blockId, offset }`) | A directional range, possibly across blocks. |
| `block` | `blockId` | A whole block, such as an image. |
| `multi` | `blockIds` | Several whole blocks; IDs must exist and be unique. |

A transaction's `selection` is validated against the new document and becomes the
selection afterwards. Without one, the editor keeps the old selection on the same block
IDs and clamps offsets to the new text length; it does not shift a caret for text inserted
before it, so pass `selection` when you insert at or before the caret. If the selected
block is removed, the caret moves to the block now at its position.

`getViewState().selection` reports the live selection as `text`, `block` or `multi`, with
`anchor`, `head` and, for `multi`, `blockIds`. To change only the selection, dispatch a
transaction with no steps, or call `editor.setSelection({ anchor, head })`, which skips
validation and filters.

## Offsets are UTF-16

Offsets count UTF-16 code units, like JavaScript string indexes, in both engines. An emoji
outside the Basic Multilingual Plane counts as two:

```ts
// The block text is "Hi 😀!" — "😀" occupies offsets 3 and 4.
editor.dispatch({ steps: [{ type: "insertText", blockId: "b1", offset: 5, text: "?", marks: [] }] }); // after the emoji
editor.dispatch({ steps: [{ type: "insertText", blockId: "b1", offset: 4, text: "?", marks: [] }] }); // throws TRANSFORM_ERROR
```

An offset inside a surrogate pair is rejected. The engine does not protect grapheme
clusters, such as an emoji with a skin-tone modifier or a letter with a combining accent;
use `Intl.Segmenter` when you compute offsets from what the user sees.

## History

Each committed dispatch is one undo step that restores the document and the selection
from before it. `editor.undo()` and `editor.redo()` return `false` when there is nothing to
undo or redo, and `getViewState().toolbar` reports `canUndo` and `canRedo`.

Typing is the exception. Text typed in a row in one block is one undo step, and so is text
deleted with Backspace or Delete in a row. Typing over selected text starts a step that the
following typing joins, and deleting it one that the following deleting joins, also when
the selection spans blocks: one Undo brings the selected text back. A whole selected block,
such as an image, is replaced or deleted in a step of its own. The step ends when:

- you pause for 500 ms, the gap the collaboration history groups by too;
- the caret or the selection moves, even back to the same place, or typing goes to another
  block;
- typing turns into deleting, or deleting into typing;
- any other change commits: Enter, a line break, paste, an input rule, a command or a
  `dispatch`, a formatting toggle at the caret, Undo or Redo.

An IME composition is typing too: it goes on with the step of the typing before it, and
typing after it goes on with its step. The pause before a composition counts from its start,
so Korean, where every syllable is a composition of its own, is one step however long each
syllable takes to compose. Only the editor's own input is grouped: every `dispatch` is a step
of its own, even one that inserts a character at the caret.

- A new dispatch clears the redo stack. The editor keeps the last 100 steps, and text typed
  in a row is one of them however long it is.
- Selection-only transactions, stored-mark toggles, cancelled and failed dispatches add no
  undo step. A character a filter cancels doesn't end the typing step.
- `setContent` clears the history. Pass `{ addToHistory: true }` to make the replacement
  one undo step instead.
- A transaction with `metadata: { addToHistory: false }` is committed without an undo
  step, leaves the redo stack as it is and doesn't end the typing step. Use it for changes
  the user did not make, as [TrailingNode](/docs/extensions/editing-aids#trailing-node)
  does. Without collaboration, Undo of an earlier step restores the document from before
  that step, so such a change goes with it.
- After `enableCollaboration`, history moves to the CRDT: Undo reverts your own changes and
  keeps the other peers' edits. It groups your typing by the same 500 ms pause within one
  block; see [Limitations](#limitations) for where its steps differ.

To make several changes one undo step, put them in one transaction or one command chain.

## Read-only

`editable: false` and `setEditable(false)` block user input, paste and drop. `dispatch`
and commands still change the document, so programmatic edits keep working.

## Limitations

> [!NOTE]
> With collaboration, the CRDT history groups typing by the pause and the block alone:
> typing and deleting go into one step, moving the caret inside the block doesn't end it,
> and typing over a selection is two steps, the first character and the rest.

## Related

- [Commands](/docs/concepts/commands) build transactions from the selection.
- [Events](/docs/concepts/events): `transaction` and `update` after a commit.
- [Document model](/docs/concepts/document-model).
