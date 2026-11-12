---
title: Migrate from ProseMirror, Slate or Lexical
description: Convert stored ProseMirror/Tiptap, Slate and Lexical JSON into GoTipe documents, keeping unsupported content visible instead of dropping it.
packages: ["@gotipe/migration"]
license: MIT
---

`@gotipe/migration` converts the JSON that ProseMirror (and Tiptap), Slate and Lexical store
into GoTipe documents. It does not load those editors. It converts data only: plugins,
history, selection, collaboration state and user interface are not migrated.

Nothing is dropped silently. Content the converter cannot represent is kept as a raw block
with its original JSON, and you get a warning with its path.

## Install

```sh
npm install @gotipe/migration @gotipe/core
```

## Convert a document

```ts title="migrate.ts"
import { createEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import { convertProseMirrorToGoTipe } from "@gotipe/migration";

const editor = await createEditor({ extensions: DefaultPreset });

const result = convertProseMirrorToGoTipe({
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Notes" }] },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Привет 😀", marks: [{ type: "bold" }] }],
    },
  ],
});

console.log(result.warnings); // []
console.log(result.preservedNodes); // 0

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
| `strict` | `boolean` | `false` | Throw on the first unsupported node or mark instead of preserving it. |
| `onWarning` | `(message: string) => void` | — | Called for each warning as it happens. |
| `blockTypeMap` | `Record<string, string>` | — | Maps more source node names to GoTipe block types, for example `{ callout: "callout" }`. |
| `markTypeMap` | `Record<string, string>` | — | Maps more source mark names to GoTipe mark types. |
| `createId` | `() => string` | `crypto.randomUUID()` | Makes IDs for blocks without a source ID. Must return unique, non-empty strings. |

The maps rename types; they do not convert attributes or add behavior. Your editor's schema
must define the target types.

## Result

| Field | Type | Description |
|---|---|---|
| `document` | `Document` | The GoTipe document (`{ version: 1, blocks }`). |
| `warnings` | `string[]` | One message per preserved subtree or replaced ID, with its path. |
| `preservedNodes` | `number` | How many blocks hold preserved source JSON. |
| `skippedNodes` | `number` | Always `0`: the converters never drop content. |

## What is converted

| Source | Blocks | Inline |
|---|---|---|
| ProseMirror, Tiptap | `paragraph`, `heading`, `blockquote`, `code_block`/`codeBlock`, `bullet_list`/`bulletList`, `ordered_list`/`orderedList`, `list_item`/`listItem`, `taskList`, `taskItem`, `table`, `table_row`/`tableRow`, `table_cell`/`tableCell`, `table_header`/`tableHeader`, `image`, `horizontal_rule`/`horizontalRule` | `text`, `hard_break`/`hardBreak`; marks `bold`/`strong`, `italic`/`em`, `underline`, `strike`/`strikethrough`, `code`, `link`, `highlight`, `subscript`, `superscript`, `textColor`, `textStyle` color and background color |
| Slate | `paragraph` (also elements without a type), `heading` with `level`, `heading-one`, `heading-two`, `block-quote`, `code-block`, `bulleted-list`, `numbered-list`, `list-item`, `check-list`, `check-list-item`, `table`, `table-row`, `table-cell`, `table-header`, `image` (`url`), `horizontal-rule` | Text leaves with `bold`, `italic`, `underline`, `strikethrough`/`strike`, `code`, `subscript`, `superscript`, `highlight`, `color`; `link` elements with `url` or `href` |
| Lexical | `paragraph`, `heading` (`h1`–`h6`), `quote`, `code`, `list` (bullet, number, check), `listitem`, `table`, `tablerow`, `tablecell` (header state, spans), `image` (`altText`), `horizontalrule` | `text` with its format flags and `color`/`background-color` styles, `link`, `autolink`, `linebreak`, `tab`, code highlight tokens |

A source editor's plugins can add any node names; this table is what the converters know
without maps.

## What is preserved

- **Attributes.** Node attributes are copied as they are. Other fields of a source node go
  into `migrationNodeMetadata`, fields of the root into `migrationDocumentMetadata` on the
  first block. Tiptap's `textAlign` is also copied to `align`.
- **IDs.** A source ID (a node's `id`, or `attrs.id` in ProseMirror) becomes the block ID. A
  duplicate is replaced with a new ID and a warning. New IDs are random, so converting twice
  gives different IDs unless you pass `createId`.
- **Item paragraphs.** The first paragraph inside a list item, quote or table cell becomes the
  item's own text; its ID and attributes are kept in `migrationFirstParagraph`.
- **Unsupported content.** When a block contains something the converter cannot represent —
  an unknown node or mark, formatted text inside code, text mixed with child blocks, Lexical
  token text — the whole block becomes a `markdownRaw` block. Its content is the source JSON,
  pretty-printed, and its attributes `migrationSource` (`"ProseMirror/Tiptap"`, `"Slate"` or
  `"Lexical"`) and `migrationType` name the source. The warning reads like
  `ProseMirror/Tiptap content[1]: Inline node mention cannot be represented; source preserved as markdownRaw`.

With `strict: true`, the first such case throws an error with its path instead of being
preserved.

Some input always throws, in both modes: a wrong root, non-JSON values (functions, class
instances, non-finite numbers), cycles, fields of the wrong type, and inputs beyond
100,000 values, 128 levels of nesting or 32 Mi UTF-16 code units of text. The converters
never load URLs or parse HTML.

## Make the result fit your schema

A GoTipe editor validates documents against its schema: `setContent` throws
`VALIDATION_ERROR` for a block type or an attribute the schema does not declare. Migrated
documents often carry both — `markdownRaw` blocks, the `migration*` attributes and source
attributes such as Lexical's `direction`, `format`, `indent` and `version`. Check with
`editor.validate(document)` first, then either declare what you keep or remove what you do not.

Declare a node type for preserved blocks, with their migration attributes, so the document
validates with them:

```ts title="migrated-source.ts"
import { defineExtension } from "@gotipe/core";

export const MigratedSource = defineExtension({
  name: "migratedSource",
  nodes: [
    {
      name: "markdownRaw",
      group: ["block"],
      content: "rawText",
      attrs: {
        kind: { type: "string", default: "" },
        migrationSource: { type: "string" },
        migrationType: { type: "string" },
      },
      topLevel: true,
      marksAllowed: "none",
      leaf: true,
      allowsChildren: false,
    },
  ],
});
```

Remove attributes you have reviewed and do not need. For a typical Lexical document:

```ts title="drop-attributes.ts"
import type { Block, Document } from "@gotipe/core";

export function dropAttributes(
  blocks: Block[],
  drop: (block: Block, name: string) => boolean,
): Block[] {
  return blocks.map((block) => ({
    ...block,
    attrs: Object.fromEntries(Object.entries(block.attrs).filter(([name]) => !drop(block, name))),
    children: dropAttributes(block.children, drop),
  }));
}

const sourceOnly = new Set([
  "migrationFirstParagraph",
  "migrationNodeMetadata",
  "migrationDocumentMetadata",
  "direction",
  "format",
  "indent",
  "version",
  "textFormat",
  "textStyle",
  "listType",
  "tag",
  "value",
  "headerState",
  "colSpan",
  "rowSpan",
  "backgroundColor",
]);

function isLexicalOnly(block: Block, name: string): boolean {
  const cell = block.type === "tableCell" || block.type === "tableHeader";
  if (name === "start") return block.type !== "orderedList";
  if (name === "align") return !cell;
  if (name === "width") return cell;
  return sourceOnly.has(name);
}

export function cleanLexicalResult(document: Document): Document {
  return { ...document, blocks: dropAttributes(document.blocks, isLexicalOnly) };
}
```

Validate again after cleaning. Dropping an attribute drops its data, so keep the ones your
schema declares, such as an ordered list's `start` or a cell's `colspan`.

> [!NOTE]
> The converters cover the common nodes of each editor; they are not a promise of
> compatibility with every third-party plugin. There are no converters for CKEditor,
> TinyMCE or Quill: export their content to HTML or Markdown and
> [import that](/docs/conversion/overview#import).

## Related

- [Import and export](/docs/conversion/overview)
- [Document model](/docs/concepts/document-model)
- [Extensions](/docs/concepts/extensions)
