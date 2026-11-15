---
title: Text blocks
description: Paragraph, Heading, Blockquote, Divider, Callout, Toggle and Columns, with their attributes, commands, shortcuts and Markdown form.
packages: ["@gotipe/core"]
license: MIT
---

The blocks on this page hold text or structure the page. All of them come from `@gotipe/core/extensions`; the commands are methods of `editor.chain()` (see [Commands](/docs/concepts/commands)). In the tables below, `Mod` is Cmd on macOS and Ctrl elsewhere.

```demo
block-editor
```

| Extension | Presets | Markdown |
| --- | --- | --- |
| `Paragraph` | Minimal, Default, Full | Paragraph |
| `Heading` | Default, Full | `#` headings |
| `Blockquote` | Default, Full | `>` quote |
| `Divider` | Default, Full | `---` |
| `Callout` | Default, Full | GFM alert |
| `Toggle` | Default, Full | None |
| `Columns` | Full | None |

## Paragraph

`paragraph` holds rich text. Its one attribute is `align` (`"left"`, `"center"`, `"right"` or `"justify"`), set by [TextAlign](/docs/extensions/text-align). It is the block a new document starts with and the block Enter creates after a heading, quote or callout.

| Command | Description |
| --- | --- |
| `setBlockType("paragraph")` | Turns the current block into a paragraph. A list item is lifted out of its list, which is split around it. |
| `splitBlock()` | Splits the paragraph at the caret into two paragraphs. |

The "/" menu lists it as **Text**. In Markdown it is a paragraph.

## Heading

`heading` holds rich text and a `level`.

```ts title="editor.ts"
import { createEditor } from "@gotipe/core";
import { Heading, Paragraph } from "@gotipe/core/extensions";

const editor = await createEditor({
  extensions: [Paragraph, Heading.configure({ levels: [1, 2, 3] })],
});
editor.chain().setBlockType("heading", { level: 2 }).run();
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `levels` | `number[]` | `[1, 2, 3, 4, 5, 6]` | The levels the editor creates: input rules, shortcuts, the "/" menu and commands offer only these. `DefaultPreset` uses `[1, 2, 3]`. |

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `level` | `number` | The lowest of `levels` | Heading level. Renderers clamp it to 1–6. |
| `align` | `"left" \| "center" \| "right" \| "justify"` | — | Alignment of the text, set by [TextAlign](/docs/extensions/text-align). |

| Command | Description |
| --- | --- |
| `setBlockType("heading", { level })` | Turns the current block into a heading of that level. A level outside `levels` stages nothing; without `level` the heading gets the lowest of `levels`. |

| Key or input | Action |
| --- | --- |
| `Mod+Alt+1` … `Mod+Alt+6` | Heading 1 to 6, for the levels in `levels` |
| `#` and a space in an empty block | Heading 1; `##` for 2, up to `######` for 6, for the levels in `levels` |
| Enter | Splits the heading; the text after the caret goes to a new paragraph |

The "/" menu offers Heading 1, 2 and 3 when they are in `levels`. In Markdown a heading is written in ATX form (`## Title`); setext headings (underlined with `===` or `---`) are read as headings and rewritten in ATX form once edited. A line break inside a heading is written as `<br>`.

> [!NOTE]
> `levels` limits what the editor creates, not what a document may hold. Content you load or paste keeps its headings of other levels, and they render, export and edit as usual; the schema accepts any number as `level`.

## Blockquote

`blockquote` holds rich text and may contain paragraphs and headings as child blocks.

| Command | Description |
| --- | --- |
| `setBlockType("blockquote")` | Turns the current block into a quote. |

| Key or input | Action |
| --- | --- |
| `Mod+Shift+B` | Turns the current block into a quote |
| `>` and a space in an empty block | Starts a quote |
| Enter | Splits the quote; the text after the caret goes to a new paragraph |
| Shift+Enter | Line break inside the quote |

The "/" menu lists it as **Quote**. In Markdown it is a `>` quote. A quote is read as `blockquote` only when it holds exactly one paragraph; other quotes are kept as raw Markdown. A blockquote with child blocks is written as a quote of several paragraphs, so it comes back from Markdown as a raw block.

## Divider

`divider` is a horizontal rule without content.

| Command | Description |
| --- | --- |
| `insertBlockAfter("divider")` | Inserts a divider after the current block. |

Type `---` in an empty top-level paragraph to replace it with a divider and a new paragraph. The "/" menu lists it as **Divider**. In Markdown it is `---`; `***` and `___` are read as dividers too. A divider at the very start of a file without front matter is written as `***`, so it is not read back as front matter.

## Callout

`callout` holds rich text and may contain child blocks of any type.

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `"info" \| "warning" \| "error" \| "success" \| "note" \| "tip" \| "important" \| "caution"` | `"info"` | Kind of callout; selects its icon and colours. |
| `emoji` | `string` | `""` | Emoji shown instead of the icon. |
| `alert` | `string` | — | GFM alert name read from Markdown, such as `"WARNING"`. |

| Command | Description |
| --- | --- |
| `insertBlockAfter("callout", { type: "warning" })` | Inserts an empty callout after the current block. |
| `setBlockAttrs(blockId, { type: "tip" })` | Changes the kind of an existing callout. |

The "/" menu inserts an `info` callout after the current block; in `PageEditor` it turns the current block into a `note` callout. There is no shortcut or input rule. Enter splits the callout like a quote: the text after the caret goes to a new paragraph.

In the editor UI a callout shows the icon of its kind. When `emoji` is set, the emoji takes the icon's place and is a button that edits it (up to 32 characters). The UI has no control for `type`; set it with `setBlockAttrs`.

In Markdown a callout is a GFM alert:

| `type` | Written as |
| --- | --- |
| `note`, `info` | `> [!NOTE]` |
| `tip`, `success` | `> [!TIP]` |
| `important` | `> [!IMPORTANT]` |
| `warning` | `> [!WARNING]` |
| `caution`, `error` | `> [!CAUTION]` |

A valid `alert` takes precedence over `type`. Reading `> [!WARNING]` gives `{ type: "warning", alert: "WARNING" }`. The emoji is not written to Markdown, and a callout with child blocks comes back from Markdown as a raw block.

> [!NOTE]
> The schema also accepts the type `agent` so that older stored documents stay valid. It has no behaviour of its own and is written to Markdown as `[!NOTE]`.

## Toggle

`toggle` is a collapsible block: its rich text is the summary line, and its child blocks (paragraphs, headings, bullet and numbered lists, code blocks) are the hidden content.

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `open` | `boolean` | `false` | Whether the content is shown. |

| Command | Description |
| --- | --- |
| `insertToggle()` | Inserts an open toggle after the current block, with an empty summary and an empty paragraph inside. The editor UI shows the summary's placeholder in the interface language. |
| `setBlockAttrs(blockId, { open: false })` | Opens or closes a toggle. |

The "/" menu lists it as **Toggle**. In the editor UI the chevron opens and closes it; that writes `open` to the document as an undoable change. In read-only mode the chevron opens the toggle for the reader only and leaves the document unchanged.

Markdown has no toggle: the summary is written as a paragraph, followed by the content.

## Columns

`columns` lays out its `column` children side by side. A column holds paragraphs, headings, bullet and numbered lists, code blocks and images.

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `count` | `number` | `2` | Number of columns the block was created with. |

| Command | Description |
| --- | --- |
| `insertColumns(count)` | Inserts a columns block after the current block, each column with an empty paragraph. `count` defaults to 2 and must be 1 to 12, otherwise the command throws `TRANSFORM_ERROR`. |

The "/" menu lists it as **Columns** and inserts two columns. The theme draws equal-width columns (`.gotipe-columns`, `.gotipe-column`).

> [!NOTE]
> Columns do not stack in a narrow container; they keep sharing its width. Markdown has no columns: the blocks of each column are written one after another.

## Line breaks

Shift+Enter inserts a line break (`"\n"`) in the current block; `insertHardBreak()` does the same from code. Enter splits the block instead, except in a code block, where it inserts a line break, and in a table cell, where it moves to the cell below.

```ts
editor.chain().insertHardBreak().run();
```

In Markdown a line break in a paragraph, quote, callout or list item is written as a hard break, a trailing `\` before the line ending, so GitHub and other renderers show it too. In headings and table cells it is written as `<br>`. Reading Markdown, a hard break (a trailing `\` or two spaces) becomes a line break and a soft one, a plain line ending inside a paragraph, becomes a space, as in CommonMark; `PageEditor` keeps the line endings of the file when you edit around them.

## Related

- [Lists](/docs/extensions/lists) and [Code block](/docs/extensions/code-block): the other text-holding blocks.
- [Commands](/docs/concepts/commands): `setBlockType`, `insertBlockAfter`, `setBlockAttrs` and the chain.
- [Markdown](/docs/conversion/markdown): raw blocks and the full mapping.
- [Keyboard](/docs/ui/keyboard): every shortcut of the editor UI.
