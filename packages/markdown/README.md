# @gotipe/markdown

Lossless GFM Markdown ⇄ GoTipe document codec for editing Markdown files that live in Git.

- An unchanged file round-trips **byte-for-byte** (BOM, front matter, CRLF, missing trailing
  newline, odd spacing, HTML, footnotes, link definitions — everything).
- After an edit only the source of the **changed top-level blocks** is rewritten; every other
  fragment (and the gaps between untouched neighbours) is copied from the original text.
- Pure ESM JS, no side effects on import, no Node-only APIs, no `eval`/`new Function`, no WASM.
  Built on `mdast-util-from-markdown` + `mdast-util-gfm` (CSP note below).

```ts
import { parseMarkdown, serializeMarkdown } from "@gotipe/markdown";

const { doc, snapshot } = parseMarkdown(fileText);
// ... the editor changes `doc` ...
const { text, snapshot: next, map } = serializeMarkdown(doc, snapshot);
// `text` differs from `fileText` only inside edited blocks; keep `next` for the next save.
```

## API

```ts
parseMarkdown(text: string, options?: {
  previous?: MarkdownSnapshot;   // re-parse after an external change: reuse block ids
  previousDoc?: Doc;             // same, when no snapshot is available (matches by fingerprint)
  createId?: () => string;       // default: UUID v7
}): { doc: Doc; snapshot: MarkdownSnapshot };

serializeMarkdown(doc: Doc, snapshot?: MarkdownSnapshot):
  { text: string; snapshot: MarkdownSnapshot; map: MarkdownMap };

blockToMarkdown(block: Block, eol?: string): string;   // one block, canonical Markdown
isBlockEmpty(block: Block): boolean;                    // blocks the serializer skips
fingerprint(block: Block): string;                      // id-free canonical JSON of a block

mdOffsetToText(map, mdOffset, bias?: "before" | "after"): { blockId; offset } | null;
textOffsetToMd(map, blockId, offset): number | null;

markdownRawNodeSpec   // plain GoTipe node spec for the `markdownRaw` block
```

`MarkdownSnapshot` is plain JSON (store it next to the open file). It holds the original text,
BOM, front matter, EOL style, and per top-level block its id, source range, fingerprint, nested
block ranges and text segments, plus the gaps between blocks and the trailing text.

`MarkdownMap.blocks` lists every block (nested too) with its range in `text`;
`MarkdownMap.segments` maps ranges of a block's flat text (concatenated span texts, or the raw
string of a code/raw block) to Markdown ranges. `exact: true` segments map char by char;
escapes (`\*`), character references (`&amp;`), soft breaks with stripped continuation prefixes,
`<br>` in cells etc. get their own non-exact segment.

## How serialization works

For each top-level block of `doc`:

1. The snapshot has a block with the same id **and** the same fingerprint → its original source
   slice is emitted verbatim. Fingerprints ignore ids and Markdown style attrs (`marker`,
   `delimiter`, `spread`, `breaks`) and attrs the codec does not use (e.g. a callout `emoji`).
2. Otherwise the block is serialized, re-parsed and compared with the input; the first rendering
   strategy that round-trips wins (delimiters → `<url>` autolinks → `<strong>`/`<em>`/`<s>` tags).

Between two blocks that were adjacent in the original the original gap is kept (unless a block
changed type and the gap has no blank line); otherwise `EOL EOL`. BOM, front matter and the
leading gap are always kept; the trailing text is kept when the last block is the original last
one, otherwise the file ends with one EOL. Empty paragraphs/headings are skipped
(`isBlockEmpty`) unless they are preserved verbatim. Re-serialized blocks use the file's EOL.

Structural hazards are handled: adjacent lists that would merge get a different marker, a leading
`---` divider is written as `***` when it would be read as front matter, an indented code block
after a list is re-fenced, nested ordered lists not starting at 1 get a blank line.

## Document model

| Markdown | Block |
| --- | --- |
| paragraph | `paragraph` (`breaks: "hard"` when it only has hard breaks) |
| `#`…`######`, setext | `heading {level}` |
| `-`/`*`/`+` list | `bulletList {marker, spread}` → `listItem` (rich text, nested lists only) |
| `1.`/`1)` list | `orderedList {start, delimiter, spread}` → `listItem` |
| task list (`- [ ]`, `- [x]`, also bare `- [ ]`) | `todoList {marker, spread}` → `todoItem {checked}` |
| quote with exactly one paragraph | `blockquote` |
| `> [!NOTE]` … (GFM alerts) | `callout {type: "note"…, alert: "NOTE"…}` |
| `> **Инструкции для агента:** …` | `callout {type: "agent"}` |
| fenced / indented code | `codeBlock {language, meta?}` (content: string) |
| `---`, `***`, `___` | `divider` |
| paragraph with only `![alt](src "caption")` | `image {src, alt, caption}` |
| paragraph with only `[name](relative/name)` | `file {url, name}` |
| GFM table | `table {align}` → `tableRow` → `tableHeader` / `tableCell` |
| HTML blocks, definitions, footnote definitions, anything else | `markdownRaw {kind}` (exact source) |

Marks: `bold`, `italic`, `strikethrough`, `code`, `link {href, title?}`, and paired simple inline
tags `<u>` → `underline`, `<mark>` → `highlight`, `<sup>`, `<sub>`, `<em>/<i>`, `<strong>/<b>`,
`<s>/<del>`. Other inline HTML, footnote references, reference links/images and inline images
are kept verbatim as text with the `mdRaw` mark. Line breaks are `"\n"` in text; in table cells
and headings `"\n"` ⇄ `<br>`.

Register the raw block in the editor:

```ts
import { markdownRawNodeSpec } from "@gotipe/markdown";
defineExtension({ name: "markdownRaw", nodes: [markdownRawNodeSpec] });
```

## Known limitations

- Plain text that GFM autolinks (`https://…`, `www.…`, e-mail addresses) becomes a link when the
  file is parsed again: the GFM transform works on decoded text, escaping cannot prevent it.
- Inline code: `"\n"` is written as a line break only where that is safe (otherwise a space),
  never in headings/cells. In table cells a backslash directly before `|` inside code cannot be
  expressed in GFM (it is written as `\\\|` and reads back with an extra backslash).
- `file` blocks round-trip only when `name` equals the decoded basename of a relative `url`;
  otherwise they read back as a paragraph with a link. Conversely a paragraph that is only such a
  link (or only an image) is read as a `file` (`image`) block.
- Lists mixing task and normal items, items with several paragraphs/code/quotes, nested task
  lists and ordered task lists are kept as one `markdownRaw` block. Quotes with more than one
  paragraph likewise. `<details>` blocks are split by CommonMark into HTML / paragraph / HTML
  blocks (the inner paragraphs are editable).
- Re-serialized blocks use canonical syntax (ATX headings, fenced code, `*`/`**`/`~~`,
  `| a |` tables, `<url>` or bare autolinks); list markers, delimiters, start and spread are kept.
  When emphasis cannot be expressed with delimiters (`** a**`, `x*(y)*`), HTML tags are used.
- Reference links and footnote references stay verbatim (`mdRaw`), they are not editable as links.
- Non-GFM callout types are mapped to alerts (`info` → `NOTE`, `success` → `TIP`,
  `error`/`danger` → `CAUTION`). Unknown block types: string content is written verbatim, rich
  text as a paragraph.
- Segments for named character references that decode to two code points use a heuristic.

### Strict CSP / Trusted Types

`mdast-util-from-markdown` depends on `decode-named-character-reference`, whose `browser`
export decodes entities through a DOM element (`innerHTML`, created at import time). This is
not `eval`, but it breaks under `require-trusted-types-for 'script'`. In that case point a
bundler alias for `decode-named-character-reference` at the file of its `default` export
condition (`index.js`, a pure-JS entity table) — e.g. a Vite `resolve.alias` entry with the
absolute path of that file. (Not verified in a host build yet.)

## Development

```bash
pnpm --filter @gotipe/markdown test        # Vitest (property test: 400 seeded documents)
pnpm --filter @gotipe/markdown typecheck
pnpm --filter @gotipe/markdown build
```
