---
title: Changelog
description: Release notes of GoTipe, newest first, grouped by package.
---

## 0.1.3

Hosts that embed `PageEditor` get a reliable first focus, one undo step for a group of changes,
more of the look as tokens, and three new host options. Defaults keep today's look and behavior
except where a fix says otherwise. Released packages: `core`, `react`, `i18n`, `theme` and
`block-editor` (0.1.3), `wasm` (0.1.2).

### @gotipe/core, @gotipe/wasm

- `editor.batch(fn)`: every change committed while `fn` runs is one undo step, on both engines
  and under collaboration.
- `editor.focus(position)` puts the caret in place before the `focus` event; the
  `selectionChange` of the move comes after it.

### @gotipe/block-editor

- `autoFocus` comes after the effects of the render `onReady` causes, not on a frame.
- `PageEditor` passes `EditorHost.discardAsset` on (it dropped it in 0.1.2).
- `iconPlacement: "inline"` puts the page's glyph in the title's row.
- The "/" menu: `slashMenu.renderIcon` and `renderMeta` (`slashRenderIcon`, `slashRenderMeta` on
  `BlockEditor`); `undefined` keeps the built-in icon or shortcut. The row classes are documented.
- A suggested block's card stands at its text, past its marker or checkbox.
- Inserting a block from the title and replacing an empty paragraph are one undo step.

### @gotipe/react, @gotipe/i18n

- `media.placeholder: "row"` draws an empty image or file block as one row with "Choose a file…";
  `media.captionName` shows an image's file name as a quiet hint where it has no caption, not
  written to the document.

### @gotipe/theme

- Tables: the last row's line yields to a host's cell border; tokens for the gap after a heading,
  the grid and frame, the head, the first column, the row height, inline code in a cell and
  content-sized shared columns (`--gt-table-shared-layout: auto`).
- Lists: `--gt-list-item-gap`, `--gt-flow-between-lists`.
- Suggestions: tokens for the insertion line, a new block's tint and underline and the stale look.
- The compact media row, the caption hint and the glyph in the title row: `--gt-media-row-*`,
  `--gt-caption-hint-color`, `--gt-page-icon-inline`, `--gt-page-icon-inline-gap`.

## 0.1.2

Typing in a long document is fast, and hosts that embed `PageEditor` get the props and tokens
they needed. Defaults keep today's look and behavior except where a fix says otherwise.

### Typing in long documents

A key press on a Markdown page of about 7,400 blocks went from about 415 ms to about 30 ms to the
next frame (Chromium, JS engine). The work of a key press no longer grows with the document: the
JS engine keeps what it knows of unchanged blocks, the render check reads only changed blocks,
React redraws only the blocks that changed, and the page writes its draft from kept block
fingerprints. The Markdown written is the same byte for byte. New for custom views:
`BlockViewComponent.pure`; for the writer: `serializeMarkdown(doc, snapshot, { fingerprints })`.

### @gotipe/block-editor

- `PageReviewProps.onDeleteComment(id)`: a delete button (trash icon, "Delete comment") at the end
  of the open comment card's head. `false` keeps the card; a throw is `COMMENT_ACTION_FAILED`.
- `PageEditor` handle: `flush()` sends a pending draft at once and returns the Markdown;
  `setMarkdown(text)` replaces the document even with the same text as the last `markdown`.
- `PageEditor` props: `icon` and `header` (a page head above the title), `slashMenu` (commands,
  groups and opt-in descriptions of the `/` menu), `reviewLayout` (`auto`, `inline`, `margin`)
  `narrow` (keep the wide or the host's sizes in a narrow container) and `media`
  (`{ links, inlineErrors }` for the image and file placeholders), `undoableReplace` (load an
  external text without an undo step). `BlockEditor` gets
  `slashGroups`, `slashDescriptions`, `narrow` and `media`; `SlashMenu` gets `descriptions`.
- Fixes: a host `resolveAsset` returning `null` shows the asset as unavailable instead of
  requesting its raw path; `autoFocus` comes a frame after `onReady`; `insertBlock` from the page
  title inserts under the title; an image or file placeholder is not written to the file as
  `![](<>)`; a `review` without `comments` no longer re-renders in a loop.

### @gotipe/theme

- `--gt-comment-soft` and `--gt-ai-ghost` (and the new part colours) are unset by default and fall
  back to their base colours where they are drawn, so base colours set on a container reach them; `data-gt-narrow="off"` switches off the narrow container sizes.
- New tokens: `--gt-check-fill`, `--gt-check-line`, `--gt-card-name-size`,
  `--gt-card-name-weight`, `--gt-card-button-size`, `--gt-sug-ins-bar`,
  `--gt-sug-ins-underline` (and `-style`, `-thickness`, `-offset`), `--gt-sug-changed-bar`,
  `--gt-sug-changed-bar-width`, `--gt-image-radius`, `--gt-image-ring`, `--gt-image-ring-color`,
  `--gt-caption-color`, `--gt-caption-size`, `--gt-caption-leading`, `--gt-image-empty-bg`.
- Fixes: a list after a heading or a paragraph gets the flow gap of the Atlas;
  `.gotipe-btn-secondary` has its own rule (filled when it is the only button).

### @gotipe/react, @gotipe/vue

- Table columns without a stored width share the text column instead of being 160 px wide.
- `MediaOptionsContext` and `useMediaOptions` (`@gotipe/react`): hide "By link" or the failure
  text in the image and file placeholders; failures shown only there are then reported.

### @gotipe/suggestions

- A suggested new list item stands as its own item, pending or stale.

### @gotipe/core

- A host `saveAsset` that throws is reported as `ASSET_SAVE_FAILED`, not as a clipboard error.
- `EditorHost.discardAsset`: a file `saveAsset` stored that a paste or drop then did not insert.

## 0.1.1

Every npm package now has a README on npm, with installation, a short example and links to these
docs, and a one-line description in npm search. The code is the same as in 0.1.0.

## 0.1.0

The first public release. Every npm package and every Rust crate on crates.io starts at
`0.1.0`. Licenses per package are in [Licensing](/docs/resources/licensing).

### All packages

- Archives contain only built entry points, styles and license files. Every packed export and
  every ESM and CommonJS entry is checked before release.

### @gotipe/core

- Two engines behind one API: `createEditor({ engine: "auto" | "wasm" | "js" })`. `"auto"` loads
  the WASM core and falls back to the JS engine. The `@gotipe/core/js` entry has the same API and
  no reference to `@gotipe/wasm`, which is an optional peer, for hosts with a strict CSP.
- Host integration through `EditorHost`: `saveAsset`, `resolveAsset`, `openLink` and `onError`;
  `editor.reportError`, `editor.openLink` and `toSafeHref`; the events `error`,
  `editableChange` and `decorationsChange`.
- Read-only at runtime with `setEditable` and `isEditable`. Links never navigate on their own:
  Cmd/Ctrl+click, or any click when read-only, goes through `host.openLink`.
- `setContent(doc, { preserveSelection, addToHistory })` keeps the caret and never steals focus.
- Decoration layers with `setDecorations`: inline ranges, widgets, node classes and phantom
  blocks. Widget text never counts in offsets (`createTextWalker`).
- Atomic validation of documents and transactions; Unicode-safe selection and undo on both
  engines; transaction filters and previews (`addTransactionFilter`, `previewTransaction`);
  typed document snapshots; staged command selections; an owned mounted element. Collapsed marks
  are validated against the node schema, and nested insertions respect custom `childTypes`.
- A transport-free collaboration port for the WASM engine: `enableCollaboration`,
  `getCollaborationUpdate`, `receiveCollaborationUpdate`.
- `serializeHtml`, a DOM-free document serializer. `renderToHtml` from `@gotipe/core/server`
  takes `classPrefix`, `inlineStyles` and custom block renderers. Text color and colored
  highlight marks serialize with inert CSS color validation.
- The document palette: `DOCUMENT_TEXT_COLORS`, `DOCUMENT_HIGHLIGHT_COLORS` and
  `documentColorStyle(value)`. A color mark stores the light print color, so exports keep it;
  editors render palette values through theme tokens, so marks follow light and dark.
- Input methods: a composition is committed once from the DOM, and shortcuts match the physical
  key on non-Latin layouts. A document, history or collaboration change during a composition
  interrupts it safely, reports the text as a recoverable `COMPOSITION_CONFLICT` and emits
  `compositionInterrupted`; presence decorations wait until the composition ends.
  Shift+Enter inserts a soft break in WebKit too.
- `getDOMSelection()` reads the native selection without side effects.
- Tasks can have sub-tasks: Tab nests a task under the one above it and Shift+Tab lifts it.
- Structural blocks are inserted into a parent the schema allows; table and column sizes are
  validated before a change; inserting a block from the toolbar and its slash trigger is one undo
  step; nested to-do items render in both editor views.
- A new callout has no emoji by default, in the JS and Rust schemas alike. The `agent` callout
  value is deprecated and serializes as `> [!NOTE]`.

### @gotipe/markdown

- A lossless GFM ⇄ GoTipe codec with its own parser in TypeScript and Rust. An unchanged file
  round-trips byte for byte; after an edit only the changed top-level blocks are rewritten.
- Front matter, HTML, footnotes and link definitions are kept as they are. Block IDs survive
  re-parsing, and a text ⇄ Markdown offset map supports anchors.
- Lists nested under a task and task lists nested under a list item (`- [ ] a` followed by
  `  - [ ] b`) are read and written instead of falling back to raw Markdown.

### @gotipe/react

- Decorations in `TextRenderer`; `blockViews` and `placeholder` on `Editor` and
  `EditorContent`; `GoTipeI18nProvider`; image and file blocks through the host.
- `CodeBlock`, `ToggleBlock` and `CalloutBlock` are exported for custom block views.
- Text and highlight colors render through the document palette and follow the theme.
- Tables add a column from a bar to their right and a row from a bar below, outside the
  scrolling area; a wide table fades at the edge that hides columns.
- Embeds show a card with their site and address; formulas show their TeX centered and are
  edited as text. Empty blocks say what they will become. Images and files show load errors,
  offer upload and a link on empty blocks, and format file sizes for the locale.

### @gotipe/vue, @gotipe/svelte, @gotipe/solid

- An editor that finishes initializing after its component is torn down is disposed.
- `@gotipe/vue` exposes a reactive document renderer.

### @gotipe/block-editor

- `PageEditor`: a page backed by a Markdown file, with blocks, the "/" menu, tables with column
  types and model suggestions with lane cursors. Markdown goes in and out through
  `@gotipe/markdown`, and untouched blocks keep their bytes. `ReviewLayer`, `ReviewBar`,
  `LaneAvatars` and `ReviewApi` accept or reject one or all suggestions, show comments with
  replies, detect stale suggestions and reveal text in up to 1.5 s, honoring
  `prefers-reduced-motion`.
- `PageEditor` is `BlockEditor` with a Markdown session: it shares the bubble, slash menu, block
  handle and menus, takes `view` (`notion` by default, `docs`, `modern`, `minimal`) and
  `blockViews`, and shows no toast of its own when the host handles `onError`. The file's leading
  `# heading` is the page title (`.gotipe-page-title`); raw Markdown blocks are `.gotipe-raw`.
  Strings are English by default; pass `locale="ru"` for Russian.
- `BlockEditor` takes `view`, `header` (`PageHead`), `blockViews`, `slashCommands`, `ariaLabel`,
  `errorToast` and `highlight`. An empty page offers quick blocks (`starters`), a null `editor`
  shows a skeleton, and reported errors appear as a toast. `EditorSkeleton`, `EditorErrorToast`
  and `EditorStarters` are exported.
- Every table header has a column menu (type, add a row or column, remove the column;
  `TableColumnButton`), and the row under the pointer has a handle to add a row above or below or
  delete it (`TableRowButton`, `insertRow`, `deleteRow`).
- On a wide page, review cards sit in the margin level with their text
  (`data-review-layout="margin"`); a narrow page opens one card by the text. The `docs` view shows
  a sticky outline of the page's headings.
- Toolbar tooltips show their keys and menus show the keys of block types. ⌘J opens the model's
  command bar and ⌘K the link field.
- Code highlighting is optional: `@gotipe/block-editor/shiki` loads Shiki lazily with its
  JavaScript regex engine and provides `gotipeCodeTheme`, `codeLanguages` and
  `codeLanguageAliases`; or pass your own highlighter to `CodeBlockView`.
- `SlashMenu` takes `groups`, `renderIcon`, `renderMeta` and `labels`; the menu shows group
  labels, icons and the Markdown shortcut of each block.
- Block dragging works with touch and pen (long press, edge scrolling, cancel, one-step undo);
  Alt-drag moves a whole list; a drop line shows where the block lands.
- The bubble, menus, link field and color row share one overlay surface and icon set. The color
  picker offers the document palette.

### @gotipe/theme

- One source of design tokens: a system font stack (no web fonts), radii by role, and light and
  dark palettes.
- Views are token sets over the same markup: `notion` on `:root` and `[data-gt-view]`;
  `[data-gt-view="docs" | "modern" | "minimal"]` change only what makes them different. Narrow
  containers (640 and 359 px) adjust the tokens through `@container`.
- `base.css` draws the document of every view; `theme.css` adds blocks, menus, panels, review
  marks and states. `page.css` loads both, and there is no separate page theme. `tokens.css`
  imports the generated palette and views. Menus share one overlay surface.
- Token groups for the page and text flow (`--gt-page-width`, `--gt-page-pad-*`, `--gt-body-*`,
  `--gt-h1…h4-*`, `--gt-flow-*`, `--gt-indent`), interface sizes (`--gt-ui-*`, `--gt-menu-*`,
  `--gt-handle-*`), tables (`--gt-table-add`, `--gt-table-add-gap`, `--gt-table-fade`,
  `--gt-row-handle-room`), the outline (`--gt-outline-*`), review (`--gt-remote-selection-opacity`,
  `--gt-spin-duration`) and `--gt-icon-small`. Older names remain as aliases.
- `--gt-*` values a host sets on a container reach the content in both themes.
- The list bullet lets the pointer through, so a click beside an empty bullet item in Firefox
  puts the caret in that item.

### @gotipe/i18n

- `createI18n({ locale, locales })` with an English fallback; its `plural()` method and
  `pluralCategory()` follow Russian plural rules.
- Built-in `en` and `ru` strings for the page, "/" menu, tables, review, placeholders, bubble,
  links, colors, menus, block handle, the model's bar, suggestions, page head and editor states,
  including `table.rowMenu`, `table.addRowAbove` and `table.addRowBelow`.

### @gotipe/comments, @gotipe/suggestions, @gotipe/versions

- Persistent comment anchors and replies.
- Anchored suggestions (`before + quote + after`, exactly one match) with `applyAnchoredEdits`,
  `computeReviewDecorations` (binds suggestions and comments to the document and detects stale
  ones) and `revealDecorations`.
- Suggestion inverse snapshots, tracked editing and atomic review actions.
- Working comment, review and version history interfaces in `PageEditor`, with explicit host
  persistence.

### @gotipe/export

- `exportToHtml`, `exportToMarkdown`, `exportToPlainText`, `exportToPdf` and `exportToDocx`. PDF
  and DOCX come from the optional `@gotipe/export-wasm`, loaded on first use.
- The HTML options `classPrefix` and `includeStyles` apply the same block classes and styles as
  server rendering. Options a format does not support throw instead of being ignored.

### @gotipe/export-wasm

- PDF with GoTipe's own layout and renderer on maintained PDF, shaping and font-subsetting
  libraries, with bundled Unicode fonts and their license notices.
- A4, Letter and Legal pages, validated margins and font sizes, headers and footers, Unicode
  text, inline formatting, links, images, nested lists and merged table cells. Long text and code
  wrap, oversized table rows continue on the next page, and content that cannot be represented
  fails instead of being dropped.
- Heading bookmarks, a tagged structure in reading order, image alternative text, table and list
  semantics and XMP metadata. Word selection and emoji variation sequences stay accurate, and
  copied text is the logical Unicode text.
- DOCX with GoTipe's own OOXML renderer and a maintained ZIP codec: Unicode, relationships, marks,
  images and metadata. Invalid XML characters are rejected.
- GoTipe Cloud runs the same renderer natively; a fixed corpus checks both against each other.

### @gotipe/migration

- Unsupported subtrees are preserved with warnings (`preservedNodes`) instead of being
  discarded. Tiptap camelCase nodes, nested and check lists, Lexical links and text flags, Slate
  attributes and custom mappings, strict validation, stable source IDs and an optional
  `createId` factory.

### @gotipe/sdk

- Aligned with GoTipe Cloud's authentication, resource envelopes, pagination and errors.
