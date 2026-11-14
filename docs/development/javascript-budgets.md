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

On the audit build, with this exact definition:

| Graph | gzip9 bytes | Ceiling |
|---|---:|---:|
| Core and own Markdown parser | 87,823 | 102,400 (100 KiB) |
| React increment, including i18n | 26,603 | 30,720 (30 KiB) |
| AI increment | 7,530 | 12,288 (12 KiB) |

On the merge build of 2026-11-12 the same graphs measure 95,659 (core and Markdown,
6.6% under its ceiling), 36,441 (React) and 7,536 (AI) bytes.

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
