# @gotipe/migration

Convert serialized ProseMirror/Tiptap, Lexical and Slate JSON into a GoTipe
`Document`. No source-editor runtime is loaded.

```ts
import { convertProseMirrorToGoTipe } from '@gotipe/migration';

const result = convertProseMirrorToGoTipe(sourceJSON);
editor.setContent(result.document);
console.log(result.warnings, result.preservedNodes);
```

Common paragraphs, headings, lists (including nested and checked lists), links,
text marks, raw code, images and tables are mapped to GoTipe's document model.
Tiptap camelCase and ProseMirror snake_case node names are accepted. Image and
link URLs remain data; conversion does not fetch them. Source attributes and
nested JSON metadata are retained. Flattening a list item's first paragraph
retains its ID and attributes in `migrationFirstParagraph`.

Unknown nodes, inline elements, unsupported text styles or marks are preserved
as an entire source subtree in a `markdownRaw` block containing JSON. They produce
a warning and increment `preservedNodes`; `skippedNodes` remains zero. This keeps
content recoverable but does not pretend that a custom widget has become an
editable GoTipe widget. `strict: true` rejects such input before returning a
result. Applications can provide `blockTypeMap` and `markTypeMap` for custom
schemas and must register corresponding GoTipe extensions.

`onWarning` receives each warning. Existing unique nonempty block IDs are kept;
duplicates receive new IDs and a warning. `createId` can supply an application's
ID factory. Inputs are cloned and checked for non-JSON values, cycles, invalid
node shapes and bounded size/depth. Malformed JSON structures throw in both modes.

The checked-in fixtures follow the public serialized contracts documented by
[Tiptap](https://tiptap.dev/docs/guides/output-json-html),
[Lexical's text format flags](https://github.com/facebook/lexical/blob/main/packages/lexical/src/LexicalConstants.ts),
and [Slate's node model](https://docs.slatejs.org/concepts/02-nodes).
Slate permits application-defined schemas; the built-in names are conventions,
not a claim that every custom Slate application shares one schema.
