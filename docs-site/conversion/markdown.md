---
title: Markdown
description: The @gotipe/markdown codec turns GFM Markdown into GoTipe documents and back, keeps untouched blocks byte for byte and maps text positions to the source.
packages: ["@gotipe/markdown"]
license: MIT
---

`@gotipe/markdown` is GoTipe's own Markdown parser and serializer. It is built for Markdown files that people and tools also edit directly, such as files in Git: an unchanged file comes back byte for byte, and after an edit only the changed blocks are rewritten. Everything else, including front matter, line endings, spacing, HTML and footnotes, is copied from the source.

The package has no dependencies, no side effects on import and no Node-only APIs. It does not touch the DOM, use `eval` or `new Function`, or load WebAssembly, so it runs under a strict Content Security Policy. Both editor engines use it for `getMarkdown()`, and `PageEditor` is built on it.

```demo
page-editor
```

## Install

```sh
npm install @gotipe/markdown
```

## Parse and serialize

```ts title="file.ts"
import { parseMarkdown, serializeMarkdown } from "@gotipe/markdown";

const source = "---\ntitle: Notes\n---\n# Notes\n\nHello *world*.\n";
const { doc, snapshot } = parseMarkdown(source);

serializeMarkdown(doc, snapshot).text === source; // true: nothing changed

doc.blocks[1].content = [{ text: "Hello again.", marks: [] }];
const { text, snapshot: next } = serializeMarkdown(doc, snapshot);
// text: "---\ntitle: Notes\n---\n# Notes\n\nHello again.\n"; keep `next` for the next save
```

`parseMarkdown` returns the document and a snapshot. The snapshot is plain JSON that describes the source: the original text, the BOM, the front matter, the line-ending style and, for every top-level block, its id, source range, fingerprint, nested ranges and text segments. Keep it next to the open file, pass it to `serializeMarkdown`, and keep the snapshot that `serializeMarkdown` returns for the next save.

## With an editor

The parser emits the node types of `FullPreset` plus a raw block and a raw mark for Markdown the editor cannot edit. Register those two, then serialize the editor's document with the snapshot:

```ts title="markdown-editor.ts"
import { createEditor, defineExtension } from "@gotipe/core";
import { FullPreset } from "@gotipe/core/presets";
import {
  type MarkdownSnapshot,
  markdownRawNodeSpec,
  parseMarkdown,
  serializeMarkdown,
} from "@gotipe/markdown";

const MarkdownRaw = defineExtension({ name: "markdownRaw", nodes: [markdownRawNodeSpec] });
const MarkdownRawMark = defineExtension({
  name: "mdRaw",
  marks: [{ name: "mdRaw", attrs: {}, rank: 90 }],
});

export async function openMarkdown(source: string, save: (text: string) => void) {
  const parsed = parseMarkdown(source);
  let snapshot: MarkdownSnapshot = parsed.snapshot;
  const editor = await createEditor({
    extensions: [FullPreset, MarkdownRaw, MarkdownRawMark],
    content: parsed.doc,
  });
  editor.on("update", () => {
    const result = serializeMarkdown(editor.getJSON(), snapshot);
    snapshot = result.snapshot;
    save(result.text);
  });
  return editor;
}
```

`@gotipe/block-editor` exports the same two extensions as `MarkdownRawExtension` and `MarkdownRawMark`, and the whole set as `pageExtensions()`. `PageEditor` and its `MarkdownSession` do all of the above for you; see [Page editor](/docs/ui/page-editor).

> [!IMPORTANT]
> `editor.getMarkdown()` serializes without a snapshot. It writes canonical Markdown and leaves out front matter, which lives only in the snapshot. To save a file without rewriting it, call `serializeMarkdown(editor.getJSON(), snapshot)` as above.

`DefaultPreset` is not enough for arbitrary files: it lacks `File`, `Superscript` and `Subscript`, and the editor rejects a parsed document that uses them.

### External changes

When the file changes outside the editor (another tool, Git, an accepted suggestion), parse the new text with the previous snapshot. Blocks whose source is unchanged keep their ids, so the caret and scroll position survive the replacement:

```ts
const { doc, snapshot: fresh } = parseMarkdown(newText, { previous: snapshot });
editor.setContent(doc, { preserveSelection: true, addToHistory: true });
snapshot = fresh;
```

Without a snapshot, pass the current document as `previousDoc`; blocks are then matched by fingerprint.

## How serialization works

For each top-level block of the document:

1. If the snapshot has a block with the same id and the same fingerprint, its original source is copied verbatim.
2. Otherwise the block is written in canonical syntax, parsed again and compared with the input. The first rendering that reads back identically wins: plain delimiters, then `<url>` autolinks, then HTML tags such as `<strong>`, `<em>` and `<s>`.

A fingerprint is the canonical JSON of a block without ids. It ignores Markdown style attributes (`marker`, `delimiter`, `spread`, `breaks`) and attributes Markdown cannot hold, such as a callout's `emoji` or an image's `width`, so changing those does not rewrite a block.

Between two blocks that were neighbours in the source, the original gap is kept, unless a block changed type and the gap has no blank line. Other blocks are separated by a blank line. The BOM, the front matter and the text before the first block are always kept; the text after the last block is kept when the last block is still the original last one, otherwise the file ends with one line break. Rewritten blocks use the file's line ending. Empty paragraphs and headings are skipped unless they are kept verbatim.

The writer also avoids structural accidents: two adjacent lists that would merge get different markers, a divider at the start of a file is written as `***` so it is not read as front matter, an indented code block after a list is re-fenced, and a nested numbered list that does not start at 1 gets a blank line.

## Document mapping

| Markdown | Block |
| --- | --- |
| Paragraph | `paragraph` (`breaks: "hard"` when all its breaks are hard breaks) |
| `#` to `######`, setext headings | `heading` with `level` |
| `-`, `*`, `+` list | `bulletList` (`marker`, `spread`) of `listItem` |
| `1.`, `1)` list | `orderedList` (`start`, `delimiter`, `spread`) of `listItem` |
| Task list: `- [ ]`, `- [x]`, also a bare `- [ ]` | `todoList` (`marker`, `spread`) of `todoItem` (`checked`), with nested sub-tasks and lists |
| Quote with exactly one paragraph | `blockquote` |
| GFM alert: `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]` | `callout` with `type` (`"note"`…) and `alert` (`"NOTE"`…) |
| Fenced (backtick or tilde) or indented code | `codeBlock` with `language` and `meta`; content is the code |
| `---`, `***`, `___` | `divider` |
| Paragraph holding only `![alt](src "caption")` | `image` with `src`, `alt`, `caption` |
| Paragraph holding only `[name](path)`, where `path` has no scheme and `name` is its decoded file name | `file` with `url`, `name` |
| GFM table | `table` (`align`) of `tableRow` of `tableHeader` (first row) and `tableCell` |
| `$$` on its own line, the TeX, `$$` on its own line; a ```` ```math ```` fence | `math` with `display: "block"`; content is the TeX as written |
| HTML blocks, link reference definitions, footnote definitions, everything else | `markdownRaw` with `kind`; content is the exact source |

A list item holds rich text and nested lists only. In headings and table cells a line break is `<br>`.

| Inline Markdown | Mark |
| --- | --- |
| `**text**`, `__text__` | `bold` |
| `*text*`, `_text_` | `italic` |
| `~~text~~`, `~text~` | `strikethrough` |
| `` `text` `` | `code` |
| `[text](href "title")`, `<url>`, GFM bare addresses and e-mails | `link` with `href` and `title` |
| `<u>`, `<mark>`, `<sup>`, `<sub>`, `<em>`/`<i>`, `<strong>`/`<b>`, `<s>`/`<del>` in pairs | `underline`, `highlight`, `superscript`, `subscript`, `italic`, `bold`, `strikethrough` |
| `<span style="color:…">`, `<mark style="background:…">` | `textColor`, `highlight` with `color` |
| Reference links and images, footnote references, inline images, other inline HTML | Verbatim text with the `mdRaw` mark |

Named and numeric character references are decoded into text.

## Raw Markdown

Whatever the editor cannot edit stays in the document as raw Markdown, so nothing is lost when the file is saved:

- `markdownRaw` blocks hold the exact source of HTML blocks, definitions and constructs that do not fit the document model. Their `kind` attribute names the construct (`"html"`, `"list"`, `"blockquote"`, `"definition"`, `"footnoteDefinition"`…). `PageEditor` shows them read-only with a "Markdown" label.
- The `mdRaw` mark keeps inline source as text, such as a footnote reference `[^1]` or a reference link `[text][ref]`. The text is editable, but not as a link or a footnote.

These shapes are kept as one raw block:

- lists mixing task and plain items, numbered task lists, and items with several paragraphs, code or quotes;
- quotes with more than one paragraph, or with other blocks;
- nesting deeper than 64 levels.

A `<details>` element is split by CommonMark into HTML blocks with editable paragraphs between them.

## Source map

`serializeMarkdown` also returns a map between the Markdown text and the document:

- `map.blocks` lists every block, nested ones too, with its `start`, `end` and `depth` in the text;
- `map.segments` maps ranges of a block's flat text (its span texts joined, or the raw string of a code or raw block) to ranges of the Markdown. In an `exact` segment every character maps to one character. Escapes, character references, soft breaks with stripped continuation prefixes and `<br>` in cells get their own non-exact segments.

```ts title="map.ts"
import { mdOffsetToText, parseMarkdown, serializeMarkdown, textOffsetToMd } from "@gotipe/markdown";

const source = "# Notes\n\nHello **world**\n";
const { doc, snapshot } = parseMarkdown(source);
const { map } = serializeMarkdown(doc, snapshot);
const paragraph = doc.blocks[1].id;

mdOffsetToText(map, source.indexOf("world")); // { blockId: paragraph, offset: 6 }
textOffsetToMd(map, paragraph, 6); // 17, the offset of "world" in the source
```

`mdOffsetToText(map, mdOffset, bias)` snaps an offset inside syntax, such as a `**` delimiter, to the neighbouring text: `"before"` (the default) or `"after"`. Offsets are UTF-16 code units, the same as JavaScript string indices and editor selections. Use the map to place a position found in the file, such as a comment anchor or a model's edit, into the editor.

## API

| Export | Description |
| --- | --- |
| `parseMarkdown(text, options?)` | Returns `{ doc, snapshot }`. |
| `serializeMarkdown(doc, snapshot?)` | Returns `{ text, snapshot, map }`. Without a snapshot, writes canonical Markdown. |
| `blockToMarkdown(block, eol?)` | One block as canonical Markdown, without surrounding blank lines. |
| `isBlockEmpty(block)` | Whether the writer skips the block: a paragraph, heading or formula without text, a raw block without content, an embed without an address, a table without cells. |
| `fingerprint(block)` | The id-free canonical JSON used to detect changes. |
| `mdOffsetToText(map, mdOffset, bias?)` | Markdown offset to `{ blockId, offset }`, or `null`. |
| `textOffsetToMd(map, blockId, offset)` | Block text offset to a Markdown offset, or `null`. |
| `markdownRawNodeSpec` | The `NodeSpec` of the `markdownRaw` block. Pass it to `defineExtension` as in [With an editor](/docs/conversion/markdown#with-an-editor); the package does not depend on `@gotipe/core`, so its type repeats core's `NodeSpec`. |

| Option of `parseMarkdown` | Type | Default | Description |
| --- | --- | --- | --- |
| `previous` | `MarkdownSnapshot` | — | Snapshot of the previous version of the file. Blocks with the same source keep their ids. |
| `previousDoc` | `Doc` | — | Previous document, used when there is no snapshot. Blocks with the same fingerprint keep their ids. |
| `createId` | `() => string` | UUID v7 | Id factory for new blocks. |

The package also exports the types `Doc`, `Block`, `Span`, `Mark`, `ParseOptions`, `ParseResult`, `SerializeResult`, `MarkdownSnapshot`, `SnapshotBlock`, `SnapshotNode`, `MarkdownMap`, `MapBlock` and `TextSegment`.

## Limits

> [!NOTE]
> The codec keeps what it cannot edit, but Markdown cannot hold everything a GoTipe document can. Check the points below before you make Markdown the only storage of your documents.

- **Soft line breaks.** A line break inside a paragraph is kept as a line break and shown as one in the editor; GitHub and most renderers show it as a space.
- **Canonical rewrite.** An edited block is written in canonical syntax: ATX headings, fenced code, `*`, `**` and `~~`, `| a |` tables, `<url>` or bare autolinks. List markers, numbering delimiters, start numbers and loose or tight spacing are kept.
- **Bare addresses.** Plain text such as `https://…`, `www.…` or an e-mail address becomes a link when an edited block is read again; escaping cannot prevent it.
- **Raw blocks.** Multi-paragraph list items and quotes, mixed and numbered task lists stay read-only raw blocks.
- **Not stored.** Image sizes, table column widths and cell spans, callout emoji and other attributes outside the mapping are not written. `toggle` and `columns` are written as their content.
- **Formulas.** A formula is written as a `$$` block, which GitHub and most renderers show as math, or as a ```` ```math ```` fence when its TeX has a line of its own `$$`; both read back as the same formula. A `$$` block needs its closing line and does not interrupt a paragraph, so other dollar signs stay text.
- **Embeds.** Markdown has no embed syntax: an embed is written as a link line `[name or address](address)` and reads back as a paragraph with that link. An empty formula and an embed without an address are left out at any depth.
- **Callout types.** Types without a GFM alert are written as the closest alert: `info` as `NOTE`, `success` as `TIP`, `error` as `CAUTION`; others as `NOTE`.
- **Files.** A `file` block is written as a link line labelled by its name, or by its address without one. It reads back as a file only when its name equals the decoded file name of a scheme-less path. A paragraph that holds only such a link, or only an image, is read as a file or image block.
- **Plain text code.** Code whose language is `plain` or `plaintext`, as older documents store it, is written with a bare fence; an untouched block keeps its source.
- **Inline code.** A line break in inline code is written as a line break only where that is safe, otherwise as a space, and never in headings or cells. A backslash right before `|` inside code in a table cell cannot be expressed in GFM and reads back with an extra backslash.
- **Front matter.** Only YAML-style front matter (`---` … `---` or `...` at the start of the file) is recognized.

## Performance

In GoTipe's own measurement, an 80 KB page of about 2,000 blocks parses in about 190 ms, and serializing it after an edit takes about 16 ms, because untouched blocks are copied, not rendered. Measure on your own content and hardware.

## Related

- [Page editor](/docs/ui/page-editor): Markdown in and out with model suggestions.
- [Content formats](/docs/concepts/content-formats): JSON, HTML and Markdown in the editor.
- [Model edits](/docs/review/model-edits): anchoring proposed edits in Markdown text.
- [Server conversion](/docs/conversion/server): the Rust converter, which has its own Markdown reader and writer.
