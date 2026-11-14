---
title: Editing aids
description: TrailingNode keeps a paragraph at the end of the document, InvisibleCharacters shows spaces and paragraph ends, and Focus marks the block with the caret.
packages: ["@gotipe/core"]
license: MIT
---

Three small extensions without nodes or marks. None is in a preset.

```ts title="editor.ts"
import { createEditor } from "@gotipe/core";
import {
  Focus,
  InvisibleCharacters,
  TrailingNode,
  toggleInvisibleCharacters,
} from "@gotipe/core/extensions";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({
  extensions: [DefaultPreset, TrailingNode, InvisibleCharacters, Focus],
});
toggleInvisibleCharacters(editor);
```

| Extension | Name | Adds |
| --- | --- | --- |
| `TrailingNode` | `trailingNode` | An empty paragraph after a last block of another type |
| `InvisibleCharacters` | `invisibleCharacters` | The `invisibles` decoration layer |
| `Focus` | `focus` | The `focus` decoration layer |

## Trailing node

When the last top-level block is not a paragraph (a table, code, an image, a divider, a list, a heading), there is no line to click into below it. `TrailingNode` appends an empty paragraph.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `node` | `string` | `"paragraph"` | Type of the appended block. It must hold rich text. |
| `notAfter` | `string[]` | `[]` | More types that need nothing after them. |

A last paragraph, or a last block of the `node` type, never gets a block after it; `notAfter` adds to them. With `TrailingNode.configure({ notAfter: ["heading"] })` a document may end with a paragraph or a heading.

- The block is added when the editor is created, after every change, Undo, Redo and `setContent`, and when a read-only editor becomes editable. A read-only editor is never changed.
- It adds no undo step: after loading a document that ends with a table, Undo has nothing to undo. Undo of your own change is still one step.
- It is a real block of the document: `update` is emitted, and the block is saved with the rest. Remove it when you save if you need the document byte for byte as loaded.

The transaction carries `metadata: { addToHistory: false }`; any transaction of yours can use it too. See [history](/docs/concepts/transactions#history).

### With collaboration

Every replica must start from the same document, and two people must not both append a paragraph. So with collaboration the rules change:

- When `enableCollaboration` is called, the paragraph that was added to the loaded document is removed again if nobody has typed in it: the baseline is exactly what was loaded.
- After that only your own edits count. When a change you dispatch leaves the document ending with another block, your editor appends the paragraph, and the others receive it like any edit.
- A remote update, Undo, Redo and `setContent` never append one, and neither does the repair of inline atoms that follows a remote update (a transaction with `metadata: { origin: "repair" }`). A document whose baseline ends with a table gets its paragraph with the first edit anyone makes.

Enable collaboration before the user can type, as the [provider](/docs/collaboration/provider) does: a paragraph that already has text is part of the document and stays.

## Invisible characters

A decoration layer that shows what is otherwise invisible. It is off until you turn it on, and it never changes the document.

| Function | Description |
| --- | --- |
| `setInvisibleCharacters(editor, visible)` | Shows or hides the layer. Returns `false` without the extension. |
| `toggleInvisibleCharacters(editor)` | Switches it. |
| `isInvisibleCharactersVisible(editor)` | Whether it is shown. |

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `visible` | `boolean` | `false` | Shown from the start. |

The layer is named `invisibles`. In rich-text blocks it has an `inline` decoration on each character below and a `widget` at the end of every block:

| Character | Class | `data-gotipe-invisible` |
| --- | --- | --- |
| Space | `gotipe-sp` | `space` |
| No-break space, narrow no-break space | `gotipe-nbsp` | `nbsp` |
| Line break inside a block | `gotipe-br` | `break` |
| End of the block | `gotipe-pilcrow` | `paragraph` |

> [!NOTE]
> The themes do not style these classes yet. Until they do, draw the marks yourself, for example `.gotipe-pilcrow::after { content: "¶" }`.

Code blocks and other raw-text blocks are not decorated.

## Focus

Marks the block that holds the caret, so you can dim the rest of the page or outline the current block.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `className` | `string` | `"has-focus"` | Class of the marked block. |
| `mode` | `"deepest" \| "all" \| "shallowest"` | `"deepest"` | The block itself; the block and all its ancestors; or only its top-level ancestor. |
| `onlyWhenFocused` | `boolean` | `true` | Mark nothing while the editor surface does not have focus. |

The layer is named `focus` and holds `node` decorations: the renderers add the class and `data-gotipe-focus` to the block's element. With a selection across blocks the marked block is the one with the selection's head.

```css title="focus.css"
.gotipe-content:focus-within > [data-block-id]:not(.has-focus) {
  opacity: 0.5;
}
```

## Related

- [Extensions](/docs/concepts/extensions#plugins-and-decorations): decoration layers and how the renderers draw them.
- [Behaviours](/docs/extensions/behaviors): History, Placeholder, SlashCommands.
