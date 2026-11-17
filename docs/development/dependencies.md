# Dependency policy

Owner decision of 2026-11-09: our own editor core, Markdown, and small
helper algorithms. A package replacement is completed after regression/parity
checks; a package's age alone does not determine quality or security.

| Category | Decision |
|---|---|
| Editor/Markdown/utility runtime | our own modules, no new external dependencies |
| React/React DOM/Vue/Svelte/Solid | peers of the corresponding adapters/UI |
| Shiki | the existing optional host adapter, a separate lazy entry; not part of the core |
| mdast/micromark | removed; Markdown is parsed by GoTipe's own parser |
| Web APIs | DOMParser, URL, Intl.Segmenter, Web Crypto with boundary validation |
| Rust/Go platform libraries | serde/WASM, TLS/crypto, DB/storage/network drivers; do not write our own cryptography |
| Build/test tooling | devDependencies, not the consumer's runtime |

A new dependency explains the task, why the platform or our own code does not fit,
the license, the bundle impact, and the owner of updates. Bloating the allowlist for CI
is forbidden. On removal, update the lockfile and check a clean install and the entrypoints.

`pnpm check:architecture` checks runtime imports. Release mode forbids the
temporary Markdown debt. External systems remain adapters: the editor's rules
do not depend on a specific application.

## Optional PDF and DOCX

Owner decision of 2026-11-10: GoTipe owns document traversal, page
layout, line breaking, tables, marks, headers and footers, and PDF/OOXML rendering.
Typst, typst-pdf, typst-assets as runtime dependencies, and citationberg are removed.
No full document/layout compiler is part of the new PDF backend.

Narrow libraries handle specialized formats and international text:

| Library | Task and reason | License |
|---|---|---|
| pdf-writer 0.15 | correct serialization of PDF objects/xref/streams; not layout | MIT/Apache-2.0 |
| harfrust 0.15 | OpenType shaping, ligatures, complex scripts; a maintained HarfBuzz implementation | MIT |
| read-fonts 0.46 | verified reading of OpenType tables/metrics; a parser shared with harfrust | MIT/Apache-2.0 |
| subsetter 0.2.6 | CFF/TrueType glyph subsetting and instancing of variable Noto Emoji; we do not rewrite a font compiler | MIT/Apache-2.0 |
| unicode-bidi / unicode-segmentation | the standard UAX #9/#29: text order and grapheme cluster boundaries, not document layout | MIT/Apache-2.0 |
| flate2 / zlib-rs and ZIP 9 | Deflate streams and the OOXML container; we do not rewrite compression | MIT/Apache-2.0, Zlib, MIT |
| image 0.25 | bounded decoding of PNG/JPEG/GIF/WebP; no raster codec of our own is needed | MIT/Apache-2.0 |
| image-webp 0.2 (the `webp` feature of image) | WebP (VP8 and VP8L) is one of the four formats the editor accepts on upload (`IMAGE_MEDIA_TYPES`); without it PDF/DOCX rejected a document that the editor displays. Pure Rust without unsafe/C, about 8.7 thousand lines, the same owner as image (image-rs) and the same `Limits`; it pulls in only quick-error 2 (MIT/Apache-2.0), byteorder-lite is already in the graph. Export WASM and `gotipe-convert` only, not the core | MIT/Apache-2.0 |

Subsetting enables the upstream variable-fonts feature, so it uses its own
skrifa/write-fonts/kurbo. A direct second skrifa scaler is not connected: the exporter
needs only read-fonts, which HarfRust already requires. HarfRust's optional ICU feature
is off. Exact transitive versions and original notices are generated from the lockfile.
These libraries are allowed only for the separate PDF/DOCX exporter, not for the core,
Markdown, or small helpers. The owner of updates is the export module.

In the browser PDF/DOCX are part of the separate `@gotipe/export-wasm`; `@gotipe/export`
loads it on the first request. The main editor WASM does not include these features.
Importing the wrapper does not start loading/initialization. Cloud calls the same native
`gotipe-convert`. The size of the new WASM is measured after the build, not derived from the
size of the Cargo graph. The core bundle is checked separately.

Image URLs are loaded by the explicit host `resolveImage`; the native renderer gets no
access to the network or to arbitrary files. Raster codecs check the size and memory
budget and normalize images to PNG for OOXML.

The unmodified fonts were moved from the published typst-assets 0.15.1 into
`crates/gotipe-export/assets`, together with the original LICENSE/NOTICE. They are Libertinus
Serif, New Computer Modern, and DejaVu Sans Mono; Noto Emoji is kept under the SIL OFL.
Names, bytes, and license terms are unchanged. `assets/inventory.json` records
the source archive/revision and SHA-256. The collector verifies the fonts and places the notices
in the optional npm package and the Cloud image. The fonts do not require an installed Typst.

Sources: [PDF writer](https://github.com/typst/pdf-writer),
[HarfRust](https://github.com/harfbuzz/harfrust),
[Fontations](https://github.com/googlefonts/fontations),
[Subsetter](https://github.com/typst/subsetter),
[Unicode bidi](https://github.com/servo/unicode-bidi),
[Unicode segmentation](https://github.com/unicode-rs/unicode-segmentation),
[ZIP codec](https://github.com/zip-rs/zip2),
[Noto Emoji / SIL OFL](https://github.com/google/fonts/tree/main/ofl/notoemoji).

Acceptance requires saved baseline fixtures of the previous backend, PDF/OOXML
validators, Unicode extraction, glyph/font checks, geometry/pagination, tables,
marks, images, header/footer, and identical behavior of native/WASM/Cloud. A build
or a clean audit alone does not confirm visual compatibility.

## Native Markdown grammar

The Rust import uses GoTipe's own lexer, block/inline AST, delimiter resolver,
reference handling, and converter. The existing `regex` (MIT/Apache-2.0)
executes bounded grammar patterns from the same contract as the JS
RegExp in the TS parser; no third-party Markdown parser is connected. This is a full
regular expression compiler, not a replacement for a small helper. Only
std/perf, Unicode Perl classes, and general categories for flanking punctuation are enabled.
Case-insensitive syntax patterns are limited to ASCII; Unicode case tables are disabled.
Import is limited to a depth of 64 and an inline scanning budget; unsupported syntax
is preserved raw. The owner is Rust export. The check is differential public-model
fixtures against the own TS parser, and the size of the main WASM after the linker.
The main WASM calls the Markdown serializer, the native parser is not exported;
its regex matcher/data must be excluded at link time. The presence of a build dependency
in the Cargo tree does not by itself prove that the code is in the final WASM.

### Named character reference data

The TS and Rust Markdown parsers embed the same 2,125 name-to-Unicode mappings.
They were verified against CPython v3.13.9 `html.entities.html5` with trailing
semicolons removed from keys; no Python parser implementation is imported.
`packages/markdown/THIRD_PARTY_NOTICES.md` records the pinned source and SHA-256.
Unmodified Python notices ship with the Markdown package, core WASM and native
converter source. The underlying names are defined by the WHATWG HTML standard.

### Cloud binary notices

`scripts/collect-cloud-licenses.py` derives the actually linked Go module graph
using `go list -deps`, copies original module-root license/notice files unchanged,
and records versions and hashes under `apps/cloud/licenses`. `--check` verifies
that inventory against the installed module cache. The Cloud image includes those
notices alongside the optional native export compiler/font notices and the
repository's original MIT/commercial license files; this does not change their
terms or grant an alternative license.

## Toolchain security maintenance (2026-11-10 audit)

The current registry audit required Vitest 4.1.12 (GHSA-5xrq-8626-4rwp,
GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8); the previous Vitest 2 branch had no
compatible complete fix. Runtime engine dependencies are unchanged. Framework
peers and existing development tools were updated within their declared ranges.
Vitest 4 accepts `--maxWorkers=2`; the removed `--minWorkers` flag must not remain
in CI commands.

Two narrowly scoped overrides are necessary while keeping the current major
versions: `next>postcss` uses PostCSS 8.5.23 or newer for source-map file disclosure
fixes (including GHSA-6g55-p6wh-862q and GHSA-r28c-9q8g-f849), and
`tsup>esbuild` uses esbuild 0.28.1 or newer for GHSA-g7r4-m6w7-qqqr. The latter is
an existing build compiler, not an editor runtime dependency; production ESM/CJS
and declaration builds must pass with it. Remove each override when the parent
dependency's supported range includes the fixed version.

The before/after audit and tool versions are local evidence in ignored `output/`.
The security workflow runs a fresh audit instead of treating a historic zero
finding count as a permanent guarantee.

## Release audit (2026-11-17)

The checks of the v0.1.0 release found two Rust advisories; neither is suppressed.

- `ammonia` 4.2.5 fixes RUSTSEC-2026-0533 (mutation XSS through embedded SVG and
  MathML). It is the HTML sanitizer behind the `html` feature of `gotipe-export`;
  the WASM exporter does not link it.
- `chrono` is unmaintained (RUSTSEC-2026-0543). Comments and versions only stored
  creation and resolution instants, so they now use GoTipe's own
  `gotipe_core::Timestamp`: RFC 3339 in UTC with the same text as before, read back
  from any offset. Before removal it matched chrono on 2,000,000 random instants of
  the years 0000 to 9999 in both directions. Its clock is the `clock` feature of
  `gotipe-core` (the system clock, or `Date.now()` through `js-sys` in a browser);
  only `gotipe-comments` and `gotipe-versioning` turn it on, so the exporter graph
  and its notices are unchanged.

## Native and Cloud security boundary

Cloud pins Go 1.26.11 through `apps/cloud/go.mod` (1.26.11 fixes GO-2026-6859 in
`net/http`, found by govulncheck on 2026-11-17); CI reads that file and the
Docker builder uses the same patch. The AWS S3, pgx, JWT, compression and x/*
modules include current advisory fixes. `x/crypto` pins the upstream OpenPGP
removal commit `2f1f834330b2`; GoTipe uses maintained crypto packages, not OpenPGP.
`govulncheck ./...` and `go mod verify` are mandatory and must be rerun after
module changes. Regenerate linked-module notices with the module graph.

The previous docx-rs release fixed its ZIP range below the available security
fix. GoTipe now owns OOXML rendering (paragraphs, marks, relationships, media,
tables, metadata), while the maintained ZIP 9 codec owns archive framing and
compression. Native and browser exports must pass independent XML/ZIP/PDF
validation, Unicode extraction and image checks after this migration.

The former Typst graph required a Git-only citationberg security fix and six
unmaintained dependencies. The owner-authorized PDF migration removes that
entire graph: citationberg, bincode, paste, rustybuzz, ttf-parser, unsafe-libyaml
and yaml-rust are absent from Cargo.lock. No advisory is suppressed and no
replacement is sourced from Git. `pnpm check:cargo-release` still rejects any
future Git dependency; `cargo deny check advisories` still rejects unmaintained
packages. The crates themselves are not published (owner decision, D-71: only npm),
but the release keeps the source check: the same graph is compiled into
`@gotipe/wasm`, `@gotipe/export-wasm` and the Cloud `gotipe-convert`, and a Git
checkout is mutable and outside registry yanking and advisories. Both checks passed for the new resolved graph on 2026-11-10; fresh
checks and runtime export acceptance remain mandatory for each release.

Original Cargo notices are regenerated for the exact current normal/build graph;
removed package notices are pruned rather than kept as a stale superset. Original
font notices remain separately under `licenses/fonts/` because the font assets
continue to ship after removal of the compiler dependency.
