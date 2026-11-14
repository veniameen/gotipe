---
title: Text alignment
description: TextAlign aligns paragraphs and headings left, center, right or justified through the align attribute, with commands, shortcuts and HTML output.
packages: ["@gotipe/core"]
license: MIT
---

Paragraphs and headings have an `align` attribute. The `TextAlign` extension adds the commands and shortcuts that set it.

```ts title="align.ts"
import { createEditor } from "@gotipe/core";
import { TextAlign, setTextAlign, unsetTextAlign } from "@gotipe/core/extensions";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({ extensions: [DefaultPreset, TextAlign] });

setTextAlign(editor, "center"); // the paragraphs and headings in the selection
unsetTextAlign(editor); // back to the default
```

`TextAlign` is in no preset. The attribute itself belongs to `Paragraph` and `Heading`, so a document with aligned blocks is valid, renders and exports with or without the extension.

## Attribute

| Attribute | Blocks | Type | Description |
| --- | --- | --- | --- |
| `align` | `paragraph`, `heading` | `"left" \| "center" \| "right" \| "justify"` | Alignment of the block's text. Absent or `null` is the default of the page. Any other value is rejected by both engines. |

A new paragraph made by Enter keeps the alignment of the paragraph it was split from. Turning a paragraph into a heading or back, with `setBlockType` or by typing `#` and a space, keeps it; a type that does not declare `align` (a quote, a list item) drops it.

## Commands

| Command | Description |
| --- | --- |
| `setTextAlign(editor, alignment, types?)` | Aligns every paragraph and heading the selection covers, as one undo step. Returns `false` when nothing changes: no such block is selected, they are aligned so already, or the editor is read-only. |
| `unsetTextAlign(editor, types?)` | Sets `align` to `null` on the same blocks. |
| `getTextAlign(editor)` | Alignment of the block that holds the caret, or `null`. |

`types` defaults to `["paragraph", "heading"]`. A block of another type takes `align` only when its node declares the attribute.

| Key | Action |
| --- | --- |
| `Mod+Shift+L` | Left |
| `Mod+Shift+E` | Center |
| `Mod+Shift+R` | Right |
| `Mod+Shift+J` | Justify |

`Mod` is Cmd on macOS and Ctrl elsewhere. While a paragraph or heading is selected the keys are always handled by the editor, also when the block is aligned so already, and the browser's own action for the key does not run.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `types` | `string[]` | `["paragraph", "heading"]` | Block types the shortcuts align. |

## Rendering and output

- **React and Vue** put `data-align` and an inline `text-align` on the block's element.
- **HTML** (`editor.getHTML()`, `serializeHtml`, the native export) writes `style="text-align:center"` on the `<p>` or heading. Reading HTML (`setContent(html)`, pasted HTML) takes `text-align` or the `align` attribute of `<p>` and `<h1>`–`<h6>` back, for the same four values.
- **PDF** aligns the lines of the paragraph or heading; a justified paragraph widens the spaces between words, except on its last line and on lines that end with a line break.
- **DOCX** writes the paragraph's justification (`left`, `center`, `right`, `both`).
- **Markdown** has no syntax for alignment. `editor.getMarkdown()` writes an aligned block as an ordinary paragraph or heading, and the alignment is not read back. Keep the JSON document when alignment must survive.
- **Migration** maps Tiptap's `textAlign`, Lexical's element `format` and Slate's `align` to `align`; see [Migration](/docs/conversion/migration).

## Limitations

- List items, quotes, callouts and table cells are not aligned by `TextAlign`.
- A justified PDF line widens only breakable spaces; a line without one stays at its start.

## Related

- [Text blocks](/docs/extensions/text-blocks): `Paragraph` and `Heading`.
- [Tables](/docs/extensions/tables#widths-and-alignment): column alignment is separate.
