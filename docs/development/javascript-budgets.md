# JavaScript graph budgets

Decision: measure shipped ESM import graphs, including our Markdown parser, and
report adapter costs separately from their shared core and framework peers.
`pnpm check:bundles` runs after the production build in CI and before publishing.
The machine-readable policy lives in `config/bundle-budgets.json`.

The old entry-file measurement was invalid for split output: `core/dist/index.js`
was a 525-byte gzip shell while its five local JavaScript files were about 44 KiB.
It also omitted the separately imported Markdown parser. The old 20 KiB core,
10 KiB React and 6 KiB AI ceilings did not describe the implemented features.
Changing those figures without measuring the dependency graph would hide cost.

The checker follows static imports, re-exports and literal dynamic imports through
emitted workspace ESM exports. Each distinct JavaScript file is compressed with
Node's `zlib.gzipSync` at level 9, and the compressed byte counts are summed.
This represents separate compressed assets; it does not predict a consumer's
tree shaking or pretend to be a single minified bundle. Shared files count once
per graph. Missing artifacts, unresolved imports and nonliteral dynamic imports
fail the check. The output records every counted file, external boundary and
non-JavaScript asset in ignored `output/bundle-sizes.json`.

Decision of 2026-11-15 (D-167): the budgets keep measuring unminified output, and the same
command fails on the comments esbuild keeps there. esbuild drops a comment that stands
before a statement, but keeps one inside an expression or a class body: a JSDoc on an
object property or a class member, a comment in an array, before an argument or a branch of
`?:`. `scripts/quality/bundle-comments.mjs` parses every emitted ESM file of every package
and lists such comments with file and line; annotations bundlers read (`@__PURE__`,
`@vite-ignore`) and legal notices are not counted. Where a comment goes instead: before
the statement, into the function body, and for a public class member onto a TypeScript
signature without a body — TypeScript keeps that JSDoc in the declarations, esbuild drops
it. Packages that other work still has to clean are listed with their counts in
`config/bundle-comments.json`; a count may not grow and must be lowered when comments go.
Cleaning collaboration, React, SDK and versions freed 1,789 gzip bytes of their ESM, of
them 1,449 in the collaboration increment (10,364 → 8,915) and 34 in the React one.

On the audit build, with this exact definition:

| Graph | gzip9 bytes | Ceiling |
|---|---:|---:|
| Core and own Markdown parser | 87,823 | 102,400 (100 KiB) |
| React increment, including i18n | 26,603 | 30,720 (30 KiB) |
| AI increment | 7,530 | 12,288 (12 KiB) |

On the merge build of 2026-11-12 the same graphs measure 95,659 (core and Markdown,
6.6% under its ceiling), 36,441 (React) and 7,536 (AI) bytes.

Decision of 2026-11-15: the core and Markdown ceiling is 128,000 (125 KiB), on the owner's
instruction to raise it when needed. The fixes D-84…D-100 took the graph from 116,181 to
121,208 bytes, 1.4% under 122,880. Both ends are measured with this checker; the tree of the
decision below (ed6fb90), rebuilt as it was, gives its 116,181 again.

- Core +350 (64,522 → 64,872): the findings D-84…D-88 (3508ef5), chiefly `createId()` with a
  fallback where `crypto.randomUUID` is missing (D-84).
- Markdown +4,677 (51,659 → 56,336): the soft line break read as a space, with the writer
  keeping the source's line endings (D-88, +1,139); write → read keeping the document — edge
  spaces as `&#32;`, emphasis as tags where `**` cannot open, escaped line starts, GFM
  bare-address rules and the linear writer (D-89…D-97, +3,265); the block-gap fixes D-99 and
  D-100 (+273).

All of it is codec behaviour that output read back depends on, not UI, so no subpath takes it
out of the graph. Headroom is about 5%.

Decision of 2026-11-14 (second): the core and Markdown ceiling is 122,880 (120 KiB).
The accepted Atlas frames 22–30 needed engine features: merged table cells with span-aware
edits and the geometry repair used by HTML import, clipboard and collaboration (about
6.5 KB), the Markdown reader and writer of merged tables as HTML (about 3.4 KB), font and
direction in HTML (about 0.8 KB) and the caret at atoms. Measured 116,181 bytes; moving
`editTable` to a subpath would save 2.3 KB and still exceed 112,640, so it stays. In the
same round the React increment fell from 45,634 to 31,859 by moving image and file
editing to `@gotipe/react/media` and block-editor strings out of `@gotipe/i18n`.
Headroom is about 5%.

Decision of 2026-11-14: the core and Markdown ceiling is 112,640 (110 KiB). Inline atoms
(atomic marks in both engines, their Markdown reader and writer, the atom HTML writer),
the hooks of the headless extensions and the collaboration deltas measured 106,511 bytes
after moving everything atom- or extension-only out of the core graph (extensions carry
`atomSupport`; find-replace, typography, emoji and the rest live only in their entries).
The same work shrank the core WASM from ~605 KB to ~300 KB gzip, so a WASM consumer
loads far less than before. Headroom is about 5%.

Decision of 2026-11-12: the React increment ceiling is 40,960 (40 KiB). The
GoTipe Atlas frames added the embed and math renderers, the table layout with
its handles, media states, content icons and the strings of the new UI in both
built-in locales: 36,441 bytes on the merge build (React renderer 27,582 + i18n
8,859). Dropping the 45 keys no code reads would save about 0.8 KiB, so the
cost is the features, not dead strings. Headroom is about 12% (it was 15%).

Measurement of 2026-11-14 (React split). Frames 22–30 took the React increment to 45,634
bytes (React renderer 33,578 + i18n 12,056), over its ceiling. Nothing was removed; code a
React-only host does not draw left the graph:

- Image and file editing (upload, link, resize, crop, caption, alt, preview, actions menu)
  is the separate entry `@gotipe/react/media` (10,833 bytes; with the shared chunk and i18n
  21,336). The React entry shows images and files read-only; `BlockEditor` and `PageEditor`
  provide the entry through `MediaBlocksContext`. A test walks the React entry's imports
  and fails if it reaches the editing modules.
- The 266 strings only `@gotipe/block-editor` draws moved to its own tables
  (`block-editor/src/i18n`); `@gotipe/i18n` keeps the 178 strings `@gotipe/react` draws and
  the shared words: 12,056 → 5,812 bytes.

The React increment is now 31,859 bytes (`index.js` 21,356, the chunk shared with the media
entry 4,691, i18n 5,812), 22% under the 40,960 ceiling. React with the media entry is 42,692.

Core and Markdown measured 116,181 bytes on the same tree, 3,541 over 112,640, while the
table and collaboration work was still landing. Against the 106,511 of the decision above,
the growth (attributed per source file through the source maps) is: the Markdown codec's
HTML-table reader (1,952) and writer (1,422) for merged cells; the table geometry in core
— grid 1,193, planner 1,876, steps 1,036, repair 349 — which HTML import, clipboard
clipping and the collaboration repair (664) use; font and direction in HTML read/write
(text-style 450, HTML reader and writer about 360); caret mapping at atoms (about 200).
Only `editTable`'s structural edits (insert, delete, merge, split; documented core API) are
used by UI alone: exporting `editTable` from a subpath instead of `@gotipe/core` saves
2,322 bytes and still leaves 113,859. The rest is codec and engine functionality, so the
ceiling is the owner's decision.

These are dated implementation measurements, not permanent product claims.
The ceilings allow limited maintenance headroom; increases require an explicit
architecture decision and evidence. UI increments exclude their framework peers
and the already measured core. Runtime workspace dependencies such as i18n are
included. Core's optional WASM module has its own mandatory canonical binary
budget (`pnpm build:wasm`), and is explicitly excluded from the JS graph.

PDF/DOCX rendering, fonts and codecs stay in the separate lazy
`@gotipe/export-wasm` module. Its small loader is measured; the final raw/gzip
exporter payload is recorded separately during release acceptance. Importing the editor or export wrapper must not initialize this module.
Syntax highlighting and additional heavy integrations must likewise keep their
loading boundary explicit. CSS and native/font/binary assets are not counted as
JavaScript; their separate reporting must not be described as a total page size.

Decision of 2026-11-18, under the owner's instruction of 2026-11-15 to raise a ceiling when
needed: the core and Markdown ceiling is 131,072 (128 KiB) and the Vue increment's 8,704
(8.5 KiB). Measured with this checker, the graph went from 127,296 bytes on the 0.1.1 tree
(5cea501e) to 129,600, 1.1% under the new ceiling, and the Vue increment to 8,285.

- Core and Markdown +2,304: typing in a long document (a key press on a 7,400-block page went from
  about 415 ms to about 30 ms): the engine states that parse a state once and keep what is known
  of each block (`engine/states.ts`), the render check that reads only changed blocks
  (`dom/render-correction.ts`), and the Markdown writer's kept block fingerprints; plus a host's
  failed `saveAsset` reported as `ASSET_SAVE_FAILED`.
- Vue +93 over the old ceiling: table columns without a stored width share the text column
  (`.gotipe-table-shared`), as in React.
