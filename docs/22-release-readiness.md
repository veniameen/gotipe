# GoTipe — getting to release

Status: **all 12 documentation blockers are closed ([docs/24](24-documentation-findings.md)); the final tree was accepted on 2026-11-15** (section "Acceptance before release"); the fixes for the H findings after it were checked on trees 23ba1f6, bbaa7ad, 5c4cf1f, d2ea636, 56d8195, 8f99760, 4f844ee, 03f5996 and ad30c45 (log). Findings of levels H (4) and L (4) remain open, counting the partly fixed ones; per [docs/24](24-documentation-findings.md) they do not block the release. All four H findings are leftovers of large features (D-07, D-32, D-44, D-65), deferred by the owner until after the first release. Of the L findings, D-233 was closed on 2026-11-17: Cloud is local-only for now, and the `deploy-cloud.yml` and `deploy-infra.yml` workflows were deleted. The other L findings are minor: D-250, D-251 (Cloud), D-255 (Markdown) and D-265 (block columns stay side by side on a phone; waiting for an owner decision); `@gotipe/block-editor-vue` is not published until it is ready. The release, publishing and deployment are owner decisions.
Started 2026-11-09 at the owner's direct request.

On November 10 the owner allowed replacing Typst with our own PDF layout on top of small libraries
for writing PDF and handling fonts, keeping the browser and server export features. Typst and the
Git patch for citationberg are removed; the fresh Cargo advisory/license and source-release gates
pass. The final `main` tree was accepted on 2026-11-15 (section "Acceptance before release");
the earlier acceptances below are history.

## Outcome

Our own editor library, ready for use in SpecOrbit and other applications: public APIs, every
feature the repository declares, adapters, ready-made UI, documentation and checked packages. The
visual basis is the GoTipe Atlas (`design/atlas`): shared notion/docs/modern/minimal views on one
set of tokens, light and dark themes. PageEditor is built on the same views; there is no separate
page theme anymore.

Owner clarification of November 10: GoTipe stays a library, an analog of an editor SDK. Wiki, the
page tree, tabs, permissions, saving and the model workflow are implemented in SpecOrbit on top of
its public API. The separate SpecOrbit Wiki shell is removed from GoTipe; PageEditor is shown as a
variant of the shared editor example. The CSP checks remain a technical consumer test, not a Wiki
application.

Readiness means passing the checks listed below and having no known blocking defects in the
supported scenarios. Old "done" marks and successful builds without tests do not confirm the
result on their own.

Publishing follows the owner's decision of 2026-11-17: the crates 0.1.0 are on crates.io, published
by hand with `publish-crates.yml` (revising D-71); the npm packages are published by `release.yml`
when the tag `v0.1.0` is pushed and all its checks pass. Every push to main deploys the site
(`deploy-site.yml`); Cloud runs only locally (D-233).

## Working order

1. Inventory of public features and a reproducible source run.
2. Bugs that lose data, selection, history or break access boundaries.
3. Full implementations of APIs and features that are stubs today.
4. One visual language for all examples, panels and editor states.
5. Responsiveness, keyboard, accessibility, scrolling, menus and lifecycle.
6. Integrations, clean install, packaging and honest documentation.
7. A repeated full run on a pinned state and a release report.

Changes are made in small verifiable batches. Heavy builds and browser runs are started one after
another; up to four workers at a time. Agents get separate directories. Secrets and user data are
not part of the check artifacts.

## Required feature matrix

| Area | Required result | Status |
|---|---|---|
| Core JS / Rust / WASM | the same semantics for transactions, Unicode, schema, events, history | 268 core tests and 228 native tests passed; full browser rerun 2634/2634 |
| Input | Cyrillic, emoji, IME, selection, Enter/Backspace/Delete, undo/redo | Unicode/IME/caret/Shift+Enter fixed; the full rerun in three engines passed; the input conflict is documented in R-041 |
| Clipboard | text, HTML, Markdown, nested and crossing block selections; safe cut | native clipboard and strict cross-block Undo/Redo checks passed |
| Markdown | source bytes of unchanged fragments, minimal diff, nested structures | own parser; 94 TS tests, 652 CommonMark cases and native parity passed |
| Blocks and marks | all exported extensions, commands and transforms without losing content | unit/transform matrix and the shared rerun of 878 scenarios × 3 engines passed |
| Moving | blocks/rows/nested lists, visible drop position, atomic cancel | desktop, nested rows, touch/pen, cancel and a single Undo checked |
| Tables and media | editing, sizes, paste, files through the host API, errors/cancel | atomic table/resize/upload/crop/caption/read-only checked in all three engines |
| UI | PageEditor, BlockEditor, panels, menus, loading/error/empty/read-only states | 12 routes + a second variant of the main editor × 5 widths × 2 themes; floating/keyboard/container checks passed |
| Discussions and edits | comments/replies/resolving, suggestions/staleness/accepting | comments/replies/anchors/persistence and accept/reject/undo checked |
| Versions | create, list, view, compare, restore, history | snapshot/diff/restore/undo and the interface checked |
| AI | a real provider API, stream/cancel/errors, tools and edits; the demo is labeled | provider contracts/stream/cancel/error and three browsers checked; paid external calls were not made |
| Collaboration | real sync, concurrent edits, reconnect, cursors | two real WASM replicas → offline edits → reconnect → durable PostgreSQL bootstrap checked |
| Export/import | every declared format produces a valid result, limits documented | Own PDF backend: native corpus 26/26, full Rust 249/249; native/WASM 52/52, PDF browsers 78/78, Cloud 19/19 and clean consumer passed. R-034 resolved |
| Adapters | React/Vue/Svelte/Solid: render, subscriptions, destroy, SSR, strict mode | lifecycle, destroy, subscriptions, SSR and clean package consumers checked |
| SDK / Cloud | matching contracts, access rights, storage, errors, tests without external payment | role/scope/storage/errors, Go race/integration, Docker and native/browser exports checked |
| Migration | supported documents of other editors, losses clearly visible | the 3 supported converter APIs and the loss boundaries documented and checked |
| Packages | exports/types/files/licenses, ESM/CJS/SSR, clean consumer | 21 tarballs, 27 ESM/25 CJS entries, strict types and a clean consumer passed |
| Documentation | examples are reproducible, no promises of nonexistent features | supported contracts updated; 00–20 marked as historical designs |

## Interface criteria

- Checks at widths 320, 375, 768, 1024 and 1440 px, and in a resizable container.
- Text and buttons do not overlap; the page gets no accidental horizontal scroll. Wide
  tables/code scroll inside their own block.
- Menus and panels stay in the visible area after resize, scroll, content changes and a theme
  switch. The first frame of opening does not show a menu in the wrong position.
- Hover is not lost on the way to the handle/menu. A DOM re-render does not lose the caret,
  selection or active input. Lines do not jump when controls appear.
- Controls are reachable by keyboard, focus is visible; Escape, focus restoration and read-only
  are checked. Reduced motion and text scaling are respected.
- Chromium, Firefox and WebKit are checked; limits of a specific environment are recorded
  explicitly.

## Blockers found (initial audit)

| ID | Defect | Work / evidence |
|---|---|---|
| R-001 | PageEditor had no drag and drop, hover in the indent was lost | fixed; real Chrome gestures, Markdown, undo/redo, both editors |
| R-002 | The JS engine loses the raw text of a code block while editing | fixed; unit/regression on raw text and clipboard |
| R-003 | Moving into a missing parent/descendant can delete the source | atomic JS/Rust validation, DnD guard; targeted tests pass |
| R-004 | WASM uses byte offsets, JS uses UTF-16 | core and WASM work in UTF-16; real WASM/Unicode/undo tests pass |
| R-005 | String content, plain text and clipboard lose content/nesting | recursive copy/cut/paste planners, targeted tests and the full browser clipboard run passed |
| R-006 | Replacing a document keeps the previous document's history | fixed reset/addToHistory; native selective undo keeps the deleted edits |
| R-007 | React useEditorState returns a new snapshot for an object selector | fixed; 4 regression tests |
| R-008 | Async editor creation after destroy in adapters | fixed Vue/Svelte/Solid lifecycle; targeted tests pass |
| R-009 | Some Cloud handlers do not check access to the document; no Go tests | fixed; real PostgreSQL/Valkey, Go race/integration checks, live WS revoke/expiry tests |
| R-010 | PDF/DOCX wrappers call WASM methods that do not exist | real PDF / DOCX and lazy export WASM; after R-034 the own PDF backend, file structure/Unicode and Cloud jobs checked |
| R-011 | npm/cargo release swallows errors; incomplete package list; CI checks a nonexistent .mjs | mandatory reusable CI/browser/security, full bundle graphs, npm archives and Cargo source preflight; after R-034 all source/advisory/license gates pass |
| R-012 | Version history in the example is an alert, some screens lack the full UI | PageEditor history/list/preview/diff/restore, 5 unit tests; Chrome restore→Undo and 10 light/dark layouts pass |
| R-013 | Table/block/formatting menus do not fully react to resize/scroll | fixed anchor/viewport observers, portals and cleanup; three browsers, keyboard/scroll/container resize and themes checked |
| R-014 | Monolithic sources up to 2700 lines, no mandatory architecture rules | AGENTS/SOLID, runtime boundaries/cycles/size gates; the strict release check passes without baseline exceptions |
| R-015 | The new Markdown depends on mdast/micromark, against the chosen self-contained architecture | own TS parser: 94 tests, 652/652 grammar examples matched the previous parser's AST; dependencies removed (44 packages). This is not a claim of full HTML conformance; Rust parity is separate, R-028 |
| R-016 | Cloud accepts any non-empty password; no scope/role checks on some routes | bcrypt, scopes/roles, tenant isolation, quotas and session revalidation; Go race/integration pass |
| R-017 | Cloud export returns JSON posing as PDF/DOCX; AI returns a placeholder success | real PDF/DOCX jobs and streaming providers; local fixture exports and failure/cancel pass |
| R-018 | At 320 px the sidebar leaves main 80 px wide, inner panels are not responsive | fixed mobile navigation, container grids, wrap; the final 130 layout cases passed after removing Wiki and unifying the theme |
| R-019 | IME after fast typing could insert text at the start of the line | fixed pending-caret restore; Chrome 3/3 repeats, the next character and undo checked |
| R-020 | Base CSS shrinks the PageEditor checklist text to 16 px | page styles isolated; Chrome 320 px: line 216 px, checked visually |
| R-021 | The WebSocket provider accepted messages without applying them, the local demo replaced the full JSON | replaced with CRDT transport, ACK/delta/reconnect; 8 unit tests and a real Chrome → Cloud → PostgreSQL replay passed |
| R-022 | The camelCase schema did not fit Rust; auto mode silently fell back to JS | typed schema adapter; real WASM/auto constructors pass, document errors are not masked |
| R-023 | The logger lost Hijacker/Flusher: WebSocket returned 500, SSE did not stream | fixed Cloud middleware, real WS/SSE tests; browser handshake 101 |
| R-024 | Typing/Enter/Delete across blocks did not delete the selected content | shared atomic planners; JS/WASM and the full browser run passed |
| R-025 | React blockRenderer was ignored, node decoration classes were lost on default views | the documented callback/fallback restored; metadata and media classes checked by DOM tests |
| R-026 | The image menu has fake actions/tabs; late uploads and media persistence unfinished | shared media UI, durable upload, crop/alt/preview/resize; 7 media/table scenarios pass in Chrome, Firefox and WebKit |
| R-027 | The local WASM budget of 800 KiB differs from the CI one of 500 KiB | a single measured budget of 600 KiB, Node gzip9 590122 bytes on the final native tree; the previous 512000 was not met. Decision and keeping the sanitizer/API: [ADR](development/wasm-budget.md) |
| R-028 | Native Rust Markdown does not semantically match our own TS parser | own Rust grammar/converter: 652/652 public models, 40 permanent fixtures + bounded stress; native schema and changed-document serializer fixed |
| R-029 | A caption attr update moves the caret to the main document after the first character | reproduced in Chrome, the guard of an independent input in the DOM selection fixed; the regression and a real Unicode/caret browser retest pass in all three browsers |
| R-030 | TableView writes fake _addRow/_addCol, Tab depends on a late selectionchange | shared editTable and shared UI, structural operations/resize with Undo; 3 unit tests and Chrome/Table browser tests pass; fast typing after Tab in Firefox fixed and checked |

## Additional regressions and external limits

| ID | Defect | Work / evidence |
|---|---|---|
| R-031 | After replacing a paragraph with code, the renderer loses the native caret until the next frame | the core restores the expected selection after the DOM commit; fast typing, code scenarios and the shared rerun passed |
| R-032 | Touch long-press showed a drag state without a real move | shared pointer lifecycle, move/drop/edge scroll; 11 real Chrome touch checks of both editors, Undo/cancel/read-only/destroy/container resize |
| R-033 | The task checkbox reacted only to mousedown | the native change handles mouse and Space; 3 browser keyboard/read-only/Undo scenarios passed |
| R-034 | Updated native export dependencies have an incomplete source for publishing | resolved by replacing Typst with our own PDF backend: the Git patch for citationberg and six unsupported transitives removed; the registry-source, advisory and license gates pass without exceptions |
| R-035 | Toolbar metrics could count the code block control labels | fixed; hover/transform checks and the full intermediate run passed |
| R-036 | Nested todos existed in the model but were not rendered | both renderers fixed; 20 native layout/input/checkbox checks in Chrome/Firefox and the cross-browser regression passed |
| R-037 | Async highlighting lost the native caret and could conflict with the IME DOM | snapshot boundary through a pure getDOMSelection, deferred token render; native Chrome IME and Firefox/WebKit range/Unicode/Undo checked |
| R-038 | WebKit sends Shift+Enter as insertParagraph | the shared input planner accounts for the Shift intent; 12 unit + 9 browser regressions passed |
| R-039 | The + button left an empty block after one Undo | block insertion, slash and caret merged into one transaction; hover/history stress passed |
| R-040 | PDF export counted columns by the number of cells in the first row, ignoring colspan | fixed logical grid, rowspan occupancy and explicit positions; PDF 3/3 and DOCX 4/4 regression tests, native/WASM validators and real Cloud jobs passed |
| R-041 | A concurrent edit during IME could lose text and leave a stale DOM | pre-mutation interruption keeps the new document and returns the text/original selection in COMPOSITION_CONFLICT; native Chrome CDP model/DOM/recovery checked. Awareness decorations wait for the IME to end; there is no automatic rebase of overlapping edits |
| R-042 | A deferred highlight update could fire inside the next IME composition | the pending frame is canceled on a new composition; the guard and lifecycle regression passed, regular native IME/highlighting rechecked |

## Checks before closing the goal

- [x] Unit/integration tests of all supported engines and modules, including the regressions found.
- [x] Typecheck/lint/build of the workspace without silencing errors.
- [x] `pnpm check:architecture:release`: no old size overruns and no temporary runtime dependencies.
- [x] Browser functional matrix and a manual visual check of all screens.
- [x] Saving and restoring documents on errors, cancels and concurrent edits.
- [x] Go API: user/organization isolation, CRUD, WebSocket, test dependencies.
- [x] Generic CSP consumer after removing Wiki: build and network-request check.
- [x] Clean consumers of the tarball packages, every exports path and the license file checked.
- [x] Documentation and examples match the real behavior.
- [x] The final report contains tool versions, commands, results, limits and artifacts.

- [x] `pnpm check:cargo-release`: the fixed registry graph without a Git patch.
- [x] `cargo deny check advisories`: no unsupported native dependencies.

## Log

- 2026-11-09: the goal was activated in the current chat; no scheduled automation was created
  (there is no such tool in this session). Work continues under the current goal.
- 2026-11-09: the PageEditor handle fixes were checked; evidence:
  `output/playwright/page-handle-verification.json` and `page-handle-fix.png`.
- 2026-11-09: an independent audit of the core and packaging started; the blockers listed above
  were confirmed against the sources. Checks of the old project do not mean the new UI is ready.

- 2026-11-10: the full targeted wiki Chrome suite 11/11; React renderer/floating/store
  12/12; core on the checked intermediate tree 165/165. This does not replace the final
  run after the next edits.
- 2026-11-10: two real WASM replicas + a local Cloud/PostgreSQL confirmed concurrent offline
  edits, reconnect, durable ACK and a fresh bootstrap from GET.
  `output/cloud-validation/browser-sync-result.json`; secrets are not part of the report.
- 2026-11-10: a single theme source, `packages/theme/src/design-tokens.json`, is used by
  PageEditor, the shared CSS and the JS presets. `pnpm check:theme` checks the generated CSS.
  The React renderer, clipboard, slash, CSS and core orchestration are split by owner;
  the strict check passes with an empty baseline, without size debt.

- 2026-11-10: 65 current layout scenarios (13 routes × 5 widths) passed:
  no horizontal page overflow, the minimum width of the regular editor is
  214 px at a 320 px viewport. This is a geometric check; the final themes/interactions
  and visual acceptance are checked separately.
- 2026-11-10: public validate no longer sends public JSON straight to the Rust
  enum decoder; JS checks the schema instead of an unconditional true. Native Chrome
  cross-block cut → Undo → paste → Undo passes; basic/navigation 11/11.
- 2026-11-10: AI unit/UI 19/19 and browser 21/21 (3 engines): generation,
  cancel/error/retry, proofread/Undo, read-only, ghost completion, narrow width.
  Unverified paid external requests are not part of this result.
- 2026-11-11: GoTipe Atlas (`design/atlas`, 19 frames), a shared language of views, states
  and menus; the code is aligned with the frames. PageEditor moved to the shared views (frame 19):
  the `page` theme is removed, `page.css` loads `base.css` + `theme.css`; the R-020 entry about
  isolating page styles is historical. The SpecOrbit callout “Instructions for the agent” was
  removed from the library.
- 2026-11-12: table row menu, a column of review cards in the margin, subtasks
  (Tab/Shift+Tab, Markdown in TS and Rust). PageEditor shows `en` strings by default.
  Following the owner's remarks on the Atlas: list icons on two lines and a task as a single
  square, the edge of a narrow modern panel fades out (Atlas and playground), the column menu sits
  above the add-row strip. The PDF replacement of 2026-11-10 and the work on the views were merged
  into a single branch, `main`. A run in Firefox and WebKit found one regression (a click next to an
  empty list item in Firefox); fixed.

- 2026-11-12: the public documentation was written (`docs-site/`, 56 pages, English);
  agents checked every name and limit against the code and found about a hundred mismatches, 12 of
  them blockers: markup commands on a selection containing a list, markup attributes, presence
  and the size of updates in collaboration, PDF/DOCX export, migration, configuration
  of a custom server, the commercial license terms. The list is [docs/24](24-documentation-findings.md).

- 2026-11-13: the owner accepted Atlas frames 22–30 (the interface of the new features) without
  remarks. For the site the owner gave a concept from base44: the composition, typography (Inter 500,
  mono captions) and cards are taken from it, the accent stays blue, no purple. Frames
  20–21 are redrawn after it. The UI license model is chosen: free for small teams.

- 2026-11-14: the site and documentation in code: `apps/landing` (Next.js, static export)
  after frames 20–21. Home page: two live editors (Markdown ↔ PageEditor with a count of
  rewritten lines, a view switcher); the numbers and license terms were verified against
  measurements and `LICENSE-COMMERCIAL`. Documentation: 64 `docs-site` pages through our own
  Markdown and `serializeHtml`, highlighting at build time, ⌘K search, “Copy Markdown” and
  `/docs/<slug>.md`, `llms.txt`, a sitemap; 15 live examples load at the edge of the screen, pages
  without an example do not pull them. The Inter and JetBrains Mono fonts are served by the site
  (OFL, downloaded with the owner's consent), Latin subsets are preloaded. `pnpm check:docs-site`
  verifies navigation, front matter, links and examples. Two independent checks (code and looks,
  two rounds) found about 45 defects, all fixed; what needs the library is D-83…D-88
  in [docs/24](24-documentation-findings.md). The caption of the modern view is corrected: there is
  no ready pinned toolbar (D-83). Before deployment set `NEXT_PUBLIC_SITE_URL`
  (without it there are no canonical URLs and the sitemap is empty) and `NEXT_PUBLIC_REPO_URL`;
  the domain is an owner decision.

- 2026-11-14: the owner accepted Atlas frame 31, the pinned toolbar of the modern view: history,
  block type, font and size, markup, alignment and lists, “Insert”, ¶ on the right;
  the active state is shown as a fill, an unavailable control gives its reason in the tooltip; what
  does not fit goes into “More”, a second toolbar under the button. Frame 3 is aligned with it
  (on a phone, “More” instead of sideways scrolling). In code, `FixedToolbar` (D-83): the playground
  and the views demo on the site moved to it, the playground's own toolbar is removed; `AlignPicker`,
  font, size, block type, link and color explain unavailability in a tooltip and stay on the
  keyboard path. The Modern caption on the site and in frame 20 is restored: “A fixed toolbar and
  more room.”.

- 2026-11-14: site findings D-84…D-88 closed (3508ef5): `createId()` instead of a direct
  `crypto.randomUUID()`, `titleLevel`, SVG without a size, tables without widths, soft wrap of
  Markdown in both engines. The site dropped its own workarounds for D-87 and D-88: 69 pages and 254
  tables matched the previous build. Minor findings of the independent check are D-89…D-98 in docs/24.
  Commit 3508ef5 on its own fails the `block-editor` type check (it picked up unfinished
  panel files without `@gotipe/i18n` keys); the next one, 9c86492, fixes it.
- 2026-11-15: the core and Markdown ceiling was raised from 122 880 to 128 000 bytes (125 KiB) at
  the owner's direction. The D-84…D-100 fixes grew the graph from 116 181 to 121 208 bytes, leaving
  1.4% of headroom. The measurements and the growth analysis are in
  [javascript-budgets.md](development/javascript-budgets.md).
- 2026-11-15: the full acceptance of the final tree 98a79e4 passed: Rust, WASM, JS without a cache,
  21 archives and a clean consumer, PDF corpus, Atlas, Cloud with PostgreSQL 17 and the whole browser
  suite in three engines (912/912). Along the way D-125 (Cloud log compression), D-126 (`@gotipe/wasm`
  licenses) and two outdated e2e tests were found and fixed; see the section "Acceptance before
  release".
- 2026-11-15: three sessions of H-level fixes merged (7f4ffd2, 23ba1f6). Closed D-10, D-12,
  D-22, D-23, D-27, D-31, D-71 and D-129, found along the way; partly fixed D-11, D-32, D-44, D-46,
  D-65; new D-127 (H) and D-128 (L). Tree 23ba1f6: types 34/34, linter 21/21, tests 42/42,
  architecture (775 files), theme, docs-site, budgets (core and Markdown 124 231 of 128 000),
  Rust export and fmt, Atlas, site, 21 archives and a clean consumer (now including the WASM engine
  in Node), e2e 918/918 in Chromium, Firefox and WebKit. Go was not rerun: the Cloud code matches the
  branch where 292 tests passed on PostgreSQL 17. The partly fixed findings now also count as open:
  the previous count of L (25) skipped D-47 and D-73.
- 2026-11-15: D-03 closed, the selection of D-07 fixed (bbaa7ad). The JS engine rejects steps
  for a block that does not exist, like Rust, and does not write an empty history step. The final
  selection of a chain follows its steps as a caret. An independent review found one more
  divergence, `deleteText` on a block with `content: null`; it was fixed in the same commit. Core and
  Markdown are 125 200 of 128 000 bytes (+969, headroom 2.2%). Checks: types, linter, tests (core
  826), architecture, budgets, theme, docs-site, Atlas, site; e2e 918/918 in three engines. Two
  failures in the run at load 29 turned out to be load-induced: each test passed 5 times out of 5
  under normal load.
- 2026-11-15: D-08 merged by fast-forward (5c4cf1f): text typed in a row, like text deleted in a
  row, is undone in one step; an IME composition is a separate step; the public API is unchanged.
  Core and Markdown are 125 537 of 128 000 bytes (+337). Tree 5c4cf1f: types, linter, tests,
  architecture, theme, docs-site, budgets, Rust export and fmt, Atlas, e2e 922/922 in three engines.
  The site build came from the turbo cache while `out/` was left over from the previous build
  (D-133). The site was rebuilt without a cache: 69 pages, the transactions page is new. New
  findings: D-130 (H), D-131 (L), D-132 (H),
  D-133 (L).
- 2026-11-15: D-133 fixed. The site build in turbo accounts for `docs-site/` and caches `out/` and
  `public/docs/`. The “site builds” step in the checks no longer passes on a stale build.
  D-134 of the same kind was found: the WASM engine tests in the turbo cache do not see the built
  binary.
- 2026-11-15: D-134 fixed. The built WASM modules are inputs of `@gotipe/wasm#build` and
  `@gotipe/export-wasm#build`, and a new binary invalidates the cache of every task that
  depends on it, including the site build. `pnpm test` passed again after the edit: 38 tasks, 42
  successful.
- 2026-11-15: owner decisions on seven findings were recorded in docs/24 (c7c596e). Three sessions
  merged: D-132 and D-127 (input in lists, rewind up to 64ae9e1), D-33 (1265d00) and D-21, D-24, D-25,
  D-29 (d2ea636). D-139 and D-140, found along the way, were closed too. Two sessions took the same
  numbers D-135 and D-136, so the D-33 findings were renumbered to D-141 and D-142. Tree
  d2ea636: types, linter, tests, architecture, theme, docs-site, budgets (core and Markdown 125 582
  of 128 000, React 32 340, Svelte 676), Rust export and fmt, Atlas, site, 21 archives and a clean
  consumer, e2e 936/936 in three engines. The Atlas frame for D-30 (branch
  `claude/admiring-wing-4c7c3f`) waits for the owner's choice; D-11 together with D-05 is the next
  work in the core.
- 2026-11-15: fast mode at the owner's request. Eight sessions fixed things in parallel, each with
  its own files and only quick checks of its own packages, and the full check ran once after the
  common merge. Branches from 5498998 to 14e0998 were merged:
  - core: D-05, D-11, D-128, D-137, D-15, D-131, D-135, D-136, D-13 (autofocus), D-46;
  - collaboration: D-130, D-82;
  - UI and adapters: D-138, D-141, D-142, D-34 (AI), D-35, D-72, D-47;
  - Markdown: D-109–D-124 and D-160, found along the way;
  - cleanup: D-73, D-74, D-108;
  - docs view per the accepted frame: D-30.

  Conflicts in code (`editor.ts`, `mount.ts` and `transactions.ts`) were merged by hand with the
  edits of both sides, the rest were document lines. The first common check found two breakages:
  - links for the new `@gotipe/ai-ui` dependencies had not been created; `pnpm install
    --offline` helped;
  - `block-editor.tsx` grew to 601 lines; the block panel was extracted into its own hook (56d8195).

  Tree 56d8195: types 34/34, linter, tests 42/42, architecture (778 files), theme, docs-site,
  budgets, 21 archives and a clean consumer, e2e 945/945 in three engines. On tree 14e0998 the Rust
  export and fmt, Atlas, site, `go vet` and `go test` passed. Both WASM builds were rebuilt, the WASM
  core is 302 506 bytes gzip. Core and Markdown are 126 950 of 128 000 bytes: headroom 0.8%.
- 2026-11-15: owner decision: the remainders of D-07, D-32, D-44 and D-65 go after the first
  release; `@gotipe/block-editor-vue` is closed to publishing (e4e9bc3). The second fast round, five
  sessions, merged from 5e3bc33 to 8963766:
  - core: D-143, D-175, D-180, D-13, D-173;
  - Markdown: D-155, D-156, D-157, D-161 and D-190, found along the way;
  - AI and i18n: D-34, D-181;
  - theme, Atlas and documents: D-172, D-150, D-174, the frame for D-165;
  - build: D-166 (a single `GoTipeError` in CJS too), D-167 (a check for comments inside
    expressions), D-170, D-171 (the WASM limit is 325 KiB), D-173.

  After the merge the D-167 check caught five new comments inside expressions; they were moved
  (8f99760). Tree 8f99760: all checks, 20 archives and a clean consumer, Rust, Atlas, site,
  `go vet` and `go test`, e2e 945/945 in three engines. Core and Markdown are 127 296 of 128 000.
- 2026-11-16: owner decisions on D-165, D-185, D-186, D-67 (62c0acb) and the third fast round,
  five sessions, merged from 782b67e to 4f844ee:
  - core: D-185 (`validate` and `renderTo*` take only a document object), D-186 (the host decides
    the link `target`);
  - Markdown: D-191, D-192;
  - UI strings: D-195, D-196, D-197 and the `aiStatusChange` type in the core (D-221);
  - theme and Atlas: D-165 per the accepted frame 17, D-200, D-201;
  - Cloud: D-67 (the domain from `infra/.env`, no link to PGP; the SDK and OpenAPI caught up with the
    server).

  Tree 2328440: all checks, 20 archives and a clean consumer, Rust, Atlas, site, `go vet` and
  `go test`, e2e 945/945 in three engines. The Cloud branch was merged after that (4f844ee) and
  checked for what it touches: types, linter, tests, docs-site, budgets, archives, consumer and Go.
  Core and Markdown are 127 018 of 128 000. The Cloud session found two H-level bugs: an
  administrator can delete the organization owner (D-230), and the idempotency key remembers
  too much (D-231).
- 2026-11-16: the fourth fast round, three sessions, merged from 7b4519f to 03f5996:
  - Cloud: D-230 (the organization owner cannot be deleted), D-231 (the idempotency key stores only
    a completed result), D-234 (Stripe webhook); D-232 and D-233 partly;
  - UI: D-210, D-220, D-225; the IME check after an atom (D-226) found the caret bug D-240,
    which is fixed;
  - Markdown: D-215, D-216.

  Tree 03f5996: all checks, 20 archives and a clean consumer, Rust, Atlas, site, `go vet` and
  `go test`. E2E: Chromium 965/965, Firefox and WebKit 949 without errors; 16 new IME checks
  through CDP run only in Chrome. Core and Markdown are 127 309 of 128 000. Minor findings left
  open: D-232 (on a database failure, `401`/`404` instead of `503`), D-235 (the idempotency key
  stores an AI provider failure), D-245 (a lazy table header row with an indent).
- 2026-11-16: the last minor findings merged (34d90ca, ad30c45): on a database failure Cloud answers
  `503` (D-232); the idempotency key does not remember `5xx` responses (D-235); a lazy table header
  row with an indent works as in GFM (D-245). Tree ad30c45: types, linter, tests, architecture,
  docs-site, budgets, Rust export and fmt, 20 archives and a consumer, `go vet` and `go test`, e2e
  Chromium 965/965, Firefox and WebKit 949 without errors (16 IME checks are Chrome only). The site
  was not rebuilt: the owner had its dev server open. New minor findings are D-250, D-251, D-255.
  Deployment is through the owner's Dokploy on gotipe.com (Cloudflare), autodeploy from main.
- 2026-11-16: the site after the owner's sample, zydeo-web, a project from v0. An audit of the home
  page and the documentation at 375–1920 in both themes found defects D-280…D-289
  ([docs/24](24-documentation-findings.md)), among them both of the owner's examples: the backdrop of
  the first screen is pressed to the top and the header mark sits higher than the links. Atlas frames
  20–21 were redrawn (a5c449f) and the site was built from them (3549d61): one spacing scale
  `--site-space-*`, a live Markdown ↔ document window on the first screen, facts with a count-up,
  a stack with rays, a bento with live pictures, a view switcher, examples in tabs; the motion is
  CSS and one IntersectionObserver, no new packages, and it is off under reduced motion. The numbers
  were verified against tree 6387214. Waiting for owner decisions: frames 20–21 (looks), site
  headings in Inter 600 instead of 500, a blue dark theme of the site (the editor surfaces on the
  site go through `--gt-*`).
  Following the owner's remarks, the header smoothly shrinks to a column on scroll, and the grid of
  the first screen is removed. The owner rejected the waves and the Markdown lens; of three live
  backgrounds (clouds, liquid glass, halftone) the owner chose liquid glass: a WebGL shader, the
  cursor is its own drop (0fbf888, ed15dbd). The quiet header links over the scene glow were
  strengthened from 3.5:1 to 5.2:1 and above (D-281). Then the owner asked for a cosmic, blurred
  and unobtrusive background: of three live ones (nebula, orbits, horizon) the owner chose the
  nebula: soft blue gas at the sides of the first screen and rare stars, the cursor lights up and
  swirls the gas. Under the subtitle the contrast is at least 4.7:1 in both themes.
  Then the huly.io level (dbc879e, e796438): buttons with a light that follows the cursor and
  stays in place, and a second button catches it; lit headings; the theme on one button;
  the editor UI under the nebula, which the cursor lifts; a coauthor in a section heading;
  a night bento with light in the gaps; drawn marks for the nine parts; a final strip with the
  “engine”.
  Then (4ccb656, 784b761): the stack is a panel with comets along the rays; in the finale, instead of
  a clock, a document assembled on the engine from glass plates; in the live window, the “+” and
  the block handle moved into the margin left of the text, and Markdown is editable from both
  sides. Following the owner's remarks, the stack, bento and finale follow the theme (light glass
  by day), the buttons by day are an ink pill and a white pill without halos, the header glass
  shrinks exactly to the column, and the tiles, pillars and ways to start have drawn marks. The
  logo is the owner's stingray: header, footer, the stack engine, favicon.
  Then a performance audit (ae8f829, 5a29e11): with the CPU throttled 4× the main thread was
  overloaded by the light along the edge of the window and the engine (a repaint every frame), the
  light under the cursor (inherited variables and a mask), comets on offset-path, caret blinking
  through background-color and a shader at 60 frames. All of this was moved to the compositor
  (transforms, Web Animations), the nebula at idle draws 30 frames and lowers its resolution on a slow
  machine, and the editor loads after the first screen. The look did not change (verified pixel by
  pixel); main-thread load: first screen 26→17%, stack 45→26%, bento under the cursor 79→51%,
  scroll 49→40%, frame p95 during scroll 33→17 ms.
  Following the owner's remarks from a phone (fb9aced, 5a45303): on 320–359 px screens the install
  row pushed the first-screen column apart and the text ran out of the frame; the column is now no
  wider than the text, the chip is one size smaller and has no arrow; the finale plates were cut off
  by the edge of the strip, so their depth became a fraction of the scene width; the stack comets
  fell through the “Your infrastructure” caption, which now sits under its blocks on a phone.
  Checked at 320–414 px, the desktop is unchanged.
- 2026-11-17: the editor interface geometry audit. The owner saw the block handle on a task
  checkbox; `e2e/editor-visual-audit.spec.ts` (described in `docs/development/testing.md`) walks
  Page, Block and the Views playground in four views, two themes and at five widths. Before the fix
  in Chrome there were 802 violations in 96 of 120 configurations, after it 0 of 4756 cases; a sample
  of six configurations in Firefox and WebKit is also without violations. D-260…D-264 and D-266…D-269
  are fixed ([docs/24](24-documentation-findings.md)); D-265 (columns on a phone) and Atlas frame 32
  wait for an owner decision. The audit branch was cut before the history rewrite, so its five
  commits were not merged but carried over onto main; the link 8b5134e in docs/24 was replaced with
  675c482. Tree 220047d with the audit was checked in full: typecheck, lint, tests, architecture,
  theme, docs-site, budgets (core with Markdown 127 296 of 128 000), Rust export and fmt, Atlas, site
  build, 20 archives and a consumer, WASM 302 506 of 332 800, `go vet` and `go test`; e2e: Chromium
  1085/1085 (965 previous and 120 geometry configurations), Firefox 955 and WebKit 954 (130 skipped
  in each: IME is Chrome only, and configurations outside the sample). In WebKit NL-174 failed once
  in setup because the global page editor had not been set yet; a repeat 10/10 and the whole file
  50/50 passed. By the owner's decision the audit went into 0.1.0: the release in progress was
  stopped before publishing, the audit was put on top of 867fa6f (between the trees there are only
  crates, Go and release scripts); the tag v0.1.0 moves after the history is migrated.
- 2026-11-17: the editor pieces beneath the hero nebula show from 1024px wide. Below 1280px they had
  been switched off since they came in, which hid them in laptop windows and in the app's browser
  pane; the site and the Atlas tokens changed together, checked in a browser at 1024, 1126 and 1279px.
- 2026-11-17: English pass before the first public release. Docs, the Atlas, comments, test titles,
  the playground samples and the e2e specs that read them are in English; the playground opens in
  English with Russian one click away. Russian stays in the editor's `ru` locale, Russian emoji
  names and test data that covers Cyrillic, IME, case folding and non-ASCII URLs. The history of
  `main` was rewritten with English messages and without `Co-Authored-By` trailers (every tree is
  unchanged) and the commit links in the docs were remapped. Open: in Firefox
  `e2e/comments.spec.ts:68` loses the comment's anchor after text is typed before the quote (red on
  867fa6f too), so E2E and the release stay red in Firefox until it is fixed.
- 2026-11-17: the Firefox failure of `e2e/comments.spec.ts:68` is a comments defect, fixed as D-290
  ([docs/24](24-documentation-findings.md)). A comment was found again only by its quote with
  eight characters of context on each side, and a quote that opens a block takes that context
  from the previous block, so text typed next to the quote orphaned it. Only Firefox typed there:
  the spec clicked the line boundary of the wrapped paragraph, and Chrome put the caret on the
  second line, after the quote. A comment now follows every edit that leaves its quote whole and
  takes its context again; the spec clicks into the quote first, so the prefix goes before it in
  every browser. Checked on this branch: comments unit tests 13 (three fail on the old code),
  suggestions 47, the block editor's comment tests, typecheck, lint, `check:architecture`; in
  Chrome `comments.spec.ts` 4/4 five times (on the old build the new spec fails exactly as
  in Firefox), accessibility and page editor 43/43. Firefox and WebKit were not run locally
  (Playwright's browsers are not installed); the next CI run confirms them.
- 2026-11-17: the first v0.1.0 release run passed CI, E2E in Chromium, Firefox and WebKit and
  the Rust and Go audits, but stopped before publishing at the npm audit: GHSA-fc5q-39xc-vjpf in
  `picomatch` was widened that day to the latest version, which has no fix. Only build and test
  tools reach it, so it is ignored by name with the reasons in the dependency policy, and the
  tag moved to that commit.
- 2026-11-17: v0.1.0 is on npm (20 packages), crates.io (9 crates) and GitHub Releases. 0.1.1 adds
  a README to the 17 packages whose npm pages had none, with an install line, an example checked
  against the built types and links to the docs, plus a description and keywords for every
  package; the code is the same. The 119 changesets released in 0.1.0 are removed. The docs
  install lines of the ready UI gain the required `@gotipe/versions`, and the i18n example merges
  the block-editor dictionaries whose keys it shows.
- 2026-11-18: 0.1.2 prepared from a host's list of needs (the owner asked to fix in GoTipe what
  hosts had to work around, and to publish). Nine packages go to 0.1.2: `core`, `markdown`,
  `react`, `vue`, `i18n`, `suggestions`, `comments`, `theme` and `block-editor`; the others stay
  at 0.1.1. Every change is a patch: the packages reference each other through `^0.1.x` peer
  ranges, which a minor bump in 0.x would leave, making changesets bump their dependents to
  1.0.0. Typing on a 7,400-block page went from about 415 ms to about 30 ms a key; the comment
  card can delete; `PageEditor` gains `flush`, `setMarkdown`, `icon`/`header`, `slashMenu`,
  `reviewLayout`, `narrow`, `media` and `undoableReplace`; `EditorHost.discardAsset`; part
  tokens; shared table columns; fixes listed in the site's changelog. Two new Atlas drawings (the
  comment card's delete, slash rows with descriptions) wait for the owner's acceptance. The JS
  budgets of the core graph and the Vue increment were raised with the measured reasons
  ([javascript-budgets.md](development/javascript-budgets.md)).
  Accepted on tree 8afd44f (macOS, M4 Max): WASM and export WASM builds, `pnpm build`,
  `check:architecture` and `:release`, `check:theme`, typecheck, lint, `pnpm test` (core 1,108,
  markdown 548, block-editor 198, react 103, the rest green), `check:bundles`, `check:packages`,
  `check:consumer`, `check:exports`, `check:docs-site`, `cargo fmt`, clippy and `cargo test`
  (365); Playwright: Chromium 1,085 passed; Firefox 953 and WebKit 954 passed, 130 skipped each.
  The comment-anchor test (`comments.spec.ts:68`) fails in Firefox and WebKit on macOS on this
  tree and on 0.1.1 (5cea501e) alike: there Home does not move the caret to the line start; CI
  runs on Linux. One Firefox checkbox test failed once under load and passed 3 of 3 alone. Not
  run here: the PDF regression and Go Cloud tests (no change in those areas).
- 2026-11-18: 0.1.3 prepared from the host's next list, with the owner's decisions of the day:
  one undo step for a group of changes (`editor.batch`) now, the compact media row, the caption
  hint (not written to the file) and the glyph in the title row as host options with Atlas frames
  (10 and 1). Released: `core`, `react`, `i18n`, `theme`, `block-editor` at 0.1.3 and `wasm` at
  0.1.2; the others keep their versions and published peer ranges. The Atlas audit holds a caption
  hint to the 3:1 contrast of other quiet labels. Accepted on tree 1435a02 (macOS, M4 Max): WASM
  builds, `pnpm build`, `check:architecture` and `:release`, `check:theme`, typecheck, lint,
  `pnpm test` (core 1,125, markdown 548, block-editor 209, react 106, the rest green),
  `check:bundles` (core graph 130,173 of 131,072), `check:packages`, `check:consumer`,
  `check:exports`, `check:docs-site`, `cargo fmt`, clippy, `cargo test`; Playwright Chromium
  1,084 of 1,085, Firefox and WebKit 952 of 955 before the review fixes and the fixed tests 3 of 3
  after. Left: `comments.spec.ts:68` (macOS Home, as on 0.1.1) and REL-001, 50 slash transforms
  in 18–21 s alone on 0.1.2 and 0.1.3 alike, which under the full parallel run comes near its
  30 s limit.
- 2026-11-19: 0.1.4 prepared from the host's list after 0.1.3: `discardAsset` on every path a
  stored file is not inserted, an accessible inline page icon, the owner's host options
  `reviewCardPlacement` and `reviewLaneCursor` (Atlas frame 14), and tokens. Released: `core`,
  `react`, `theme`, `block-editor` at 0.1.4. Accepted on tree 0c0f926 plus a jsdom stub in one
  test (cfb0aa9): WASM builds, build, architecture and `:release`, theme, typecheck, lint, `pnpm
  test` (core 1,143, block-editor 216, react 112, theme 31, the rest green), `check:bundles` (core
  graph 130,424 of 131,072), packages, consumer, exports, docs site, `cargo fmt`, clippy, `cargo
  test`; Playwright Chromium 1,085 of 1,085, Firefox and WebKit 954 of 955 (only
  `comments.spec.ts:68`, macOS Home, as on 0.1.1).
- 2026-11-19–20: 0.1.5 prepared from the host's list after 0.1.4, checked by the host on local packs
  before one release (on the last, pack 18, the host had no needs left): review card placement
  and gap, `afterBlock`, selection ranges and bookmarks in the Markdown, the host's lane pointer,
  proposals still being written (`live`) and several cursors of a lane, a suggested table that
  stays a table, the room under an editable table, and tokens. Status: accepted, not released.
  The release is to hold `core`, `react`, `theme`, `block-editor` at 0.1.5 and `markdown`,
  `suggestions`, `comments` at 0.1.3. `ai` and `ai-ui` keep 0.1.1: the fix of Tab in a widget
  (`d4ebae95`) has no version bump and waits for the next release. The final tree c80e5d7e was
  accepted on 2026-11-20, 11:27–12:07 (macOS, M4 Max, `output/accept18/`, run by
  `output/accept18.sh` with the heavy-run lock taken part by part; nothing uncommitted and the
  tree unchanged from start to end): build, `check:architecture` and `:release` (808 files, no
  debt), `check:theme`, typecheck, lint, `pnpm test` (42 tasks, 33 from the Turbo cache, their
  inputs unchanged; suggestions 70, theme 44, react 123, block-editor 284, core 1,143 with 2
  skipped, markdown 549, comments 13, the rest green), `check:bundles` (core graph 130,519 of
  131,072; react 34,086 of 40,960; 143 known comments in expressions), `check:packages` (20
  archives), `check:consumer` (30 ESM / 28 CJS entries), `check:exports`, `check:docs-site` (65
  pages), the Atlas (220 frames); Playwright Chromium 1,107 of 1,107, Firefox 977 with 130
  skipped (the full visual sweep runs in Chrome only), WebKit 976 with 130 skipped and one failure
  under the machine's load (load average about 19): NL-058 of
  `notion-like-checklist-051-100.spec.ts` failed in the shared setup of that series, where
  `setNotionContent` (`e2e/helpers/notion-checklist.ts`) found no editor handle yet. On the same
  tree that file alone, 3 times, passed 150 of 150, and the full WebKit run again passed 977 with
  130 skipped. Not run: the WASM builds, `cargo fmt`, clippy and `cargo test` (Rust and its lock
  unchanged since 0.1.4), the PDF regression and Go Cloud tests. Earlier trees of the release,
  each accepted in full the same day and followed by the host's next needs: ff3c05bc (`accept13`;
  Chromium 1,096, Firefox and WebKit 966), e9e1046d (`accept14`; 1,097 and 967), c0e1b6a8
  (`accept15`; 1,101 and 971) and 40b5d170 (`accept17`; Chromium 1,105, Firefox 975, WebKit 974
  and one failure under load, `docs-view.spec.ts:174`, which passed 48 of 48 alone and 975 in the
  full run). The cause of that one was the test: the mouse it left over the page, which WebKit
  moved after a scroll and so took the handle from a touch; c80e5d7e opens the view from the
  keyboard, and the file passed 160 of 160 in WebKit 20 times under load. `accept16` (0e1de1cd)
  does not count: the tree changed while it ran.

## Acceptance before release (2026-11-15)

The final `main` tree 98a79e4: everything done after the acceptance of 2026-11-12: the blockers and
the docs/24 findings up to D-107, Atlas frames 22–31. The heavy checks ran one at a time, the logs are in
`output/acceptance-20261115/`. Rust, WASM, JS, packages and the Atlas were checked on aff69b2; the next
commits change only license notices, Cloud and e2e, and their checks were repeated on the final
tree. The acceptance found three failures, each fixed in it:

- D-126 (ddbdf94): `collect-rust-licenses.py --check` failed: after D-73 the `@gotipe/wasm` archive
  carried notices for 57 crates that are not in the module. Rebuilt from `Cargo.lock`: 32 crates,
  the archive went from 159 to 71 files; the archives and the clean consumer were rechecked.
- D-125 (383137b): the log compression integration test on PostgreSQL, run for the first time, caught
  a `CompactLog` success for a replaced generation below the thresholds. The generation is now
  checked first.
- 98a79e4: two e2e tests failed the same way in all engines: they expected the behavior from before
  D-14 (plain text is an empty language) and D-20 (a comment highlight carries `data-comment-id`).
  The expectations were updated to the intended behavior.

Results:

- Rust: fmt, strict Clippy all-targets/all-features, `cargo test --locked --workspace
  --all-features` — 352/352 in 40 suites with none ignored; `check:cargo-release`; the Rust and Cloud
  notices verified.
- WASM rebuilt: core 821 303 bytes, 300 804 gzip against a budget of 614 400; export WASM and
  `gotipe-convert` built.
- JS without the Turbo cache (`--force --concurrency=2`): typecheck 34/34, lint 21/21, tests 42/42
  tasks (Vitest: 1 579 tests, 19 runs); build 21/21 from the cache, the inputs did not change after
  the WASM rebuild. Architecture: 769 files, release without debt; theme; the documentation site: 65
  pages, 15 demos.
- JS graphs: core and Markdown 124 045 / 128 000, React 32 184 / 40 960, Vue 8 160 / 8 192 (32 bytes of
  headroom), collaboration 10 364 / 12 288, AI 7 529 / 12 288.
- Packages: 21 archives; a clean consumer from the real archives: 31 ESM / 29 CJS, types, SSR,
  Markdown, PDF and DOCX; `check:exports`: PDF 25 681 and DOCX 3 125 bytes through the public API.
  PDF corpus native/WASM: 58/58, the validator (Poppler, pypdf) without errors; all 18 documents with
  output match byte for byte, 11 are expected refusals in both engines.
- Atlas: 21 rule tests and 170 frames in both themes; D-108 is printed as a known finding.
- Cloud: Go 1.26.10, `go vet` with the integration tag and without; `go test -p 2 -tags integration ./...
  -race -count=1` on an isolated PostgreSQL 17.10 in Docker: 285 tests in 11 packages, no races,
  the temporary databases deleted.
- Browsers: Playwright 1.65, the whole suite on a fresh Vite server, engines one at a time: Chromium
  (Chrome channel 157), Firefox 159 and WebKit (Playwright build 2388): 912/912 each, without retries.

Not covered: the Docker smoke of the Cloud image, because the base images `rust:1.93-bookworm`,
`golang:1.26.10-bookworm` and `debian:bookworm-slim` are not downloaded locally; publishing the
packages and deployment are owner decisions.

## History of the dependency gate before replacing Typst (2026-11-10)

- Fresh npm audit, cargo-audit and Go govulncheck find no vulnerabilities after the
  updates. Go vet, unit/race and an isolated PostgreSQL/Valkey integration/race
  passed on Go 1.26.10; this does not replace the final Docker smoke.
- `cargo deny check licenses` passes. `cargo deny check advisories` stays
  red: six unmaintained transitive dependencies of the current Typst.
  No ignores were added; the exact chain and the decision are described in the
  [dependency policy](development/dependencies.md#native-and-cloud-security-boundary).
- The fixed quick-xml requires an upstream Git patch for citationberg that is not yet
  published to crates.io. `pnpm check:cargo-release` deliberately forbids
  publishing until the fixed registry graph is available, before any npm/crate
  publish steps. The source Cargo release cannot be called ready.
- Our own OOXML renderer and Typst 0.15.1 require a new full run of the
  native/browser PDF/DOCX validators and the Cloud image; the old export receipts
  belong to the previous compiler graph.
- 2026-11-10: the landing page uses shared tokens and was checked on 10 light/dark layouts;
  the fake pricing, SLA and unverified comparison metrics were removed. Typecheck/lint
  pass; the final workspace build is still to come.
- 2026-11-10: the production wiki under the SpecOrbit CSP loaded only its own
  HTML/JS/CSS; no CSP violations, page errors, external requests or WASM.
  Unicode/Undo, keyboard checkbox, read-only and 320 px checked. To be repeated on
  the final tree; the procedure is in the [CSP contract](development/csp.md).

- 2026-11-10: a full Chrome run of 875 scenarios: 845 passed, 30 failed.
  Found: a separate Undo entry for the + button, invisible nested todo rows, and
  a delay in positioning the AI ghost after resize; the fixes and the rerun continue.
  Some old fixtures violated the raw-code schema, expected a whole list instead of a row,
  or changed the theme attribute without applying the tokens; the checks are being updated to the
  public contract without removing scenarios. This is an intermediate run, not a release acceptance.
- 2026-11-10: the optional highlight contract was checked with seven unit scenarios, including
  real Shiki grammars, a retry after a failure, Unicode/newline integrity and a stale async result.
  The highlighter must not replace the editable DOM with incomplete text.

## Local acceptance before replacing the PDF backend (2026-11-10)

- Workspace build/typecheck/lint: 21/21; lint has 24 advisory ARIA/semantic-elements
  warnings, no errors. Keyboard and focus checks are done separately.
- Vitest: 524/524; native Rust: 228 tests, fmt and strict Clippy passed.
- Architecture: 539 production files, an empty size baseline, 8 JS graph budgets
  met. Core WASM: 590122 bytes gzip9 against a limit of 614400.
- A clean install of 21 tarballs: 27 ESM, 25 CJS, TypeScript without skipLibCheck,
  real HTML/Markdown/PDF/DOCX consumers; the ZIP/XML/Unicode/media validators passed.
- Generic CSP consumer: its own HTML/JS/CSS, no WASM/external requests/CSP
  violations; Unicode/Undo, task keyboard, read-only and 10 layouts passed.
- The intermediate full run had 2625/2628 scenarios passing. The causes of the three
  caret fixture failures were confirmed and fixed; the result of the final rerun is below.
- Final rerun: **2634/2634** (878 × Chromium/Firefox/WebKit), 17.8 minutes.
  The sources did not change: tree SHA256
  `33a36edae716dacc0b54856e30223a795a13d2da54cbc685d2d57f2c288f5d7b`, runtime/build SHA256
  `b077d5a5c2fe05044fcb4489fdecd1cbef51f1a31c08615261c3f584edc3408e`.
  Later updates of this report do not change the runtime. The source/package receipts
  let you verify specific files and archives.
- On the final shared example, gutter hover, the six-dot menu, native block/list drag,
  Markdown reorder, exact Undo, Redo, read-only and hover after decoration updates passed
  separately. No new Wiki shell was created elsewhere.
- Native Chrome CDP confirmed that a concurrent edit and the DOM are kept, the visible recovery
  text on COMPOSITION_CONFLICT, and the deferred publication of awareness decorations without
  interrupting IME. A document conflict returns the input to the host; an automatic rebase
  of overlapping edits and its seamless merge are not claimed by this result.
- npm audit, cargo-audit and govulncheck: no vulnerabilities found. This does not lift the
  two open source-release gates of R-034. A recheck of the official
  upstream/registry sources on November 10 confirmed there is no fixed release.

Detailed commands, versions and receipts are in the ignored `output/release-gates-final.json`,
`output/release-tree-before.json`, `output/release-package-artifacts.json`,
`output/manual-browser-acceptance-final.json`, `output/release-browser-final.log`,
`output/native-pdf-refresh-result.json` and `output/upstream-gate-refresh/result.json`.
Remote CI, integration into the real SpecOrbit renderer, external paid AI requests
and publishing were not performed. Format limits stay in export-contract.md.


## Merge into main: acceptance of the final tree (2026-11-12)

The branch `codex/release-readiness` with the PDF replacement and the Atlas work was merged into `main`
by fast-forward; there are no other branches. The checks ran on the final tree, the heavy ones one at a time:

- Rust: fmt, strict Clippy all-targets/all-features, 250/250 tests with none ignored;
  notices 149 + 167 and the export font bytes verified; the Cargo registry sources are publishable.
- WASM rebuilt: core 1 497 834 bytes, 589 986 gzip against a budget of 614 400;
  export 14 420 356 bytes.
- JS: build 21/21, typecheck 34/34, lint without errors (27 Biome a11y hints, was 24),
  architecture 573 files (release without debt), theme, Vitest 545/545
  in 18 packages (the code highlighting test failed under load; fixed); 21 archives and a clean consumer (27 ESM / 25 CJS); real PDF/DOCX
  through the public API; PDF corpus native/WASM 52/52 (13 files match byte for byte,
  13 expected refusals). `check:bundles` failed on the React layer: 36 441 bytes against a ceiling of
  30 720, growth from the Atlas frames; the ceiling was raised to 40 960 by a decision with measurements
  in [javascript-budgets.md](development/javascript-budgets.md).
- Browser, full runs under external load on the machine (load average 30–60 on 14 cores):
  - Chromium (Chrome channel): 900/905; 5 timeouts (4 times the editor did not appear within 5 s after
    load, the REL-001 stress did not fit in 30 s), both files 53/53 on a rerun;
  - WebKit 27.2 (4 workers): 900/905; 5 timeouts (3 page loads at the very start,
    2 DEF-007 stresses), three files 33/33 on a rerun;
  - Firefox 159 (3 workers): 901/905; 3 stress timeouts (DEF-007 ×2, REL-001) and NL-037, a
    real regression from the Atlas frames: the marker dot (`li::before`, absolute) caught a click
    next to an empty item, and Firefox put the caret in the neighboring block. The dot is now
    `pointer-events: none`, like the placeholder; after the fix the files that failed in Firefox pass 58/58,
    lists, caret and PageEditor in Chromium and WebKit 242/242. A full run of the three engines
    was not repeated after this one-line fix.
  The Playwright browsers were downloaded with the owner's consent. Atlas: 100 frames, the static
  rules and the browser audit passed. Logs are in `output/merge-acceptance-20261112/`.
- Go: `go vet`, notices 50 files. The Cloud integration tests with PostgreSQL/Valkey were not
  run this time: the `apps/cloud` code did not change in the merge.

## Own PDF backend: final acceptance (2026-11-10)

At the owner's direct request Typst was replaced with GoTipe's own layout on top of
supported PDF/font codecs. The public APIs, the optional/lazy boundary, HTML/Markdown
and DOCX are kept. The dependency graph of the Cargo workspace shrank from 402 to 230 packages; Typst,
citationberg, the Git patch and six unsupported transitive dependencies are removed.
R-034 is closed: source-release, cargo-audit, cargo-deny advisories/licenses pass
without adding exceptions. The current dependency is described in the dependency policy,
not in the old design proposals from the numbered docs.

The checks of the new PDF include marks/colors/code, tables with colspan/rowspan and very
long cells, an independent column flow, images/captions, lists, A4/Letter/Legal,
margins and headers/footers, bookmarks, a connected tagged structure/Alt/OBJR/ParentTree and XMP.
Cyrillic, RTL, diacritics, ligatures, emoji/ZWJ/VS16 and separate word boundaries
for selection/search were checked. Unknown blocks/marks, invalid structures and characters
without an embedded font give an explicit error. Unsupported content is not dropped.

- Rust: 249/249, no skipped/ignored; fmt and strict all-target/all-feature Clippy.
- Native corpus: 26/26; public native/WASM: 52/52.
- PDF browser corpus: 78/78 in Chromium/Firefox/WebKit; 39 successful files match
  Node/WASM byte for byte, 39 negative scenarios return the expected errors.
- Cloud: a new local non-root image, readiness and 10 migrations twice;
  basic PDF/DOCX/merged-table jobs 3/3, corpus 19/19 (9 successes + 10 expected
  refusals). All 9 PDFs match native and Node/WASM byte for byte. The Cloud API uses
  default PDF options; page/header-footer options were checked on the Rust/WASM API.
- Workspace: 524/524 Vitest, build/typecheck/lint, architecture release, theme,
  JS import budgets and the independent PDF/DOCX validators passed. Lint keeps
  the previous 24 advisory warnings; no new errors.
- A clean consumer of 21 real archives was packed and installed: 27 ESM, 25 CJS,
  strict TypeScript declarations, headless/Markdown/PDF/DOCX checks passed.
- Core WASM is byte-identical to before: 590122 bytes gzip9. Optional export WASM:
  14420356 bytes raw / 8566476 gzip9 instead of 35456393 / 15796750.
- The shared final browser suite: runs on the frozen runtime/build
  SHA256 `ea3b73d4901dd5d2c63db4e9d82ce5ca28d6861065f7c9495ae33c328265de5f`.

The first shared browser run exposed 8 caret setup failures in old tests:
TreeWalker picked the text of the Copy button next to an empty code block, so the input did not reach
the document. Two test helpers were fixed: the public setSelection/focus and waiting for the
model/native selection to match. The Enter/Escape/transform checks themselves
are kept. Two more old test files use baseURL instead of a hard-coded port,
so that the final acceptance can run on a separate fresh Vite server.
The mixed create/change/delete scenario runs 18 sequences of actions.
The next run showed that its shared default budget of 30 s was exhausted under heavy
parallel load; the content assertions did not fail. The result is saved in
`output/owned-pdf-release/browser-stress-timeout/` (763 passed, 1 timeout,
2 interrupted). A shared budget of 90 s was set for this functional stress, like the other long
scenarios; the per-assertion timeouts and all 18 sequences are kept.
A repeat3 check with two workers: Chromium/WebKit 6/6, Firefox 3 deadline failures
under the same external load. The first serial rerun gave 2/3, so the result was not accepted. After the
external fidelity runner finished, Firefox passed 3/3 with the same 90 s limit
(44.3/45.9/48.0 s); the final suite runs with Firefox workers=1
and Chromium/WebKit workers=2, without automatic retries.
Production JS/Rust and the built packages did not change with these edits. The original errors
and the stopped run (1092 passed, 8 failed, 2 interrupted) are saved in
`output/owned-pdf-release/browser-initial-failure/`; the repeated acceptance below replaces
them as the result of the final tree.

The independent validators read the created PDFs, not the renderer's internal structures.
11 rasterized pages were reviewed; checked for absence of clipping/overlaps,
correct filling of the first page of a long table and preservation of the look
after the selection boundary fixes. PDF/UA and PDF/A certification is not claimed;
the other format limits are listed in export-contract.md.

Commands, checksums of sources/fonts/WASM/archives and results:
`output/owned-pdf-release/`, `output/pdf-migration-visual/receipt.json`,
`output/pdf-native-acceptance/validation.json`, `output/pdf-regression/validation.json`,
`output/pdf-browser-final.log`, `output/pdf-migration-rust-tests.log`,
`output/pdf-migration-rust-clippy.log`, `output/pdf-migration-workspace-tests.log`,
`output/pdf-migration-browser-full.log`. The intermediate results are saved separately
and do not replace the acceptance of the last tree. This is a local acceptance; external publishing
and remote CI were not run within this task.
