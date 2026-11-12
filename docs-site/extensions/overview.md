---
title: Extensions overview
description: The extensions that define GoTipe's blocks, marks and editing behaviours, the presets that bundle them and how they map to Markdown.
packages: ["@gotipe/core"]
license: MIT
---

Every block type, mark and editing behaviour in GoTipe comes from an extension. An extension declares schema (nodes and marks), keyboard shortcuts, input rules, paste rules and "/" commands. The editor accepts only documents that its extensions describe, so the list you pass to `createEditor` is also the schema of your documents.

You can take a preset or pick extensions one by one:

```ts title="editor.ts"
import { createEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({ extensions: [DefaultPreset] });
editor.mount(document.querySelector<HTMLElement>("#editor")!);
```

Extensions live in `@gotipe/core/extensions`, presets in `@gotipe/core/presets`. To write your own, see [Extensions](/docs/concepts/extensions).

## Presets

| Preset | Extensions |
| --- | --- |
| `MinimalPreset` | Paragraph, Bold, Italic, History |
| `DefaultPreset` | Paragraph, Heading (configured with levels 1–3), BulletList, OrderedList, ListItem, TodoList, CodeBlock, Image, Blockquote, Callout, Divider, Table, Toggle, Bold, Italic, Underline, Strikethrough, InlineCode, Link, Highlight, TextColor, History, Placeholder, DragAndDrop, SlashCommands |
| `FullPreset` | Everything in `DefaultPreset`, plus Heading with levels 1–6, Columns, Embed, Math, File, Superscript, Subscript |

A preset is a plain array of extensions, so you can extend or filter it:

```ts title="editor.ts"
import { createEditor } from "@gotipe/core";
import { Superscript, Subscript } from "@gotipe/core/extensions";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({
  extensions: [
    DefaultPreset.filter((extension) => extension.name !== "toggle"),
    Superscript,
    Subscript,
  ],
});
```

`PageEditor` from `@gotipe/block-editor` uses its own set, `pageExtensions()`: the blocks and marks that GFM Markdown can hold (Paragraph, Heading 1–6, the three lists, CodeBlock, Image, File, Blockquote, Callout, Divider, Table, all ten marks, History) plus the read-only raw Markdown node and mark. See [Page editor](/docs/ui/page-editor).

## All extensions

The name in the second column is the extension's `name` and, unless noted, the name of the node or mark it adds.

| Extension | Name | Presets | Page |
| --- | --- | --- | --- |
| `Paragraph` | `paragraph` | Minimal, Default, Full | [Text blocks](/docs/extensions/text-blocks#paragraph) |
| `Heading` | `heading` | Default, Full | [Text blocks](/docs/extensions/text-blocks#heading) |
| `Blockquote` | `blockquote` | Default, Full | [Text blocks](/docs/extensions/text-blocks#blockquote) |
| `Divider` | `divider` | Default, Full | [Text blocks](/docs/extensions/text-blocks#divider) |
| `Callout` | `callout` | Default, Full | [Text blocks](/docs/extensions/text-blocks#callout) |
| `Toggle` | `toggle` | Default, Full | [Text blocks](/docs/extensions/text-blocks#toggle) |
| `Columns` | `columns` (nodes `columns`, `column`) | Full | [Text blocks](/docs/extensions/text-blocks#columns) |
| `BulletList` | `bulletList` | Default, Full | [Lists](/docs/extensions/lists) |
| `OrderedList` | `orderedList` | Default, Full | [Lists](/docs/extensions/lists) |
| `ListItem` | `listItem` | Default, Full | [Lists](/docs/extensions/lists) |
| `TodoList` | `todoList` (nodes `todoList`, `todoItem`) | Default, Full | [Lists](/docs/extensions/lists#task-lists) |
| `CodeBlock` | `codeBlock` | Default, Full | [Code block](/docs/extensions/code-block) |
| `Table` | `table` (nodes `table`, `tableRow`, `tableCell`, `tableHeader`) | Default, Full | [Tables](/docs/extensions/tables) |
| `Image` | `image` | Default, Full | [Media](/docs/extensions/media#image) |
| `File` | `file` | Full | [Media](/docs/extensions/media#file) |
| `Embed` | `embed` | Full | [Media](/docs/extensions/media#embed) |
| `Math` | `math` | Full | [Math](/docs/extensions/math) |
| `Bold` | `bold` | Minimal, Default, Full | [Marks](/docs/extensions/marks) |
| `Italic` | `italic` | Minimal, Default, Full | [Marks](/docs/extensions/marks) |
| `Underline` | `underline` | Default, Full | [Marks](/docs/extensions/marks) |
| `Strikethrough` | `strikethrough` | Default, Full | [Marks](/docs/extensions/marks) |
| `InlineCode` | `code` | Default, Full | [Marks](/docs/extensions/marks) |
| `Link` | `link` | Default, Full | [Marks](/docs/extensions/marks#links) |
| `Highlight` | `highlight` | Default, Full | [Marks](/docs/extensions/marks#colours) |
| `TextColor` | `textColor` | Default, Full | [Marks](/docs/extensions/marks#colours) |
| `Superscript` | `superscript` | Full | [Marks](/docs/extensions/marks#superscript-and-subscript) |
| `Subscript` | `subscript` | Full | [Marks](/docs/extensions/marks#superscript-and-subscript) |
| `History` | `history` | Minimal, Default, Full | [Behaviours](/docs/extensions/behaviors#history) |
| `Placeholder` | `placeholder` | Default, Full | [Behaviours](/docs/extensions/behaviors#placeholder) |
| `SlashCommands` | `slashCommands` | Default, Full | [Behaviours](/docs/extensions/behaviors#slash-commands) |
| `DragAndDrop` | `dragAndDrop` | Default, Full | [Behaviours](/docs/extensions/behaviors#drag-and-drop) |

## Configure an extension

`configure(options)` returns a copy of the extension with the options merged in. The original stays unchanged.

```ts title="editor.ts"
import { createEditor } from "@gotipe/core";
import { Image, Placeholder } from "@gotipe/core/extensions";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({
  extensions: [
    DefaultPreset,
    Image.configure({ maxSize: 5 * 1024 * 1024 }),
    Placeholder.configure({ text: "Write something" }),
  ],
});
```

The editor flattens nested arrays and keeps one extension per name. When a name repeats, the last configuration wins and the extension keeps the position of its first occurrence. That is how `FullPreset` replaces the Heading of `DefaultPreset`. Shortcuts and input rules are tried in that order, and the first match handles the key or the text.

| Extension | Options | Page |
| --- | --- | --- |
| `Image` | `maxSize`, `allowedTypes`, `upload` | [Media](/docs/extensions/media#image) |
| `Placeholder` | `text` | [Behaviours](/docs/extensions/behaviors#placeholder) |
| `Heading` | `levels` | [Text blocks](/docs/extensions/text-blocks#heading) |
| `CodeBlock` | `languages`, `defaultLanguage`, `syntaxHighlight` | [Code block](/docs/extensions/code-block) |

The other built-in extensions have no options.

> [!NOTE]
> In this release the `Heading` and `CodeBlock` options are accepted but not read by the editor or its UI. Their pages say what that means in practice.

## Attributes every node accepts

Besides its own attributes, every node accepts five optional attributes: `marker`, `delimiter`, `spread` and `breaks`, which the Markdown codec uses to keep list markers, numbering delimiters, loose lists and hard line breaks, and a string `style`, which the shipped renderers do not apply. Any other attribute must be declared by an extension: a document with an undeclared attribute is rejected, not cleaned up.

## Markdown at a glance

| Node or mark | Markdown |
| --- | --- |
| `paragraph` | A paragraph; a line break in the text is a line break |
| `heading` | `#` to `######`; setext headings are read as well |
| `bulletList`, `listItem` | `-`, `*` or `+` items; the marker is kept |
| `orderedList` | `1.` or `1)` items; the start number and delimiter are kept |
| `todoList`, `todoItem` | `- [ ]` and `- [x]` items |
| `blockquote` | `>` with one paragraph |
| `callout` | GFM alert: `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]` |
| `codeBlock` | Fenced code with its language and meta |
| `divider` | `---` |
| `table` | GFM table with column alignment |
| `image` | A paragraph holding only `![alt](src "caption")` |
| `file` | A paragraph holding only `[name](path)`, where the text is the file name |
| `bold`, `italic`, `strikethrough`, `code` | `**text**`, `*text*`, `~~text~~`, `` `text` `` |
| `link` | `[text](href "title")` or an autolink |
| `underline`, `superscript`, `subscript` | `<u>`, `<sup>`, `<sub>` |
| `highlight`, `textColor` | `<mark>` or `<mark style="background:…">`, `<span style="color:…">` |

Markdown that the editor cannot edit (HTML blocks, footnotes, link definitions and a few list and quote shapes) is kept byte for byte as a read-only `markdownRaw` block or `mdRaw` text. The [Markdown](/docs/conversion/markdown) page has the full mapping.

> [!NOTE]
> `toggle`, `columns`, `embed` and `math` have no Markdown form. When written to Markdown, a toggle and columns become their content, a math block becomes its TeX source as plain text, and an embed is left out.

## Related

- [Extensions](/docs/concepts/extensions): define your own nodes, marks and commands.
- [Commands](/docs/concepts/commands): the command chain used on these pages.
- [Document model](/docs/concepts/document-model): blocks, content and attributes.
- [Markdown](/docs/conversion/markdown): the codec behind `getMarkdown()` and `PageEditor`.
