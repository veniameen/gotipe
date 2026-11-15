---
title: Document model
description: Blocks, text spans, raw text, attributes, IDs and marks, the JSON shape of a GoTipe document and how it is validated.
packages: ["@gotipe/core"]
license: MIT
---

A GoTipe document is a tree of blocks. Each block has a type, a stable ID, attributes,
content and child blocks. Text inside a block is a list of spans with marks; there are no
inline nodes. The same JSON goes into `createEditor`, comes out of `editor.getJSON()` and
is read by both engines, the Markdown codec and the exporters.

## A document

```json title="document.json"
{
  "version": 1,
  "blocks": [
    {
      "id": "title",
      "type": "heading",
      "attrs": { "level": 1 },
      "content": [{ "text": "Launch plan", "marks": [] }],
      "children": []
    },
    {
      "id": "intro",
      "type": "paragraph",
      "attrs": {},
      "content": [
        { "text": "Ship ", "marks": [] },
        { "text": "on Friday", "marks": [{ "type": "bold", "attrs": {} }] },
        { "text": ". Notes are in the ", "marks": [] },
        {
          "text": "tracker",
          "marks": [{ "type": "link", "attrs": { "href": "https://example.com/tracker" } }]
        },
        { "text": ".\nOne more line.", "marks": [] }
      ],
      "children": []
    },
    {
      "id": "tasks",
      "type": "todoList",
      "attrs": {},
      "content": null,
      "children": [
        {
          "id": "task-1",
          "type": "todoItem",
          "attrs": { "checked": true },
          "content": [{ "text": "Write the docs", "marks": [] }],
          "children": []
        }
      ]
    },
    {
      "id": "snippet",
      "type": "codeBlock",
      "attrs": { "language": "ts" },
      "content": "await editor.focus();",
      "children": []
    },
    { "id": "rule", "type": "divider", "attrs": {}, "content": null, "children": [] }
  ]
}
```

The `\n` in the paragraph is a hard line break. The code block holds a plain string; the
list and the divider have no text of their own.

## Shape

| Field | Type | Description |
|---|---|---|
| `Document.version` | `number` | Non-negative integer, `1` when omitted. Grows by one with every applied step on both engines; see [engines](/docs/getting-started/engines#known-differences). |
| `Document.blocks` | `Block[]` | Top-level blocks in order. |
| `Block.id` | `string` | Non-empty and unique in the document. |
| `Block.type` | `string` | A node type of the schema, such as `paragraph`. |
| `Block.attrs` | `Record<string, AttrValue>` | Attributes declared by the node type. |
| `Block.content` | `TextSpan[] \| string \| null` | Rich text, raw text or nothing, depending on the type. |
| `Block.children` | `Block[]` | Nested blocks: list items, table rows, a toggle's body. |
| `TextSpan.text` | `string` | Text; `\n` is a hard line break. |
| `TextSpan.marks` | `Mark[]` | Formatting of the whole span. |
| `Mark.type` | `string` | Mark name, such as `bold` or `link`. |
| `Mark.attrs` | `Record<string, AttrValue>` | Mark attributes, such as `{ href }`. |

On input you may omit `attrs`, `children` and mark `attrs` (they become `{}` and `[]`),
`content` (it becomes `null`) and `version`. `getJSON()` always returns every field.
The types `Document`, `Block`, `TextSpan`, `Mark` and `AttrValue` are exported from
`@gotipe/core`.

## Content kinds

The node type decides what `content` holds:

| Kind | `content` | Built-in types |
|---|---|---|
| `richText` | `TextSpan[]` | `paragraph`, `heading`, `blockquote`, `callout`, `toggle`, `listItem`, `todoItem`, `tableCell`, `tableHeader` |
| `rawText` | `string` | `codeBlock`, `math` |
| `empty` | `null` | `divider`, `image`, `file`, `embed`, and the containers `bulletList`, `orderedList`, `todoList`, `table`, `tableRow`, `columns`, `column` |

Rich and raw text blocks also accept `null` for empty text; it becomes `[]` or `""` on
the first edit. Raw text has no marks, and `\n` separates its lines.

## IDs

Every block has an ID, including list items and table cells. Comments, suggestions,
selections and collaboration refer to blocks by ID, so keep them stable. Commands keep a
block's ID when they change its type or move it into a list. New blocks get IDs from
`createId()` of `@gotipe/core`, a UUID v4; the Markdown parser creates UUID v7 IDs and can
reuse the IDs of a previous version of the file.

`createId()` takes `crypto.randomUUID()` where the page has it and makes the same UUID from
`crypto.getRandomValues()` where it does not: `randomUUID` exists only in a secure context
(HTTPS or localhost), and every package of the library uses `createId()`, so editors,
comments, suggestions, versions and AI work on a page served over plain HTTP too. Use it for
the IDs of blocks you build.

When you build a document yourself, choose the IDs. Duplicate or empty IDs are rejected,
and an `insertBlock` step can't reuse an ID that is already in the document.

## Attributes

Attribute values are JSON: strings, finite numbers, booleans, `null`, arrays and plain
objects, nested up to 64 levels. Every attribute must be declared by the node or mark type
with an [`AttrSpec`](/docs/concepts/extensions#attributes). Undeclared attributes are
rejected, never dropped silently.

- `required: true` attributes must be present and not `null`. Others may be absent or
  `null`.
- `default` is not written into the document. A block inserted without an attribute
  doesn't have it, and each renderer uses its own fallback. Pass the values you rely on.
- Every node type also accepts five attributes that the core adds: `style`, `marker`,
  `delimiter` and `breaks` (strings) and `spread` (boolean). The Markdown codec uses them
  to keep the source syntax, such as `*` bullets or `1)` numbering; `breaks` is only kept
  for older documents and no longer read or written.

## Marks

A mark formats a span: `bold`, `italic`, `link` with `{ href }`, `highlight` with
`{ color }`. A mark type must be declared by an extension, and the block type must allow
it (`marksAllowed`). Code blocks allow none.

When the engine edits a block, it merges neighbouring spans with equal marks and removes
empty spans. Adding a mark keeps text that already has a mark of that type unchanged; to
change a link target, remove the link and add it again in the same transaction.

## Nesting

Only node types with `topLevel: true` may appear in `Document.blocks`; a `listItem` lives
only inside a list. A block may have children only if its type allows them, and
`childTypes` limits which types:

| Parent | Allowed children |
|---|---|
| `bulletList`, `orderedList` | `listItem` |
| `todoList` | `todoItem` |
| `listItem`, `todoItem`, `callout` | any block, such as a nested list |
| `blockquote` | `paragraph`, `heading` |
| `toggle` | `paragraph`, `heading`, `bulletList`, `orderedList`, `codeBlock` |
| `table` → `tableRow` | `tableRow` → `tableCell`, `tableHeader` |
| `columns` → `column` | `column` → `paragraph`, `heading`, `bulletList`, `orderedList`, `codeBlock`, `image` |

Each type is described in [extensions](/docs/extensions/overview).

## Validation

`createEditor`, `setContent` and every transaction check the whole result against the
schema and throw `VALIDATION_ERROR` when it doesn't fit; nothing is changed. To test a
document first, call `editor.validate()`. For a message that names the problem in the
document's shape, use `decodeDocument()`; it checks shape and IDs, not the schema.

```ts title="load.ts"
import { createEditor, decodeDocument, GoTipeError } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({ extensions: [DefaultPreset], engine: "js" });
const saved: object | null = JSON.parse(localStorage.getItem("doc") ?? "null");

if (saved && editor.validate(saved)) {
  editor.setContent(saved);
} else {
  try {
    decodeDocument(saved);
    console.warn("The document uses types or attributes this editor doesn't have");
  } catch (error) {
    if (error instanceof GoTipeError) console.warn(error.message); // e.g. "Duplicate block ID: intro"
  }
}
```

An editor created with `extensions: []` has no schema: it checks only the shape, IDs and
JSON values, and accepts any block type and attribute. Documents nested deeper than 64
levels or with more than 100,000 blocks are rejected.

## Limitations

> [!NOTE]
> There are no inline nodes. Everything inside a block is text with marks, so a mention
> chip, an inline image or an inline formula can't be an object inside a paragraph. Use a
> block (`image`, `math`, `embed`) or a mark with attributes, as links do. The Markdown
> codec keeps inline syntax it can't edit, such as inline HTML, as text with an `mdRaw`
> mark.

> [!NOTE]
> Marks keep the order in which they were added; a mark that replaces one of its type takes
> that mark's place. A mark type's `rank` is stored in the schema but not used yet. Its
> `exclusiveGroup` is applied: adding superscript removes subscript from that text.

## Related

- [Transactions](/docs/concepts/transactions): how a document changes.
- [Content formats](/docs/concepts/content-formats): JSON, HTML, Markdown and text.
- [Extensions](/docs/concepts/extensions): declare your own block and mark types.
