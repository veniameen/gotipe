# Development checks

Before an edit, choose the behavior, the risk, and the check. A move preserves exports, errors,
CSS order, keys/mount, subscriptions, and formats. A test does not repeat the implementation.

| Change | Targeted check |
|---|---|
| Transactions/schema/history | atomicity, invalid inputs, raw/nested, undo/redo, Unicode |
| JS/WASM | the same semantic scenarios on both engines |
| Markdown/clipboard | structure/marks/bytes, nested selection, safe cut, roundtrip |
| Adapters | StrictMode/late resolve/destroy, creation failure without an unhandled rejection, subscriptions, stable snapshot, SSR |
| UI/menus/DnD | real gestures, keyboard/focus/read-only, resize/scroll, light/dark |
| CRDT | 2–3 peers, different delivery orders, duplicates/reconnect, convergence |
| Cloud/SDK | another role/user/scope, malformed payload, storage failure, 204/errors |
| Export | a consumer/format validator, Unicode, no format substitution |
| Packages | tarball/files/license/exports, ESM/CJS/types, a clean consumer |

## Commands

```sh
pnpm check:architecture
pnpm check:architecture:release
pnpm --filter @gotipe/react exec vitest run --maxWorkers 2
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm check:packages
pnpm check:consumer
pnpm check:bundles
pnpm check:theme
pnpm check:exports
pnpm check:pdf-regression
pnpm check:cargo-release
python3 scripts/collect-rust-licenses.py --check
python3 scripts/collect-cloud-licenses.py --check
cargo fmt --all -- --check
CARGO_BUILD_JOBS=2 cargo test --locked --workspace --all-features
cargo clippy --all-targets --all-features -- -D warnings
pnpm build:wasm
pnpm build:export-wasm
pnpm build:converter
pnpm exec playwright test
(cd apps/cloud && go test ./... -race)
```

For an intermediate run, choose a workspace filter or a file. Run the full checks on the
final tree. Do not work around skip/timeout errors. Browser matrix: Chromium,
Firefox, WebKit; 320/375/768/1024/1440 and a resizable container. Check not only the
page overflow but also the available editor width and interactions.

Typing latency on a long page is measured, not asserted:
`GOTIPE_E2E_CHANNEL=chrome node scripts/perf/typing-latency.mjs --label <name>` builds the
technical consumer `apps/playground/tests/perf` (production React, JS engine, a generated page of
about 258 KiB and 7,384 blocks, and a small one), types 50 keys in the middle of the page and
writes the median and p95 from `keydown` to the next frame to `output/perf/`; it fails when the
emitted Markdown differs from the page by more than the typed text. `--profile` also saves a CPU
profile. Run it alone (a heavy run) and compare runs of one machine only. What keeps the cost of a
key press from growing with the document is pinned by unit tests: `core/tests/engine-states.test.ts`,
`core/tests/render-correction.test.ts`, `react/src/content/plain-blocks.test.tsx`,
`markdown/src/fingerprints.test.ts`.

Reports/traces/screenshots go to the ignored `output/`. Record the command, the tools,
the tree/commit, and the result/limitations. An old CI run does not confirm the current code.
Publishing is not part of local acceptance and is not run automatically.

`check:consumer` packs all public packages and installs the real tarballs
into a separate directory with workspace links disabled and strict peer dependencies.
Local overrides allow only internal versions that are not yet published;
the sources do not replace the contents of the archives. It checks all JS exports in ESM/CJS,
declarations without `skipLibCheck`, headless SSR/Markdown, a PDF/DOCX call, and a single
`GoTipeError` across all `@gotipe/core` entry points in ESM and CJS (D-166).
The command requires a prior build of JS, core WASM, and the optional export WASM.


JavaScript size is checked against the [full import graph](javascript-budgets.md),
not only the entry file. For a full local acceptance run, limit Turbo to
`--concurrency=2` and Vitest to `--maxWorkers=2`; the WASM scripts use
at most two Cargo/Binaryen workers by default.

The built WASM modules (`packages/wasm/pkg`, `packages/export-wasm/pkg`) are inputs to the
`@gotipe/wasm#build` and `@gotipe/export-wasm#build` tasks in `turbo.json`. After `pnpm build:wasm`
or `build:export-wasm`, Turbo rebuilds and rechecks everything that depends on them once,
and engine tests do not come from a cache produced against the previous binary.

`check:pdf-regression` saves native PDFs from a fixed corpus and compares
them with the real public WASM export. The independent validator uses Poppler
(`pdfinfo`, `pdftotext`, `pdftohtml`) and Python `pypdf`: Unicode, page geometry,
pagination, marks, links, images, merged tables, and explicit errors. These tools
are needed locally; CI installs `poppler-utils` and `python3-pypdf`.
The browser corpus is in `e2e/pdf-export.spec.ts` and is part of the overall suite.

## Editor UI geometry

`e2e/editor-visual-audit.spec.ts` walks the playground editors: PageEditor (Page), BlockEditor
(Block), and BlockEditor with a page header and a counter (Views). It covers the notion, docs, modern, and
minimal views, light and dark themes, and widths 320, 375, 768, 1024, and 1440. The audit document
(`e2e/helpers/visual-audit/document.ts`) contains every block: headings, nested lists and
tasks, a quote, a callout, code, a formula, a table, an image with a caption and an empty one, a file, an embed,
a toggle, columns, a divider, a right-to-left paragraph. The pointer is placed on each block, and
the check requires that:
- the handle does not cover text, a checkbox, a marker or number, a callout icon, a field, or an image, and
  sits inside the editor, the screen, and all clipping containers;
- the handle's center is on the block's first line (tolerance 2.5 px): the first line of its editable text,
  the top row of an image, the file name or embed address line, the table header row;
- in modern and minimal there is no handle; a cell has a row or column handle in its own gutter, not on the text;
- columns do not extend past each other or past their block, and the page header and counter sit in the text column;
- the bubble menu over a word at the start and at the end of a line, the slash menu at the bottom of the screen and from "+", the handle menu,
  "Turn into", and the handle tooltips are on screen; the page does not scroll sideways.

The full sweep (120 configurations) runs in Chrome, a sample of six in Firefox and WebKit; the network
outside localhost is cut off. A violation leaves a snapshot with the frames of the handle (red) and of what it
touched (blue) in `output/editor-visual-audit/<browser>/<configuration>/`, and the configuration's result is
in the adjacent JSON:

```sh
GOTIPE_E2E_CHANNEL=chrome GOTIPE_E2E_PORT=5420 pnpm exec playwright test e2e/editor-visual-audit.spec.ts
```
