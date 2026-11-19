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

For a long document saved after every edit, `serializeMarkdown(doc, snapshot, { fingerprints })` takes a `WeakMap` you keep between calls: a top-level block object it has seen is not fingerprinted again. Use it only when blocks are never changed in place, so that a changed block is a new object, as the blocks of `editor.getViewState()` are. The text is the same with and without it.

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

A soft line break is read as a space, so the document does not hold the lines of a paragraph. When an edited block was in the snapshot, the writer reads its old source again and puts each line ending back where the words around it are still there, spelled as the file spelled it: a hard break of two trailing spaces stays two spaces, a blank before a soft break stays, and a lazy or deeper-indented continuation line keeps its indentation. An edit rewrites the lines it touches, and the other lines of the block stay byte for byte. Two lines become one only when the words on both sides of the break changed. A block new to the file is written on one line.

### Documents read by earlier versions

Earlier versions of `@gotipe/markdown` read a soft line break as `"\n"`, and documents stored from them still hold it. The writer now writes every `"\n"` as a hard break (`\` before the line ending), so once such a document is saved, a paragraph wrapped by hand shows a line break at every wrap where GitHub showed one paragraph. When you still have the Markdown file, read it again (`parseMarkdown(text, { previous: snapshot })` keeps the ids): soft breaks become spaces and the file is written back as it was. A document stored only as JSON cannot tell a soft break from a line break typed in the editor; the package ships no migration for it, so if your files were wrapped by hand, replace the `"\n"` between words with spaces in your own one-off script and review the result.

A fingerprint is the canonical JSON of a block without ids. It ignores Markdown style attributes (`marker`, `delimiter`, `spread`, and `breaks` of older documents) and attributes Markdown cannot hold, such as a callout's `emoji` or an image's `width`, so changing those does not rewrite a block.

Between two blocks that were neighbours in the source, the original gap is kept. A gap without a blank line is kept only while both blocks keep their types and, when one of them is rewritten, the two read the same with that gap as with a blank line; otherwise a blank line separates them. A quote whose source ends with an empty `>` line, for example, keeps the next paragraph out of the quote only by that line: once the quote is rewritten, a blank line separates them. Other blocks are separated by a blank line. The blanks before the first line of a block belong to that block and move with it. An untouched block keeps them wherever they leave it a block of its own, and drops them elsewhere when it reads the same without them; blanks before raw source count as needed, since what they mean inside it is not read. A rewritten block is written without them. When an untouched block would go into the block before it or lose its blanks, the block before it takes back the blanks of its own source if it reads the same with them. Failing that, an untouched block that needs its blanks is rewritten, as with indented code after a list or after other indented code: indented code becomes a fenced block. The BOM, the front matter and the empty lines before the first block are always kept; the text after the last block is kept when the last block is still the original last one, otherwise the file ends with one line break. Rewritten blocks use the file's line ending. Empty paragraphs and headings are skipped unless they are kept verbatim; the blocks under them are still written.

The writer also avoids structural accidents: two adjacent lists that would merge get different markers, a divider at the start of a file is written as `***` so it is not read as front matter, and a nested list that cannot interrupt the text of its item (numbered from another number than 1, or starting with an empty item) gets a blank line, under a task without text too. A blank line there makes the outer list loose when it is read back. Raw source is written as it is, so of two adjacent raw lists with one marker, the items of the later one take another bullet or numbering delimiter, one under which it reads as the same list: a list with an item `* *` takes `+`, since `*` would turn that item into a thematic break. Where no marker keeps the later list as it was, the earlier list takes one; two lists that no marker keeps apart, such as two `+` lists with the items `- -` and `* *`, still read back as one. A raw list also takes another marker when the numbered list before it could only change its delimiter by joining the list before that. Lists that were neighbours in the source and are written as their source keep their markers. A fenced code block, or HTML that ends only at its own end (`<pre>`, `<script>`, `<style>`, `<textarea>`, a comment, `<?`, `<![CDATA[`, a declaration), that the end of its file closed gets its end when another block now follows it: the fence of its opening line, or the end of the HTML on a line of its own.

## Document mapping

| Markdown | Block |
| --- | --- |
| Paragraph | `paragraph`; a soft line break is a space, a hard one (`\` or two spaces at the end of the line) is `"\n"` |
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

A list item holds rich text and nested lists only. An item of a bullet list with a `checked` attribute, as the Rust editor marks a task, is written as a task (`- [x] a`, `- [ ] a`) and reads back as a `todoItem`; next to plain items it makes the list a mixed one, which reads back as a raw block. A line ending inside inline code is a space, as in CommonMark. Only spaces and tabs are trimmed from the ends of a heading or a table cell: a no-break space there is text. A `"\n"` of a paragraph, quote, callout or list item is written as a hard break: `\` and a line ending, or `&#10;` at the start or end of the text. In headings and table cells a line break is `<br>`. `"\r\n"` and `"\r"` in text, and the references `&#13;` and `&#13;&#10;`, are line breaks too.

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

## Inline atoms

A mention, an inline formula, a custom emoji and an inline image are text with an atomic mark: the text is the fallback that search, export and screen readers see. The writer always writes these marks. The reader produces them only when asked with the `atoms` option, so a document gets only the marks its editor declares; without it the same source reads as in the tables above.

```ts
const { doc } = parseMarkdown(text, {
  atoms: {
    mention: true,
    inlineMath: true,
    inlineImage: true,
    customEmoji: { party: "https://cdn.example.com/party.png" },
  },
});
```

| Inline Markdown | Text | Mark |
| --- | --- | --- |
| `[@Anna](mention:user-42)`, `[Roadmap](mention:page-7)` | `@Anna`, `Roadmap` | `mention` with `id`, `kind` (`"user"` or `"page"`) and `label` |
| `$x^2$` | `x^2` | `inlineMath` |
| `:party:`, when `party` is a key of `customEmoji` | `:party:` | `customEmoji` with `name` and `src` from the registry |
| `![alt](src)` among other inline content | `alt`, or the file name of `src`, or `image` | `inlineImage` with `src` and `alt` |

- **Mention.** The address is `mention:`, the kind, `-` and the id; every byte of the id outside `A-Za-z0-9-._~` is written as `%XX`. The label is the text without the leading `@` of a user, or the link title when there is one: `[@Ann](mention:user-42 "Anna Smith")`. Line breaks of a label are written as `&#10;` (`&#13;`), so a blank line never ends the paragraph. A link with another kind, an empty or malformed id, or with an image or HTML in its text stays a link.
- **Inline formula.** The rule is pandoc's: the opening `$` is followed by a character that is neither a space nor `$`; the first `$` after it on the same line that no backslash precedes must follow a non-space character and must not be followed by a digit. So `$5 and $6` and `$a$5` are text, and `\$` is a dollar sign. The TeX is taken as written. In a table cell `|` is written as `\|`.
- **Typed dollars.** When a block is rewritten, a `$` of plain text that would open a formula under this rule is written as `\$`, so text never turns into a formula on reload; other dollars stay as typed. A digit right after a formula is written as a character reference: `$n$&#50;`.
- **Custom emoji.** A name is `[A-Za-z0-9_+-]+`. A shortcode is read only when no ASCII letter or digit touches it on either side and it is not part of an address: `10:30:45`, `a:party:`, `https://example.com/:party:` and link destinations stay text. The writer escapes typed text that would read as one of the document's custom emoji (`\:party:`) and writes a letter or digit right beside an emoji as a character reference (`&#97;:party:`).
- **Inline image.** A paragraph that holds only an image is the `image` block, as before, unless the image has an empty title: `![alt](src "")` alone is a paragraph with an inline image when inline images are read, and the writer writes an inline image that is all of its block that way. An image with a non-empty title stays verbatim text. Width and height are not written.
- **Keys.** Every atom the reader makes gets a `key` attribute numbered in document order (`"1"`, `"2"`, … over blocks depth-first and spans left to right), so no two atoms of a document are equal and equal neighbours never join. The writer ignores `key`.
- **What cannot be written** stays as text: a formula that breaks the rule above (a leading or trailing space, a line break, a bare `$`), an emoji whose name has other characters, a mention without an id.

The Rust reader takes the same choice from the schema: `from_markdown(md, &schema)` reads a mention, an inline formula and an inline image when the schema declares that mark `atomic`, and `from_markdown_with_atoms(md, &schema, &MarkdownAtoms { .. })` also takes the emoji registry. Both readers and writers check one fixture, `crates/gotipe-export/tests/fixtures/markdown-atoms.json`.

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
- `map.segments` maps ranges of a block's flat text (its span texts joined, or the raw string of a code or raw block) to ranges of the Markdown. In an `exact` segment every character maps to one character. Escapes, character references, soft breaks (a space of the text over a line ending and the stripped prefix of the next line) and `<br>` in cells get their own non-exact segments.

```ts title="map.ts"
import {
  mdOffsetToText,
  parseMarkdown,
  serializeMarkdown,
  textOffsetToMd,
  textRangeToMd,
} from "@gotipe/markdown";

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
| `isBlockEmpty(block)` | Whether the block has nothing of its own to write, so the writer skips it: a paragraph, heading or formula without text, a raw block without content, an embed without an address, a table without cells. A paragraph or heading without text is skipped only when no block under it is written. |
| `fingerprint(block)` | The id-free canonical JSON used to detect changes. |
| `mdOffsetToText(map, mdOffset, bias?)` | Markdown offset to `{ blockId, offset }`, or `null`. |
| `textOffsetToMd(map, blockId, offset, bias?)` | Block text offset to a Markdown offset, or `null`. At the edge of a mark, `"after"` (default) stands past its delimiters, `"before"` before them: the end of `**bold**` is before the closing `**`. |
| `textRangeToMd(map, from, to)` | A text range (`{ blockId, offset }` each, in document order) to `{ start, end }` in the Markdown, with no mark delimiters at its edges; `null` when a side is not in the map. |
| `markdownRawNodeSpec` | The `NodeSpec` of the `markdownRaw` block. Pass it to `defineExtension` as in [With an editor](/docs/conversion/markdown#with-an-editor); the package does not depend on `@gotipe/core`, so its type repeats core's `NodeSpec`. |

| Option of `parseMarkdown` | Type | Default | Description |
| --- | --- | --- | --- |
| `previous` | `MarkdownSnapshot` | — | Snapshot of the previous version of the file. Blocks with the same source keep their ids. |
| `previousDoc` | `Doc` | — | Previous document, used when there is no snapshot. Blocks with the same fingerprint keep their ids. |
| `createId` | `() => string` | UUID v7 | Id factory for new blocks. |
| `atoms` | `InlineAtoms` | — | Inline atoms to read: `mention`, `inlineMath`, `inlineImage` (booleans) and `customEmoji` (names and their image addresses). See [Inline atoms](/docs/conversion/markdown#inline-atoms). |

The package also exports the types `Doc`, `Block`, `Span`, `Mark`, `ParseOptions`, `InlineAtoms`, `ParseResult`, `SerializeResult`, `MarkdownSnapshot`, `SnapshotBlock`, `SnapshotNode`, `MarkdownMap`, `MapBlock` and `TextSegment`.

## Limits

> [!NOTE]
> The codec keeps what it cannot edit, but Markdown cannot hold everything a GoTipe document can. Check the points below before you make Markdown the only storage of your documents.

- **Line breaks.** A soft line break reads as a space and a hard one as a line break, as in CommonMark. Reference links, footnote references and other text kept verbatim (`mdRaw`) keep the line endings of their source.
- **Canonical rewrite.** An edited block is written in canonical syntax: ATX headings, fenced code, `*`, `**` and `~~`, `| a |` tables, `<url>` or bare autolinks. List markers, numbering delimiters, start numbers and loose or tight spacing are kept.
- **Bare addresses.** Plain text such as `www.example.com`, `https://…` or an e-mail address is written with the character that would start a GFM autolink escaped (`www\.example.com`, `https\://…`, `name\@example.com`), so it reads back as text. The reader takes an address only where the source writes its start as it is: an escape or a character reference in `www.`, in `scheme://` or in the `@` keeps the words text, while one in the rest of an address is part of it (`https://example.com/a\_b` is one link). `www.` starts an address in lower case only.
- **Raw blocks.** Multi-paragraph list items and quotes, mixed and numbered task lists stay read-only raw blocks. When an edit puts two such lists with one marker next to each other, the items of one of them are written with another marker and read back so: raw source changes only there. Raw lists inside other blocks, a `toggle` or `columns` block among them, get the same protection; an unclosed raw block there is not ended (see Unclosed blocks).
- **Lines without indentation.** As in CommonMark, a line without indentation right after a list item or a quote stays in it only as more of its text, a blank line inside the item notwithstanding: after an empty item (`-`, then `b`), a heading, code or a table it starts a block after the list or the quote, and any list item, empty or numbered not from 1, ends a quote. A link reference definition is paragraph text, so the line right after it continues that text unless it interrupts a paragraph: `[a]: /u`, then `2. x` is a paragraph. As in GFM, a run of `-` without `|` under a row is a heading underline, and a list item, HTML or indented code ends a table. As in GFM, a head row needs no `|` (`a`, then `:-:` is a table of one column), while a delimiter row that starts a list item (`a | b`, then `- | -`) starts the list, and one indented by four spaces continues the paragraph. A table does not interrupt a paragraph: `x`, then a head row and a delimiter row read as one paragraph, where GitHub reads the paragraph `x` and a table.
- **Indented code.** When an edit, a deletion or a move puts untouched indented code right after a list or other indented code that would take it in, and the block before it cannot keep it out with the indentation of its own source, the code is rewritten as a fenced block, so that it does not read as part of the last list item or of the code before it. The same holds for any untouched block whose indentation would carry it into the block before it; raw source there is written without its indentation, which can change what the indentation meant inside it.
- **Unclosed blocks.** A fenced code block or HTML such as `<pre>` without its closing line runs to the end of the file. When a block is added or moved after it, the writer adds that line: a code block reads back the same, while raw HTML reads back with the added line in its source.
- **Not stored.** Image sizes, table column widths, callout emoji and other attributes outside the mapping are not written. `toggle` and `columns` are written as their content; one without text whose blocks write nothing, such as an empty toggle, is left out at any depth, as an empty paragraph is, and keeps no lists apart.
- **Merged cells.** A table with merged cells has no GFM form and is written as an HTML table. Text kept verbatim (`mdRaw`) in its cells is written as text in a `<span>` of its own and reads back as it was; renderers that show the HTML show it as source text, since HTML does not read Markdown.
- **Nested lists.** Of two neighbouring lists with one marker inside an item, a quote or a callout, the later one is written with another marker, as at the top level. A list in a quote or a callout reads back as a raw block. A paragraph right after a nested list in a tight item, a divider right after the text of an item, and the children of an item without text that a blank line follows do not read back in their place.
- **Formulas.** A formula is written as a `$$` block, which GitHub and most renderers show as math, or as a ```` ```math ```` fence when its TeX has a line of its own `$$`; both read back as the same formula. A `$$` block needs its closing line and does not interrupt a paragraph, so other dollar signs stay text.
- **Embeds.** Markdown has no embed syntax: an embed is written as a link line `[name or address](address)` and reads back as a paragraph with that link. An empty formula and an embed without an address are left out at any depth.
- **Callout types.** Types without a GFM alert are written as the closest alert: `info` as `NOTE`, `success` as `TIP`, `error` as `CAUTION`; others as `NOTE`.
- **Files.** A `file` block is written as a link line labelled by its name, or by its address without one. It reads back as a file only when its name equals the decoded file name of a scheme-less path. A paragraph that holds only such a link, or only an image, is read as a file or image block.
- **Plain text code.** Code whose language is `plain` or `plaintext`, as older documents store it, is written with a bare fence; an untouched block keeps its source.
- **Inline code.** Markdown has no line break inside inline code: a line ending in a code span reads as a space (CommonMark). A `"\n"` in code text is therefore written as a hard break between two code spans, `` `a`\ `` and `` `b` `` on the next line (`<br>` in headings and cells); the text comes back, but the line break itself has no code mark. A backslash right before `|` inside code in a table cell cannot be expressed in GFM and reads back with an extra backslash.
- **Front matter.** Only YAML-style front matter (`---` … `---` or `...` at the start of the file) is recognized.

## Performance

In GoTipe's own measurement, an 80 KB page of about 2,000 blocks parses in about 190 ms, and serializing it after an edit takes about 16 ms, because untouched blocks are copied, not rendered. Writing a block takes time in proportion to its length: one paragraph of 100,000 words is written in about 0.1 s. Measure on your own content and hardware.

## Related

- [Page editor](/docs/ui/page-editor): Markdown in and out with model suggestions.
- [Content formats](/docs/concepts/content-formats): JSON, HTML and Markdown in the editor.
- [Model edits](/docs/review/model-edits): anchoring proposed edits in Markdown text.
- [Server conversion](/docs/conversion/server): the Rust converter, which has its own Markdown reader and writer. Its writer writes text and lays out blocks as this package does without a snapshot: empty paragraphs and headings are left out, a divider that starts the file is `***`, neighbouring lists with one marker get different markers at any depth, and a nested list that cannot interrupt its item follows a blank line. It writes every list tight. The output is byte for byte the same on the shared cases (`crates/gotipe-export/tests/fixtures/markdown-line-breaks.json`, `markdown-write-read.json`, `markdown-nested-write-read.json`).
