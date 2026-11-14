---
title: Text alignment and direction
description: TextAlign aligns paragraphs and headings left, center, right or justified; TextDirection sets a block's direction. Commands, shortcuts, the More menu and HTML output.
packages: ["@gotipe/core", "@gotipe/block-editor"]
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

## Alignment in the interface

- The bubble's **More** menu of `BlockEditor` starts with an **Alignment** group (GoTipe Atlas, frame 27): the four alignments, the current one ticked and the others with their keys. The group is disabled when the caret is not in a paragraph or heading.
- `AlignPicker` from `@gotipe/block-editor` is the same list for a fixed toolbar: the current alignment's glyph and a chevron. [FixedToolbar](/docs/ui/fixed-toolbar) has it; where the block takes no alignment, its tooltip says so.
- Show the keys only with `TextAlign` installed: the menu lists `Mod+Shift+L/E/R/J`, which the extension binds.

## Text direction

`TextDirection` adds the block attribute `dir` (`"ltr"`, `"rtl"` or `"auto"`) to paragraphs, headings, list items and tasks; `Paragraph`, `Heading`, `ListItem` and `TodoList` declare it.

```ts title="direction.ts"
import { TextDirection, getTextDirection, setTextDirection, unsetTextDirection } from "@gotipe/core/extensions";

setTextDirection(editor, "rtl"); // the selected blocks, one undo step
getTextDirection(editor); // "rtl" | "ltr" | "auto" | null
unsetTextDirection(editor);
```

- **Automatic direction.** Without `dir` the React and Vue renderers give every paragraph, heading and list item `dir="auto"`: a block whose first strong character is Arabic or Hebrew runs right to left, and a Russian line in an Arabic interface runs left to right. Set `dir` only to override that.
- **Handle.** In `BlockEditor` the handle of a right-to-left block stands in the right gutter, where its lines start, with its buttons mirrored (frame 28). In a container too narrow for a right gutter it stays on the left rather than cover the text.
- **Keys and caret.** The arrow keys follow the visual order, as the browser moves them; the document keeps logical UTF-16 offsets, so Backspace, Delete, selection and typing in a right-to-left paragraph mean the same on the JavaScript and WASM engines.
- **HTML** writes `dir` before the alignment, `<p dir="rtl" style="text-align:right">`, and reading HTML takes the `dir` attribute of `<p>`, `<h1>`–`<h6>` and `<li>` back. **Markdown** has no syntax for it: blocks you do not edit keep their source bytes, an edited block is written without `dir`. PDF and DOCX ignore it.
- Changing a block's type (a paragraph to a heading or a list item and back) keeps `dir` when the new type declares it.

## Limitations

- List items, quotes, callouts and table cells are not aligned by `TextAlign`.
- A justified PDF line widens only breakable spaces; a line without one stays at its start.

## Related

- [Text blocks](/docs/extensions/text-blocks): `Paragraph` and `Heading`.
- [Tables](/docs/extensions/tables#widths-and-alignment): column alignment is separate.
