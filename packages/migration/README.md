# @gotipe/migration

Convert serialized ProseMirror/Tiptap, Lexical and Slate JSON into a GoTipe
`Document`. No source-editor runtime is loaded.

```ts
import { defineExtension } from '@gotipe/core';
import { markdownRawNodeSpec } from '@gotipe/markdown';
import { convertProseMirrorToGoTipe } from '@gotipe/migration';

// Register with your extensions: preserved source content arrives in `markdownRaw` blocks.
export const MarkdownRaw = defineExtension({ name: 'markdownRaw', nodes: [markdownRawNodeSpec] });

const result = convertProseMirrorToGoTipe(sourceJSON);
if (editor.validate(result.document)) editor.setContent(result.document);
console.log(result.warnings, result.preserved, result.unmapped);
```

Common paragraphs, headings, lists (including nested and checked lists), links,
text marks, raw code, images and tables are mapped to GoTipe's document model.
Tiptap camelCase and ProseMirror snake_case node names are accepted. Image and
link URLs remain data; conversion does not fetch them.

The document holds only the block types, attributes and nesting that GoTipe's own
extensions declare (read from `@gotipe/core/extensions`), so it passes
`editor.validate()` with the stock presets. Source fields without a GoTipe attribute
(Tiptap `colwidth`, paragraph alignment, Lexical `indent` and `version`, image
titles, a flattened paragraph's ID…) are listed in `result.unmapped` with the ID of
the block that holds them and their source path; values that differ from the source
editor's defaults also produce one warning per field. The first paragraph of a list
item, quote or table cell becomes its text; list items outside a list get one. A
table cell holds text only, so its other paragraphs, headings and lists become lines
of its text (`• `, `1. `, `☐ `/`☑ ` markers, two spaces per nesting level, marks
kept); each list or heading is reported in `unmapped` as the `block` it would have
been, and the table stays editable.

Unknown nodes, inline elements and marks are preserved as an entire source subtree
in a `markdownRaw` block (`kind: "json"`) containing JSON. They produce a warning and
an entry in `result.preserved`; `skippedNodes` remains zero. Where the schema allows
no raw block (a table cell, a quote), the nearest ancestor that can be one is
preserved instead. This keeps content recoverable but does not pretend that a
custom widget has become an editable GoTipe widget. `strict: true` throws the
exported `UnsupportedContent` (with the source `path`) before returning a result.
Applications can provide `blockTypeMap` and `markTypeMap` for custom schemas: a
GoTipe type gets the attributes its schema declares, a type of the application's
own gets the source attributes unchanged, and its extension must declare them.

`onWarning` receives each warning when the conversion has finished. Existing unique
nonempty block IDs are kept; duplicates receive new IDs and a warning. `createId`
can supply an application's ID factory. Inputs are cloned and checked for non-JSON
values, cycles and invalid node shapes, and bounded: 1,000,000 nodes, nodes nested
128 levels, JSON nested 512 levels, 16 Mi values and 32 Mi UTF-16 code units of text. Malformed JSON
structures throw in both modes.

The checked-in fixtures follow the public serialized contracts documented by
[Tiptap](https://tiptap.dev/docs/guides/output-json-html),
[Lexical's text format flags](https://github.com/facebook/lexical/blob/main/packages/lexical/src/LexicalConstants.ts),
and [Slate's node model](https://docs.slatejs.org/concepts/02-nodes).
Slate permits application-defined schemas; the built-in names are conventions,
not a claim that every custom Slate application shares one schema.
