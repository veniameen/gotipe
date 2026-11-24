---
title: Migrate from ProseMirror, Slate or Lexical
description: Convert stored ProseMirror/Tiptap, Slate and Lexical JSON into GoTipe documents that fit the GoTipe schema, keeping unsupported content visible instead of dropping it.
packages: ["@gotipe/migration"]
license: MIT
---

`@gotipe/migration` converts the JSON that ProseMirror (and Tiptap), Slate and Lexical store
into GoTipe documents. It does not load those editors. It converts data only: plugins,
history, selection, collaboration state and user interface are not migrated.

The document uses only the block types, attributes and nesting that GoTipe's own extensions
declare, so it passes `editor.validate()` with the stock presets. Nothing is dropped
silently: source fields GoTipe has no attribute for are listed in the result, and content
the converter cannot represent is kept as a raw block with its original JSON and a warning.

## Install

```sh
npm install @gotipe/migration @gotipe/core @gotipe/markdown
```

`@gotipe/markdown` provides the node spec of the raw block that holds preserved content.

## Convert a document

```ts title="migrate.ts"
import { createEditor, defineExtension } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import { markdownRawNodeSpec } from "@gotipe/markdown";
import { convertProseMirrorToGoTipe } from "@gotipe/migration";

// Preserved source content arrives in `markdownRaw` blocks.
const MarkdownRaw = defineExtension({ name: "markdownRaw", nodes: [markdownRawNodeSpec] });
const editor = await createEditor({ extensions: [...DefaultPreset, MarkdownRaw] });

const result = convertProseMirrorToGoTipe({
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Notes" }] },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Hello 😀", marks: [{ type: "bold" }] }],
    },
  ],
});

console.log(result.warnings); // []
console.log(result.preserved, result.unmapped); // [] []

if (!editor.validate(result.document)) throw new Error("Migrated document does not fit the schema");
editor.setContent(result.document);
```

Keep the source data until you have checked the result on your own documents.

| Source | Function | Input |
|---|---|---|
| ProseMirror, Tiptap | `convertProseMirrorToGoTipe(input, options?)` | `{ type: "doc", content: [...] }` |
| Slate | `convertSlateToGoTipe(input, options?)` | An array of elements |
| Lexical | `convertLexicalToGoTipe(input, options?)` | Serialized state `{ root: { type: "root", children: [...] } }` |

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `strict` | `boolean` | `false` | Throw `UnsupportedContent` on the first node or mark that cannot be converted, instead of preserving it. |
| `onWarning` | `(message: string) => void` | — | Called with each warning of the result when the conversion has finished. |
| `blockTypeMap` | `Record<string, string>` | — | Maps more source node names to block types, for example `{ callout: "callout" }`. |
| `markTypeMap` | `Record<string, string>` | — | Maps more source mark names to mark types. |
| `createId` | `() => string` | `createId()` of `@gotipe/core` | Makes IDs for blocks without a usable source ID. Must return unique, non-empty strings. |

The maps rename types; they do not convert attributes or add behavior. A GoTipe type, such as
`callout`, gets the attributes its schema declares and the rest goes to `unmapped`. A type of
your own gets the source attributes as they are: its extension must declare them.

## Result

| Field | Type | Description |
|---|---|---|
| `document` | `Document` | The GoTipe document (`{ version: 1, blocks }`). |
| `warnings` | `string[]` | Messages with source paths: preserved subtrees, replaced IDs, fields that do not fit. |
| `preserved` | `PreservedSource[]` | One entry per preserved subtree: `blockId` of its raw block, source `path`, `sourceType` and `reason`. |
| `unmapped` | `UnmappedSource[]` | Source fields that are not in the document: `blockId` of the block that holds the node (`null` for the root), `path` of the source object, `sourceType` and `fields` with the source values; a list or heading that became text of a table cell is a `block` field. In source order. |
| `preservedNodes` | `number` | `preserved.length`. |
| `skippedNodes` | `number` | Always `0`: the converters never drop content. |

## What is converted

| Source | Blocks | Inline |
|---|---|---|
| ProseMirror, Tiptap | `paragraph`, `heading`, `blockquote`, `code_block`/`codeBlock`, `bullet_list`/`bulletList`, `ordered_list`/`orderedList`, `list_item`/`listItem`, `taskList`, `taskItem`, `table`, `table_row`/`tableRow`, `table_cell`/`tableCell`, `table_header`/`tableHeader`, `image` (also a paragraph that holds only an image), `horizontal_rule`/`horizontalRule` | `text`, `hard_break`/`hardBreak`; marks `bold`/`strong`, `italic`/`em`, `underline`, `strike`/`strikethrough`, `code`, `link`, `highlight`, `subscript`, `superscript`, `textColor`, `textStyle` color and background color |
| Slate | `paragraph` (also elements without a type), `heading` with `level`, `heading-one` to `heading-six`, `block-quote`, `code-block`, `bulleted-list`, `numbered-list`, `list-item`, `check-list`, `check-list-item`, `table`, `table-row`, `table-cell`, `table-header`, `image` (`url`), `horizontal-rule` | Text leaves with `bold`, `italic`, `underline`, `strikethrough`/`strike`, `code`, `subscript`, `superscript`, `highlight`, `color`; `link` elements with `url` or `href` |
| Lexical | `paragraph`, `heading` (`h1`–`h6`), `quote`, `code`, `list` (bullet, number, check), `listitem`, `table`, `tablerow`, `tablecell` (header state, spans, alignment), `image` (`altText`, also inside a paragraph), `horizontalrule` | `text` with its format flags and `color`/`background-color` styles, `link`, `autolink`, `linebreak`, `tab`, code highlight tokens |

A source editor's plugins can add any node names; this table is what the converters know
without maps.

## What goes where

- **Attributes.** A block or mark gets the attributes the GoTipe schema declares, with a value
  of the declared type: heading `level`, list `start`, task `checked`, code `language` (and
  `meta` from a prosemirror-markdown info string), cell `colspan`, `rowspan` and `align`,
  paragraph and heading `align`, table `colWidths`, image `src`, `alt`, `width` and `height`,
  link `href`, `title`, `target` and `rel`, highlight and text `color`. Tiptap's `textAlign`,
  Lexical's `colSpan`, `rowSpan`, `altText`, the `format` of a cell, paragraph or heading
  (`left`, `center`, `right`, `justify`) and a heading's `tag` are renamed to these; Slate's
  `align` already is one.
- **Everything else** goes to `result.unmapped`, tied to the block by `blockId`: Tiptap's
  `colwidth` and image `title`, text direction, the alignment of a paragraph that became a
  list item's or cell's text, Lexical's `indent`,
  `version`, cell `width` and image `caption`, font family and size, other node fields. A
  `null` value counts as unset and is left out. Each field that holds a value gets one warning
  per source type, such as `Lexical root.children[3]: paragraph field indent does not fit the
  GoTipe schema; kept in unmapped`. Source defaults that change nothing a reader sees, such as
  Lexical's `version`, `direction: "ltr"`, `indent: 0` or Tiptap's `textAlign: "left"`, are
  listed without a warning.
- **IDs.** A source ID (a node's `id`, or `attrs.id` in ProseMirror) becomes the block ID. A
  duplicate is replaced with a new ID and a warning. A replaced or unusable ID, and the ID of a
  paragraph that became its container's text, stay in `unmapped` as an `id` field, so links to
  them can be remapped. New IDs are random, so converting twice gives different IDs unless you
  pass `createId`.
- **Structure.** The first paragraph of a list item, task, quote, callout or table cell becomes
  its own text. List items outside a list, such as Slate's top-level check-list items, get a
  list around them.
- **Table cells.** A cell holds text, not blocks, so its other paragraphs, headings and lists
  become lines of its text, with their marks. A list item starts with `• `, `1. ` (from the
  list's start), `☐ ` or `☑ `, and a nested list is indented by two spaces per level. The
  table stays editable. Each list or heading is listed in `unmapped` as a `block` field, the
  GoTipe block it would have been, with a warning:
  `ProseMirror/Tiptap content[0].content[1].content[0].content[1]: bulletList in tableCell became lines of its text; kept in unmapped`.
- **Unsupported content.** When a node holds something the converter cannot represent — an
  unknown node or mark, formatted text inside code, text mixed with child blocks, Lexical token
  text — the node becomes a `markdownRaw` block with `kind: "json"`; its content is the source
  JSON, pretty-printed. `result.preserved` lists it. Where the schema allows no raw block, as in
  a table cell, a quote or a list, the nearest enclosing node that can be one is kept instead:
  a mention in a table cell keeps the whole table. The warning names both paths:
  `ProseMirror/Tiptap content[3]: Inline node mention cannot be represented (at content[3].content[0].content[0].content[0]); source preserved as markdownRaw`.

With `strict: true`, the first such case throws `UnsupportedContent` instead. Its `path` is
the path in the source and its `reason` what could not be represented:

```ts title="strict.ts"
import { UnsupportedContent, convertLexicalToGoTipe } from "@gotipe/migration";

export function convertStrictly(state: unknown) {
  try {
    return convertLexicalToGoTipe(state, { strict: true });
  } catch (error) {
    if (error instanceof UnsupportedContent) console.error(error.path, error.reason);
    throw error;
  }
}
```

Some input always throws a plain `Error`, in both modes: a wrong root, non-JSON values
(functions, class instances, non-finite numbers), cycles, fields of the wrong type, and input
beyond the limits below. The converters never load URLs or parse HTML.

| Limit | Value |
|---|---|
| Nodes: objects with a `type` (nodes and marks) and Slate text leaves | 1,000,000 |
| Nodes inside nodes | 128 levels |
| Arrays and objects inside each other | 512 levels |
| JSON values of any kind | 16 Mi (16,777,216) |
| Text of all string values | 32 Mi UTF-16 code units |

The package's tests convert documents of 50,000 paragraphs in each format. The editor has
its own limits: it rejects a document with more than 100,000 blocks or nested deeper than 64
levels, so check the result with `editor.validate()`.

## Check the result

The document validates with `FullPreset`, and with `DefaultPreset` unless it uses marks or
blocks that preset lacks, such as `subscript` and `superscript`. Preserved content needs the
`markdownRaw` node, registered from `markdownRawNodeSpec` as in the example above. A type you
add through `blockTypeMap` needs your own extension. Call `editor.validate(document)` before
`setContent`, which throws `VALIDATION_ERROR` for a document that does not fit.

`unmapped` is plain JSON. Store it next to the migrated document if you may need the source
data later, or read the fields your application has its own attributes for by `blockId`.

## Limitations

- The converters cover the common nodes of each editor; they are not a promise of
  compatibility with every third-party plugin.
- There are no converters for CKEditor, TinyMCE or Quill: export their content to HTML or
  Markdown and [import that](/docs/conversion/overview#import).
- Inline nodes such as mentions, hashtags, equations and inline images among text keep their
  whole paragraph as JSON.
- A code block, image, quote or table inside a table cell, also inside a list in the cell,
  keeps the whole table as JSON. A list or code block inside a quote keeps the whole quote.
- Lexical keeps a nested list in a list item of its own; it becomes an item without text that
  holds the list.
- Slate code blocks made of `code-line` elements are kept as JSON.
- Saved as Markdown, a preserved block is written as its JSON text, like any `markdownRaw`
  block.
- Indentation of paragraphs and headings, text direction, column widths of Tiptap tables,
  image titles and captions, and font family and size have no GoTipe attribute. They are in
  `unmapped`, not in the document. Alignment is kept (`align`), except on a paragraph that
  became a list item's or cell's text.

## Related

- Step-by-step guides: [from Tiptap](/docs/conversion/from-tiptap), [from Lexical](/docs/conversion/from-lexical), [from Slate and Plate](/docs/conversion/from-slate)
- [Import and export](/docs/conversion/overview)
- [Markdown](/docs/conversion/markdown)
- [Document model](/docs/concepts/document-model)
- [Extensions](/docs/concepts/extensions)
