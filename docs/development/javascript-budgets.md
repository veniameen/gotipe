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

Decision of 2026-11-12: the React increment ceiling is 40,960 (40 KiB). The
GoTipe Atlas frames added the embed and math renderers, the table layout with
its handles, media states, content icons and the strings of the new UI in both
built-in locales: 36,441 bytes on the merge build (React renderer 27,582 + i18n
8,859). Dropping the 45 keys no code reads would save about 0.8 KiB, so the
cost is the features, not dead strings. Headroom is about 12% (it was 15%).

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
