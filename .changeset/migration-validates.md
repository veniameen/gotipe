---
"@gotipe/migration": patch
"@gotipe/markdown": patch
---

Migrated documents fit the GoTipe schema and pass `editor.validate()` with the stock
presets. Blocks and marks carry only attributes GoTipe declares; other source fields,
including the former `migration*` bookkeeping, move to the new `result.unmapped` report,
with one warning per field that holds a non-default value. Preserved subtrees are
`markdownRaw` blocks with `kind: "json"`, listed in `result.preserved`, and are kept at the
nearest place the schema allows one. Paragraphs, headings and lists in a table cell become
lines of its text (markers, indentation and marks kept, the block reported in `unmapped`), so
the table stays editable. List items outside a list get one, and a paragraph holding only an
image becomes an image block. Input limits count nodes instead of every JSON value: 1,000,000
nodes nested up to 128 levels, so documents of tens of thousands of paragraphs convert.
`UnsupportedContent` is exported; `strict` throws it with the source `path`. `onWarning` is
called when the conversion has finished.

`markdownRawNodeSpec` is typed as core's `NodeSpec`, so it can be passed to
`defineExtension` without a cast. The README no longer claims an mdast dependency or raw
nested task lists.
