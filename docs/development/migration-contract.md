# Migrating an existing document

`@gotipe/migration` converts ProseMirror/Tiptap, Slate, and Lexical JSON without
loading their runtime. This is a data conversion, not a port of plugins, history,
selection, collaboration state, or the user interface.

```ts
import { createEditor, defineExtension } from '@gotipe/core';
import { DefaultPreset } from '@gotipe/core/presets';
import { markdownRawNodeSpec } from '@gotipe/markdown';
import { convertProseMirrorToGoTipe } from '@gotipe/migration';

const MarkdownRaw = defineExtension({ name: 'markdownRaw', nodes: [markdownRawNodeSpec] });
const editor = await createEditor({ extensions: [...DefaultPreset, MarkdownRaw] });
const result = convertProseMirrorToGoTipe({
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [{ type: 'text', text: 'Hello 😀', marks: [{ type: 'bold' }] }],
  }],
});

// Inspect warnings, preserved and unmapped before replacing existing stored content.
if (editor.validate(result.document)) editor.setContent(result.document);
```

| Input | Public function |
|---|---|
| ProseMirror / Tiptap `{ type: 'doc', content: [...] }` | `convertProseMirrorToGoTipe(input, options?)` |
| Slate array of elements | `convertSlateToGoTipe(input, options?)` |
| Lexical serialized state `{ root: { type: 'root', children: [...] } }` | `convertLexicalToGoTipe(input, options?)` |

## Result

The result contains `document`, `warnings`, `preserved`, `unmapped`, `preservedNodes`
(`preserved.length`), and `skippedNodes`. The last one is zero: unsupported
content is not deleted.

`document` contains only the block types, attributes, content, marks, and nesting
that GoTipe's own extensions declare. The package reads their specs from
`@gotipe/core/extensions` (a peer dependency) on the first call instead of keeping a copy.
The document passes `editor.validate()` with `FullPreset`, and with `DefaultPreset` if
it has no marks or blocks outside the preset (`subscript`, `superscript`, types from
`blockTypeMap`). The package tests check the JS engine; the Rust validator applies the same
schema rules. Preserved subtrees need a `markdownRaw` node
(`markdownRawNodeSpec` from `@gotipe/markdown`).

Attributes. A block and a mark get the attributes declared by the schema, with a value of the
declared type: `level`, `start`, `checked`, `language`/`meta`,
`colspan`/`rowspan`/`align`, `align` of a paragraph and heading, `colWidths`,
`src`/`alt`/`width`/`height`, `href`/`title`/`target`/`rel`, `color`. Known source
fields are renamed: `order` and `params` (prosemirror-markdown), `textAlign`
of a paragraph, heading, and cell (Tiptap), `colSpan`, `rowSpan`, `altText`, `tag`, and `format`
of a cell, paragraph, and heading with the values left/center/right/justify (Lexical), and the `url`
of an image (Slate); Slate's `align` already matches. The alignment of a paragraph that became the text of a
container (a list item, a cell) is recorded in `unmapped`. Everything else goes to `unmapped`:
fields of nodes, marks and inline elements, of the root, as well as duplicate and non-string IDs and the ID of a
paragraph that became the text of a container. A record is `{ blockId, path, sourceType, fields }`:
the block that holds the node (`null` for the root), the path to the source object, the source type,
and the original values. Records go in source order, root records first.
`null` means "not set" and is not carried over. For each "source type + field" pair
with a value there is one warning. The source editor's default values
(`version`, `direction: "ltr"`, `indent: 0`, `format: ""` for Lexical,
`textAlign: "left"` for Tiptap, also under the name `align`) are recorded without a warning.

`blockTypeMap` and `markTypeMap` rename types but do not implement new semantics.
A GoTipe type gets attributes per its schema; a type that is not among the GoTipe extensions
gets the source attributes unchanged, and the application's extension declares them.

Structure. The first paragraph of a list item, task, quote, callout, and cell
becomes their text. List items outside a list (for example top-level Slate
`check-list-item`) get a list. A paragraph consisting of one image (the inline image of the
ProseMirror and Lexical basic schema) becomes an `image` block.

A table cell contains text, not blocks: its remaining paragraphs, headings, and lists
become lines of its text separated by line breaks, with marks. A list item
starts with the marker `• `, `N. ` (counted from the list's `start`), `☐ `, or `☑ `; a nested
list is indented by two spaces per level; a Lexical item that only holds a
nested list gets no line of its own. The table stays editable, and `strict`
does not throw. Each such list or heading goes into `unmapped` with a `block` field, the
GoTipe block it would have been, with a warning for the "cell + source type" pair.
Code, an image, a quote, or a table in a cell (and in a list inside it) does not
become text: the whole table is preserved.

An unknown node or mark, text formatting without a mark, formatted code, text
mixed with blocks, and Lexical tokens are preserved as `markdownRaw` with `kind: "json"`
and the JSON of the source subtree. The JSON structure is preserved, not the file's original whitespace.
`preserved` lists `{ blockId, path, sourceType, reason }`, and the warning
gives the path. Where the schema does not allow `markdownRaw` (a cell, a quote, a list outside an
item), the nearest ancestor that can be one is preserved; the records,
warnings, and IDs of the subtree are rolled back. With `strict: true` the first such case
throws the exported `UnsupportedContent` (`path`, `reason`) instead of a partial
result. Fields without an attribute do not throw in `strict`: they go to `unmapped`.

`onWarning(message)` receives each warning of the result after the conversion
finishes. `createId()` sets the generator of unique non-empty IDs. Existing
IDs are preserved; a duplicate is replaced with a warning. By default new IDs are created by
`crypto.randomUUID()`, so a repeated migration without your own IDs is not idempotent.
The generator is also called for the blocks of a subtree that is then preserved whole.

The converters support common paragraphs, headings, lists,
quotes, code, tables, images, and marks. The set of source names differs between
editors: this is not a promise of compatibility with every third-party plugin. Lexical stores a
nested list in a separate list item; it becomes an item with no text.
Keep the original until you finish checking on your own documents.

An invalid root, cycles, non-JSON values, wrong fields, and structural limits
always raise an error. The limits are sized for a long book and restrict
hostile input: 1,000,000 nodes (objects with `type`, that is nodes and marks, and
Slate text leaves), node nesting of 128, JSON array and object nesting
of 512, 16 Mi JSON values, and 32 Mi UTF-16 code units of text across all strings.
Attributes and children lists are not counted as nodes and do not deepen node nesting.
The editor itself rejects a document with more than 100,000 blocks or deeper than 64 levels:
`editor.validate()` checks the result. The conversion does not load URLs and
does not insert HTML. Safe display of links and images remains part of the
[editor contract](editor-contracts.md) and the [asset boundary](assets.md).

CKEditor, TinyMCE, and Quill have no separate JSON converters in this package.
For their data the application needs an explicit adapter or a controlled export to a
supported format; the old examples in `17-migration-guide.md` are not an API.
There is no confirmed universal migration time or comparative speedup.

Checks: `pnpm --filter @gotipe/migration test` (Unicode, attrs, nesting,
unknown nodes, strict, malformed input, custom mappings, `unmapped`, subtree
rollback, lists and headings in cells, 50,000 paragraphs in each format, nesting
limits, and `editor.validate()` of realistic Tiptap, Slate, and Lexical documents with
`DefaultPreset`/`FullPreset` on the JS engine). The package also passes the shared archive check
and the strict declarations check in a clean consumer.
