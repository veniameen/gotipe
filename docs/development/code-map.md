# Code and boundary map

| Area | Owner | Contract |
|---|---|---|
| Document/transactions | `crates/gotipe-core`, `gotipe-schema` | blocks, marks, UTF-16 offsets, atomicity |
| JS and DOM input | `packages/core/src` | createEditor, extensions, selection/history/clipboard |
| WASM | `crates/gotipe-wasm`, `packages/wasm`, core/wasm-bridge | the same contract, explicit loading; in Node the `node` condition (`packages/wasm/node.js`) reads the binary from the package |
| Markdown | `packages/markdown/src` | parser/serializer/source-map, untouched bytes |
| Sync | `crates/gotipe-crdt`, `packages/collaboration` | convergence, transport, awareness |
| Adapters | `packages/react`, `vue`, `svelte`, `solid` | render/subscription/lifecycle, one document; a creation failure surfaces as `error` and `onError` in all four (React, Vue, and Solid also have `useEditorStatus`), Svelte creates only in the browser |
| UI | `packages/block-editor`, `block-editor-vue`, `ai-ui` | views/commands through the public core |
| Theme | `packages/theme/src/design-tokens.json`, generated CSS and presets | a single source of tokens; scoped theme lifecycle |
| Review/versions | `packages/comments`, `suggestions`, `versions` | IDs, anchors, apply/reject/restore |
| AI | `packages/ai`, `crates/gotipe-ai` | provider, stream/cancel/error, edits |
| Export/migration | `packages/export`, `migration`, `crates/gotipe-export` | valid formats, explicit limitations |
| HTTP SDK | `packages/sdk` | Cloud client without UI |
| Cloud | `apps/cloud/internal` | auth/storage/sync/workers, permissions before access |
| Examples | `apps/playground/src` | composition roots of the public APIs |
| Checks | `scripts/quality`, `.github/workflows` | architecture/build/test/packaging |
| Coding agents | `.agents/skills/gotipe`, `.agents/.claude-plugin`, `.claude-plugin/marketplace.json`, `context7.json` | the skill users' agents load to integrate GoTipe, its Claude Code marketplace, and what Context7 indexes (`docs-site`, package READMEs); not rules for working on this repository |

Direction: applications → UI/adapters/features → core → WASM.
Markdown and the SDK are self-contained. The core uses its own `@gotipe/markdown`
for identical serialization in JS/WASM and does not depend on UI/adapters/demos.
Packages talk through public exports; internal modules do not import their own index
in a cycle. Moving an entry point updates the map and the consumers.

GoTipe does not own a host application's Wiki: pages, the file tree, tabs,
saving, and model scenarios belong to the consumer. In the playground the main example
shows the library's Page/Block variants with a choice of view; the UI geometry check
runs against them (`e2e/editor-visual-audit.spec.ts`). `apps/playground/tests/csp` is a separate
technical consumer for the CSP check of the public JS entry, with no product route;
`apps/playground/tests/perf` is one for typing latency on a long generated page
(`scripts/perf/typing-latency.mjs`) and for the frames of a review whose proposals are still
being written (`live.html`, `scripts/perf/live-review.mjs`).

The limits of 600 lines / 24 direct files do not replace a review of responsibility.
A pure function, a state controller, transport, and UI are separated by reasons
to change. Do not pass the whole context for convenience.

Media: core/assets owns the durable storage boundary; React/media owns loading,
cancellation, dialogs, preview/crop/resize. PageEditor reuses these components.
Tables: core/tables plans one atomic structural operation;
`core/table/grid.ts` is the HTML grid (spans, positions, a range across merged cells),
`table/layout.ts` is the edit plan and grid check, `table/steps.ts` is steps that preserve
IDs, `table/navigation.ts` is the adjacent cell for Tab/Shift+Tab within its own table;
the Rust copy is `crates/gotipe-core/src/table` (`edit_table`), shared cases are in
`crates/gotipe-core/tests/fixtures/table-edits.json`.
React/content/plain-blocks decides which blocks are drawn again only when they change
(built-in views and custom views that set `pure`); a custom view without it is drawn on every change.
React/content/table-layout owns the temporary width during drag and the controls,
`table-cells.tsx` owns cell spans and cell selection; the "Cells" menu is
`block-editor/src/table/cell-actions.ts`.


Editor and review contracts: [editor-contracts.md](editor-contracts.md).
Inside `core/src` ownership is divided as follows:

| Flow | Owner |
|---|---|
| Public document JSON / attributes / selection; `attrs` keys in code point order, as in Rust | `document/decode.ts`, `attributes.ts` (`cloneAttributes`), `selection.ts` |
| IDs of blocks and records of all packages (UUID v4, also without a secure context, i.e. HTTP) | `document/id.ts`, the public `createId()`; a direct `crypto.randomUUID()` in `packages/` is rejected by `check:architecture` |
| Schema and the preliminary atomic check for JS/WASM | `engine/schema.ts`, `validate.ts`, `js-transactions.ts`, `wasm-bridge.ts` |
| Engine states of one editor: a state is parsed once, a transaction copies only the top-level blocks it names (`applyTransaction`), and what is known of the others (their text, decoded form, validity) is kept with their objects; parsed states and decoded blocks are shared and never changed, a document handed out is decoded anew | `engine/states.ts` (`EngineStates`, owned by `wasm-bridge.ts`), `engine/js-transactions.ts`, `document/decode.ts` (`createBlockDecoder`) |
| History, filters, and transaction events; `before`/`after` of a transaction are decoded when read (`transactionContext`) | `editor/transactions.ts`, `editor/transaction-filters.ts` |
| Typing step: text typed or deleted in a row is one undo step (500 ms pause, selection change, a different kind of edit); IME composition counts as typing, and the pause before it is measured from `compositionstart` | `editor/typing-group.ts`; the input kind (`TypingKind`) is passed by the `input/` handlers through the mount port, composition by `editor/mount.ts` (`commit`), a selection with the same value keeps the object (`select` in `editor.ts`) |
| Caret after an edit: the native one is placed at the model caret as soon as the renderer has replaced the nodes or rewritten their text, otherwise in the next frame; until then input and Backspace use the model caret | `dom/selection.ts` (`renderObserver`, `scheduleSelectionRestore`); `input/session.ts` (`resolveSelectionForInput`), Backspace and paste (Mod+V, `paste`) in `editor/mount.ts`, `clipboard/handler.ts` (`onPaste`) |
| Text the browser inserted after handled input: only blocks that are new view objects or whose top-level node reported a DOM mutation are read again | `dom/render-correction.ts` (from `dom/selection.ts`) |
| Rules for Markdown block shortcuts: a block change and removal of the trigger are one transaction; where the block is not allowed, the rule yields without an error | `input/block-rule.ts` (`convertTyped`, `givesWay`), the rules live in their own extensions |
| A selected block (`selectBlock`): Backspace and Delete remove it whole, typing and Enter replace it, including after the restore frame while the DOM caret sits on its anchor | `editor/mount.ts` (keydown), `input/session.ts` (`resolveSelectionForInput`) → `input/selection-edit.ts` (`replaceStructuredSelection`) |
| The `focus(position)` caret and `autofocus`: the start of the first block with text, the end of the last | `editor/focus.ts` |
| Click on a link: when to open it, the link's `target` from the model into the host's `info`; URL check and the fallback `window.open` | `editor/link-activation.ts`; `editor/host.ts` (`openLink`) |
| Where an edit in the `update` event comes from: `origin` `"local"` or `"remote"` (an update from another replica and the repair after it) | `editor/transactions.ts` (`publishUpdate`), `editor.ts` (`setContent`, collaboration `changed`) |
| Lifecycle of extensions/plugins and decoration layers; order and check of `dependencies` | `editor/extension-lifecycle.ts`; `editor/extensions.ts` (`resolveExtensions`) |
| Configured paste rules and an isolated draft | `editor/clipboard-options.ts`, `clipboard/paste-rules.ts` |
| Hooks for pasting plain text (`transformPastedText`, `parsePastedText`) | `clipboard/handler.ts` (`pasteText`), the context with the schema is in `editor/clipboard-options.ts` |
| Extension state outside the document (search, counter, layers): one controller per editor | `extensions/scoped.ts`; owners are `extensions/find-replace`, `character-count`, `decorations`, `trailing-node.ts` |
| Input rules at the caret (typography, autolinks) | `extensions/typing/caret.ts`, `typing/typography.ts`, `links/` |
| Regular expression search: a Worker with a timeout abort, without a Worker a static check | `extensions/find-replace/worker.ts`, `scan.ts` (the scanner shared by the page and the Worker), `guard.ts` |
| Font, size, and text direction: values and checks are the same for commands, HTML, and import | `document/text-style.ts`; commands are `extensions/text-style.ts`, `text-direction.ts`; Rust is `gotipe-export/src/html/text_style.rs` |
| IME in renderers: `editor.isComposing`, holding the decorations of the block being composed | `editor/mount.ts`; React `content/decorations.ts` (`holdComposing`), Vue `decorations.ts` |
| Insertion that respects the container's allowed children | `commands/insertion-point.ts`, `commands/structure-commands.ts` |
| Selection after a chain if its steps removed a block or shortened text | `commands/chain-selection.ts` (from `chain.ts`, `run()`) |
| Applying a mark to a span: replacing the same type, exclusive group | `engine/mark-rules.ts` = `crates/gotipe-core/src/transform/marks.rs` |
| Atomic marks: atoms, step normalization, edges | `engine/atoms.ts` = `crates/gotipe-core/src/atoms.rs`; selection is `editor/atom-selection.ts`; keys are `engine/atom-keys.ts`; atom support (`atomSupport`: foreign text `engine/remote-atoms.ts` and `editor/remote-atom-repair.ts`, HTML `document/html-atoms.ts`) is `extensions/atoms/support.ts`, outside the core graph |
| Inline atoms and suggestions by trigger character | `extensions/atoms/`, `extensions/suggestion/`; emoji is the `emoji.ts` entry (Russian names are in `emoji-ru.ts`); TeX → MathML is the `math.ts` entry (`math/`); the caret at an atom is `dom/selection.ts`. The atom view is React `content/atoms.tsx`, Vue `atoms.ts`; the lists, emoji picker, and formula field are in `block-editor/src/atoms/` |

`editor.ts` ties the owners together. Commands get a narrow query of the assembled schema
(`commands/schema.ts`: allowed children, block marks, exclusive group, attribute defaults,
`values`, content kind); custom containers do not need branches by application name. The content
kind (a node's `content`) is also taken by the JS engine from the schema: `ContentOf` in `js-transactions.ts`,
like `content_rule` in `crates/gotipe-core/src/transform.rs`; the list commands use it too to decide
which block to wrap in an item (`commands/list-commands.ts`). The JS engine increments `Document.version`
on every step in `fallbackApply`, like `next_version` in Rust.

DOCX: `crates/gotipe-export/src/docx.rs` owns OOXML rendering; `docx/package.rs`
owns OPC parts and relationships. ZIP is a container codec, not a document model.
PDF and DOCX share `links.rs` (which references become links, attachment labels) and
`assets.rs` (bounded decoding of embedded PNG/JPEG/GIF/WebP).

PDF: `crates/gotipe-export/src/pdf.rs` owns options and export orchestration;
`pdf/validation.rs` checks complete supported structure before rendering, including
explicit rejection of content/children that a leaf or structural container cannot hold.
`pdf/layout.rs`, `inline.rs`, `table.rs` and `flow.rs` own GoTipe block layout,
line wrapping, merged cells and page boundaries. `pagination.rs` fills remaining
page space by splitting large measured fragments at intact text/image boundaries.
`highlight.rs` owns code token
presentation. `fonts.rs`/`text.rs` own embedded font selection and shaping;
`font_embedding.rs`, `images.rs`, `outlines.rs` and `writer.rs` own PDF resources,
bookmarks and serialization. `semantics.rs` attaches block roles before pagination;
`tagging.rs` owns the connected PDF structure/MCID/annotation tree and `metadata.rs`
owns XMP. The same Rust path runs natively and in optional
export WASM; no Typst compiler or host browser printing is used.
JSON migration: `packages/migration/src` contains a separate converter for each
source and a shared owner of IDs/warnings/preservation of unknown data.
The supported API and boundaries: [migration-contract.md](migration-contract.md).

Handle gestures: `block-editor/src/interaction/use-touch-drag.ts` owns a single touch/pen
pointer, the hold timer, capture, edge scroll, and cleanup. PageEditor and BlockEditor
pass hit testing/indicator/move callbacks; `components/block-interaction.ts` remains
the owner of the allowed row move and of the single undoable transaction.

The handle menu (`components/block-context-menu.tsx`) acts on the block that the handle moves: on
a list item and on a block inside an item, it acts on the item, not on the whole list (`handleTargets` in
`components/block-interaction.ts`). Delete (the last item takes the emptied list with it), copy, and
clear formatting are in `interaction/block-actions.ts`, each as one transaction; a column with no
blocks, in both cases and on a move, is filled with an empty paragraph (`refillColumn`).

The docs-view heading anchor (frame 2, D-30): `views/heading-anchor.tsx` gives `afterText` to the headings
that the outline lists (`outlineHeadings`), and holds the block where the handle sits, so the anchor
is visible on a heading that was touched too. The link to a block is built and copied by
`interaction/block-link.ts`, shared with the "Copy link to block" menu item; an opened link
is read by `react/src/editor-content.tsx`. `react/src/content/presentation.tsx` draws `afterText`
as a widget right after the block's text: outside the text and the document's offsets.

`interaction/block-text-metrics.ts` measures only the block's own text;
`data-gotipe-text-content` takes priority, and controls/widgets and foreign nested blocks
cannot shift the handle or the hover area.

`react/src/content/decorations.ts` and `vue/src/decorations.ts` reduce all kinds of core decorations
to ranges, widgets, and block attributes with the same classes; `text-renderer.tsx` and
`vue/src/text.ts` draw them. `react/src/content/selection-keeper.tsx` (in Vue, the
`EditorContent` hooks) keeps the native selection when only the decoration layer changed.

`react/src/content/code-text.tsx` keeps the native selection when only the
highlighting changes, using the pure read `editor.getDOMSelection()`. The transactional
selection remains owned by the core. Token redraw is deferred until the native
composition and its DOM reconciliation finish; listeners/frame are cleared when the
editor changes, on destroy, and on unmount.

Markdown line breaks (D-88): a soft break is read as a space in both readers
(`markdown/src/grammar/inline.ts`, `crates/gotipe-export/src/markdown_parse/inline.rs`);
the document's `"\n"` is written as a hard break in `inline-serialize.ts`. The Rust text writer is the
`writeInline` port (D-97): the units in `crates/gotipe-export/src/markdown/units.rs` (like
`serialization/inline-units.ts`), the steps in `inline.rs`, `characters.rs` (how a typed
character is written), `escapes.rs` (like `serialization/escapes.ts`), and `autolink_escapes.rs`; link lines,
addresses, and the captions of links and images are in `links.rs`; the write level
is chosen by the read-back check `verify.rs` (like `renderVerified`). Bare GFM addresses are found by `markdown/src/grammar/autolinks.ts` and
`markdown_parse/autolinks.rs`: the same rules for the reader and the writer. The line endings of an edited block
and how they were written, per the snapshot, are returned by `markdown/src/serialization/line-breaks.ts`; the gap without
a blank line next to a rewritten neighbor is left by `serialize.ts` only if the pair reads with it the same
way as with a blank line (D-99). The snapshot keeps the first-line indent of a block at the end of the gap before
it; `separators` in `serialize.ts` writes it with the block: a preserved block keeps it while it stays
a separate block, a rewritten one is written without it; a block that would merge into the previous one keeps the
previous block's original indent, otherwise it is rewritten (D-102). The TS block guards without a snapshot
(`resolveHazards` in `markdown/src/serialization/hazards.ts`, `isBlockEmpty`, `cannotInterrupt`)
are repeated by the Rust writer in `markdown/hazards.rs` (D-100). Items of a raw list next to a raw
list with the same marker get a different marker (D-107); a fence or HTML closed by the end of the
file gets its own closing line when a block follows it (D-106,
`serialization/closing.ts`). What is read after such an edit is verified by the writers by reading the structure of
blocks: `readBlockNodes` in `grammar/blocks.ts`, in Rust `markdown_parse/structure.rs`. The guard for
adjacent lists (`separateLists`, in Rust `separate`) is applied by the writers to the children of any block too
(`siblingBlocks` in `serialization/hazards.ts`, `hazards::children`, D-105). A list item takes a lazy line
only if its content reads it as paragraph text (`lazyReading` in
`grammar/lists.ts`, `lazy_reading` in `markdown_parse/lists.rs`, D-101). Shared cases are
`markdown-line-breaks.json`, `markdown-write-read.json`, and `markdown-nested-write-read.json` in
`crates/gotipe-export/tests/fixtures/`.

HTML/SSR: `packages/core/src/serialization/html.ts` owns the canonical serializer;
`html-styles.ts` supplies optional neutral export styles. `getHTML()` on both engines
(`wasm-bridge.ts`), core `serializeHtml`, server rendering and the HTML export wrapper
call this implementation; the WASM module has no HTML, Markdown or sanitizer exports
(D-73). The native `crates/gotipe-export/src/html.rs` (Cloud, `gotipe-convert html`) is
the only other writer, a separate port that must stay byte-identical: both suites
check `crates/gotipe-export/tests/fixtures/html-parity.json`. `html/js.rs` mirrors the
JavaScript attribute conversions, `html/safety.rs` the URL and color checks.

Native IME: `core/src/input/composition.ts` plans one input transaction, with its own undo
step; it does not continue the typing step;
`composition-dom.ts` temporarily preserves the identity of the affected DOM nodes until the document
is handed back to the renderer. A browser's DOM rebuild is not the document model.
`composition-interruption.ts` owns recoverable `COMPOSITION_CONFLICT` and suppression of
late input after a concurrent mutation. Transaction/history, document replacement and CRDT
receive boundaries interrupt before writing the model, so old snapshots never restore over
new renderer nodes. Presentation layers queue their latest update until composition
reconciliation; awareness decorations do not interrupt IME. React `CodeText` cancels an old resume frame on the next compositionstart
and releases deferred tokens on the `compositionInterrupted` lifecycle event without
consuming the application error channel.

`editor.getDOMSelection()` is a pure public read through the existing `core/src/dom/selection.ts`;
React captures native selection before presentation-only DOM replacement without changing
the model snapshot or implementing a second DOM-to-document mapper.

Search, counter, and text layout in the UI (Atlas, frames 25–28): `block-editor/src/text/` holds the search
bar (`find-bar.tsx`, keys in `find-keys.ts`), the counter line and the over-the-limit text layer
(`status-line.tsx`, `over-limit.ts`), alignment in "More" and in the toolbar (`align.tsx`), font and size
(`font.tsx`), the ¶ toggle (`invisibles.tsx`), and the right-to-left block handle (`direction.ts`).
`BlockEditor` only wires them in; the view is `theme/src/theme/{find,status,text-style}.css`.

The fixed toolbar of the modern view (Atlas, frame 31): `block-editor/src/toolbar/`. `fixed-toolbar.tsx`
(`FixedToolbar`) ties the strip and "More" together; the composition and the order of overflow are in `units.tsx`; what goes into "More" is
the pure `overflow.ts`, measuring is `measure.ts`; the single Tab stop and arrows are `roving.ts`;
"Insert" over the "/" commands is `insert-menu.tsx`; what the editor supports (fonts, ¶) is `support.ts`.
The reason a tool is unavailable is `components/formatting/reasons.ts`, which is also the tooltip and
`aria-describedby`; whether a mark is in the schema (the toolbar fonts, the "More" indices) is `formatting/schema.ts`.
⌘K (`openLinkDialog`) is handled by one owner per editor, `formatting/link-shortcut.ts`: the field
opens the bubble menu's `LinkEditor`, and without a bubble menu the toolbar's. The view is `theme/src/theme/toolbar.css`.

Review of a Markdown page (`PageEditor`'s `review`): `suggestions/src/review-decorations.ts` binds
proposals and comments to the document, in the proposals' `order`; `review/proposal.ts` binds one
proposal (`block-diff.ts` diffs the blocks, `live.ts` marks the end of a growing text),
`review/comment.ts` one comment. `review/cache.ts` (an opaque `ReviewCache`, its entries in a
`WeakMap`) and `keep.ts` bind again only what changed and keep the objects of the rest, so the
renderers redraw only that (`react/src/content/decorations.ts` `keepDrawn`,
`react/src/content/presentation.tsx` `phantomOf`). In the block editor,
`review/use-review-decorations.ts` owns the editor's `review` layer, the cache and the reveal of
new proposals; `review/live-markdown.ts` says how a growing proposal's unfinished Markdown is read;
`review/lane-cursors.tsx` places the lanes' cursors (`chip-side.ts`: the physical side of a
flag); `review/review-layer.tsx` ties them with the
cards (`review-cards.tsx`, `review-margin.tsx`) and the actions. A proposal that is still being
written (`live`) takes no decision anywhere in these.

Comment anchors (D-290): `comments/src/anchors.ts` finds each comment's quote after an `update`.
A quote the edit left whole follows it (`follow.ts`: the edit is read from the document text
before and after as one replaced part, placed as late or as early as the texts allow, as
`ai/src/review.ts` does per block for AI review comments); otherwise the whole anchor is searched
for (`findAnchor` of `@gotipe/suggestions`), and a context that no longer names the quote is
taken again around it (`anchorAt`).

The block editor's AI elements (Improve in the bubble menu, the ⌘J row, ghost text, the status line) exist
only when the `@gotipe/ai` extension backs them: `block-editor/src/components/ai-controls.ts` decides
by the core's `editor.hasExtension(name)`; without it the components draw and listen to nothing.

Images and files in React: `react/src/content/media-view.tsx` draws them read-only,
`content/media-blocks.ts` holds `MediaBlocksContext`. Editing (upload, link, size,
crop, caption, alt, preview, action menu) is the separate entry `@gotipe/react/media`
(`react/src/media/index.ts`); the main React entry does not import it (`media-entry.test.tsx`).
`block-editor/src/components/editor-providers.tsx` connects it together with strings and atoms.

UI strings: `@gotipe/i18n` (`i18n/src/locales/`) carries what `@gotipe/react` draws
and the common words; the block editor's own strings are in `block-editor/src/i18n/{en,ru}.ts` (the keys are the
type `BlockEditorTranslationKey`, `i18n/src/block-editor-keys.ts`). `withBlockEditorStrings`
puts them under the host's `I18n`; the block editor components read `useBlockEditorI18n()`.
