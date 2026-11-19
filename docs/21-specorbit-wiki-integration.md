# 21 — Using the GoTipe library inside SpecOrbit

GoTipe is an editor library. The Wiki is a feature of the SpecOrbit application and is
implemented in its repository on top of the public GoTipe packages. GoTipe has no
separate Wiki page, file workspace, or SpecOrbit runtime.

| GoTipe | SpecOrbit application |
|---|---|
| Document, commands, selection, history, Markdown | Project pages, paths, and the file tree |
| Generic `PageEditor`, blocks, menus, and styling | Tabs, panels, navigation, and Wiki layout |
| Host contracts for assets, links, and errors | File read/write, permissions, durable storage, and autosave |
| Display of suggestions/comments and actions on them | Model requests, revisions, and the business process for accepting edits |

The main playground shows the generic Page and Block variants of the same
editor: `/?view=page#basic` and `/?view=block#basic`. The examples below describe the
adapter code **on the SpecOrbit side**: `wiki.*`, `file`, `projectPath`, and the save
functions belong to the host and are not GoTipe package APIs. This document does not
confirm that the integration or its checks have been carried out in the SpecOrbit repository.

## Packages

| Package | Purpose |
|---|---|
| `@gotipe/block-editor` | `PageEditor`, `ReviewBar`, `LaneAvatars`, `PageIcon`, `insertPageBlock` |
| `@gotipe/theme` | `@gotipe/theme/base.css` and `theme.css` — the shared views; `page.css` loads the same two as one file |
| `@gotipe/core`, `@gotipe/react` | the core and the React layer (peer) |
| `@gotipe/markdown` | our own Markdown codec; also needed at runtime: `applyAnchoredEdits` — in `@gotipe/suggestions` |
| `@gotipe/suggestions` | suggestion types and anchors: `findAnchor`, `applyAnchoredEdits`, `locateEdits` |
| `@gotipe/i18n` | UI strings: `en` by default, `ru` built in — the wiki needs `locale="ru"` |
| `@gotipe/versions` | a required peer: `@gotipe/block-editor` imports it statically (version history and comparison); install it even when the page shows no history |

JS mode and editing without highlighting need neither `@gotipe/wasm` nor `shiki`.
The codec uses GoTipe's own parser, with no mdast/micromark runtime dependencies.
Untouched Markdown fragments keep their original bytes; arbitrary JSON attributes
do not automatically become part of Markdown.

## Build (Vite)

```ts
// vite.config.ts renderer
resolve: {
  alias: [
    // JS engine: not a single line of WASM ends up in the bundle.
    { find: /^@gotipe\/core$/, replacement: "@gotipe/core/js" },
  ],
},
```

- `@gotipe/core/js` — a JS entry that does not load `@gotipe/wasm`; native collaboration
  is unavailable in this mode. The main entry supports an optional WASM peer and
  selects the engine through `engine`. For a strictly JS-only build keep the exact alias.
- On the SpecOrbit side the Wiki screen can be loaded lazily together with
  `import "@gotipe/theme/base.css"` and `import "@gotipe/theme/theme.css"` (or `page.css` — the same
  in one file). The contents of the startup bundle are checked in the host's
  build; the GoTipe package itself does not create an application screen or route.
- Importing GoTipe modules does not attach listeners, make network requests, or load fonts.
  Named HTML references are decoded by our own Unicode table without creating
  DOM elements; no separate alias for the decoder is needed.
- Size is checked on a specific production build. The supported budgets
  for the full JS graph are described in [javascript-budgets.md](development/javascript-budgets.md),
  for the native module in [wasm-budget.md](development/wasm-budget.md). They are not
  a promise that an arbitrary SpecOrbit application will keep the same size.

## CSP

The isolated consumer test `build:csp-test` checks the library under this policy:
`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'`.
A build by itself does not prove the absence of CSP violations. Checking requests,
errors, and real input is described in the [CSP contract](development/csp.md);
integration into the host application requires a separate run in its renderer.

- `script-src 'self'` — is enough: JS engine, no `wasm-unsafe-eval` or `unsafe-eval`.
- `style-src 'unsafe-inline'` — needed for `style` attributes (menu and cursor positions, the
  track color `--gt-track`, cell alignment). The host sets the policy it needs.
- `img-src data:` — page images are shown as data URLs from `host.resolveAsset`.
- `font-src` — the theme declares no `@font-face`: fonts come from `--gt-font-ui` and
  `--gt-font-mono`; SpecOrbit chooses the fonts and how they are loaded.
- `connect-src` — the editor makes no network requests.
- Code highlighting is off by default. If needed: `@gotipe/block-editor/shiki`
  (`shiki/core` + the JavaScript regex engine, no WASM; grammars via lazy `import()`).

## Usage

```tsx
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";
import { PageEditor, type PageEditorHandle } from "@gotipe/block-editor";

<PageEditor
  ref={pageRef}
  view="notion"                        // shared view: notion (default), docs, modern, minimal
  markdown={file.content}              // file text; a new value ≠ the last draft → external replacement
  onChange={(md) => scheduleSave(md)}  // draft once a frame after edits; autosave (~1 s) is the host's job
  readOnly={viewingVersion}            // H8: viewing an old version
  locale="ru"                          // en by default
  titlePlaceholder={slugToTitle(path)} // title when the file has no "# …"
  icon={<PageGlyph page={page} />}     // optional glyph above the title, in the text column
  iconPlacement="inline"               // or in the title's row, before its text
  narrow={false}                       // keep the host's sizes in a narrow panel too
  reviewLayout="inline"                // cards by the text, never in a margin column
  reviewCardPlacement="above"          // on a narrow page the card opens above the row
  reviewLaneCursor="pointer"           // a lane's cursor as an arrow pointer with its name
  reviewLanePointer={<AgentArrow />}   // optional: the host's own arrow, tip set by --gt-lane-pointer-tip-*
  slashMenu={{ commands: (defaults) => [...defaults, agentNote], groups, descriptions: true }}
  host={{
    saveAsset: async (blob, { name, mediaType }) => {
      const { path } = await wiki.writeAsset({ projectPath, page, name, mediaType, data: await toBase64(blob) });
      return { src: relativeToPage(path) };        // for example "assets/schema.png"
    },
    resolveAsset: async (src) => (await wiki.readAsset({ projectPath, path: resolve(page, src) })).dataUrl,
    openLink: (href) => openExternalOrPage(href),  // http(s)/mailto or a path in the project
    onError: (error) => toast.error(errorText(error.code)), // with onError the editor shows no toast of its own
  }}
  review={review}                      // see below; without it there is no suggestion layer
  reviewBar={false}                    // SpecOrbit draws the edit bar itself (WikiLiveBar), or { title, extra }
/>
```

`autoFocus` comes after `onReady` and after the effects of the render `onReady` causes (a host that stores the
editor in state and subscribes in an effect hears it), first `focus`, then `selectionChange` with the caret already
in place.

Handle (`ref`): `editor`, `getMarkdown()`, `flush()` (emits a pending draft at once and returns the
Markdown — call it before a save), `setMarkdown(text)` (replaces the document even with the same text
as the last `markdown`, e.g. a revert to the file on disk; `{ addToHistory: false }` or the prop
`undoableReplace={false}` clears the undo history instead, e.g. around showing a past version), `focus()`, `insertBlock(kind)` (the "Image"
and "Blocks" buttons of the toolbar), `getTitle()`, `selectTitle()` ("Rename"), `review` (`ReviewApi`).

- The title is the first `# …` of the file. Without it `titlePlaceholder` is shown, and nothing is
  written to the file until the person types a title.
- Front matter, HTML, footnotes, and link definitions are not shown as editable text: they
  stay as they are (read-only "Markdown" blocks).
- External replacement (the file was changed by an agent, Git, or an accepted suggestion): pass the new `markdown` —
  block ids are reused, focus, caret, and scroll position are kept, and the change goes into undo. A text equal to
  the last `markdown` passed is not a change of the prop: use `ref.setMarkdown(text)` for it.
- An unchanged file comes back byte for byte; after a paragraph edit only its block changes.
- PageEditor is a BlockEditor with a Markdown session and model suggestions: the same toolbar over
  the selection, "/", block handle and block menu, table column menu (Atlas, frames 6–9 and 19). The page
  has no theme of its own.
- On a wide page (card + gap + `--gt-margin-page-min`) suggestion cards stand in a
  column in the margin next to their edits: the open one with its replies, the others collapsed. On a narrow page
  the card opens next to the text. `reviewLayout="inline"` or `"margin"` fixes either layout at any width;
  `reviewCardPlacement="above"` opens that card above the row (below when there is no room).
- The "/" menu: `slashMenu.commands` (a list, or a function over the page's own commands), `slashMenu.groups`
  (order and labels — e.g. Upload first, labelled "Media") and `slashMenu.descriptions` (a hint under each name).
  A host command such as "Agent instructions" is an ordinary `SlashCommandDef` that inserts a quote with the label.
- Custom block views are the `blockViews` prop: they take precedence over page views and shared ones. This is how SpecOrbit draws,
  for example, a quote that starts with a bold label "Agent instructions:" — for the library
  it is an ordinary quote.

### Host callbacks (`EditorHost`)

| Callback | When | SpecOrbit |
|---|---|---|
| `saveAsset(blob, {kind, name, mediaType, size})` → `{src, name?}` | paste from the clipboard, drag and drop, "Image", "File" | `wiki.writeAsset`; failure — `throw` (becomes an `error` event) |
| `resolveAsset(src)` → data URL \| null | showing an image | `wiki.readAsset` → `dataUrl`; `null` — the image shows "unavailable" and nothing is requested |
| `openLink(href, {blockId, newTab, target})` | Cmd/Ctrl+click; any click in read mode; click on a file | external links — the system browser; `docs/pages/*.md` — a page tab; `target` — the link's own (`_self`, `_blank`), for a file name `null`, the host decides |
| `discardAsset({src, name, kind})` | a file `saveAsset` stored that a paste, a drop or a media block upload then did not insert | delete it from `assets/` |
| `onError(error: GoTipeError)` | any error | toast or highlight; the editor has no error strings of its own |

Error codes (`GoTipeError.code`, all of `GoTipeErrorCode` in `@gotipe/core`). An invalid link in the
floating toolbar highlights the field.

| Code | On a page |
|---|---|
| `EDITOR_NOT_INITIALIZED` | the editor could not be created (the page shows "could not be opened"); the reason is `details.cause` |
| `PARSE_ERROR`, `VALIDATION_ERROR` | the Markdown or the document failed its check while creating or replacing |
| `TRANSFORM_ERROR` | a command or a table operation could not be applied; nothing changed |
| `ASSET_SAVE_FAILED` | `saveAsset` threw (any error but a `GoTipeError`), returned no path or an unsafe one, or the document changed during the upload |
| `ASSET_RESOLVE_FAILED` | `resolveAsset` threw |
| `ASSET_UNSUPPORTED` | an image that is not PNG, JPEG, GIF or WebP; also what a host throws itself to refuse a file |
| `ASSET_TOO_LARGE` | without `saveAsset`, a file above 10 MiB cannot be embedded |
| `LINK_BLOCKED` | not http/https/mailto and not a relative link |
| `LINK_OPEN_FAILED` | `openLink` threw |
| `CLIPBOARD_FAILED` | copy, cut or paste failed (no clipboard access, the paste no longer fits) |
| `PROPOSAL_STALE` | "Accept" on a stale suggestion |
| `PROPOSAL_ACTION_FAILED` | `onAccept` or `onReject` threw |
| `COMMENT_ACTION_FAILED` | `onReply` or `onDeleteComment` threw |
| `COMPOSITION_CONFLICT` | IME input met a concurrent change; the composed text is in `details` |
| `EXTENSION_ERROR`, `EXTENSION_DEPENDENCY_CYCLE` | an extension failed or the extensions depend on each other in a cycle |
| `WASM_INIT_FAILED`, `COLLABORATION_UNAVAILABLE`, `COLLABORATION_ERROR` | WASM engine and collaboration only: a page (JS engine) never reports them |

### Model suggestions (ADR-0047)

```ts
const review: PageReviewProps = {
  lanes: [                       // trajectory lanes; color is a CSS color or a variable
    { id: "user", name: "You", kind: "user", color: "var(--gt-track-4)" },
    { id: "agent", name: "Agent", kind: "agent", color: "var(--gt-track-1)" },
    { id: "skill:company-lint", name: "company-lint", kind: "skill", color: "var(--gt-track-2)" },
    { id: "tool:psql", name: "psql", kind: "tool", color: "var(--gt-track-3)" },
  ],
  proposals: records.proposals.map((p) => ({
    id: p.id, laneId: laneOf(p.source), edits: p.edits, reason: p.reason,
    status: p.status,            // "stale" from the records is also taken into account
  })),
  comments: records.comments.map((c) => ({
    id: c.id, laneId: laneOf(c.source), anchor: c.anchor, text: c.text, question: c.question,
    replies: c.replies.map((r) => ({ id: r.id, author: "You", text: r.text })),
  })),
  cursors,                       // from wiki.changed kind=cursor: {laneId, label, proposalId | anchor}
  onAccept: async (id) => {      // save the draft → wiki.acceptProposal → new text in markdown
    await saveNow(pageRef.current!.flush());
    const { document } = await wiki.acceptProposal({ projectPath, path, proposalId: id, expectedRevision });
    setFile(document);           // PageEditor will apply it as an external edit
    return true;                 // false — stop "Accept all"
  },
  onReject: (id) => wiki.rejectProposal({ projectPath, path, proposalId: id }).then(() => true),
  onRejectAll: () => wiki.rejectAll({ projectPath, path }),
  onReply: (commentId, text) => wiki.reply({ projectPath, path, commentId, text }).then(() => true),
  onDeleteComment: async (commentId) => {   // the trash button of the open comment card
    if (!(await confirm("Delete the comment?"))) return false;  // false — the card stays
    await wiki.deleteComment({ projectPath, path, commentId });  // a throw → COMMENT_ACTION_FAILED
    return true;                 // then drop it from `comments`
  },
  onStatesChange: ({ proposals }) => setStale(proposals.filter((p) => p.status === "stale")),
};
```

- Anchors are the same `before + quote + after` in the file text. The editor binds them to the draft on
  every edit; if exactly one match is not found — "stale" (only "Reject"), with a hint
  as text in place of `before`.
- Highlighting is exact for edits inside blocks (an insertion is underlined in the lane color, a replacement is
  struck-through text plus the new one); new list lines and table cells appear in place; blocks of a different
  type — the old one struck through, the new one under it, the card shows "Was" and "Now".
- "Accept all" by default goes one by one in document order, stopping at the first stale one
  or `false`. A custom order — `onAcceptAll`. `ref.review.acceptAll()` — for your own bar.
- Cursor: with `proposalId` — at the end of its text, otherwise — at `anchor`. The caption is `label`.
  Revealing finished text takes up to 1.5 s, instantly under `prefers-reduced-motion`.
- Without `onAccept` the suggestion is applied locally (`applyAnchoredEdits`) — this is how the example works.
- For the runtime (L1), `findAnchor`, `locateEdits`, `applyAnchoredEdits`, and
  `anchorWindowsOverlap` from `@gotipe/suggestions` are useful: the same rules as in the editor.

## CSS variables

The page is drawn by the shared view (`view`); all colors, fonts, and sizes are `--gt-*` tokens
(`@gotipe/theme`). The dark theme is `data-theme="dark"` on any ancestor (or `prefers-color-scheme`
if there is no `data-theme`).

- Colors, fonts, radii, and shadows are inherited: set them on the page container or higher, and they
  reach the text, menus, and suggestion cards.
- View sizes (font size, line height, page margins) are set by the view itself on `[data-gt-view]`. Put your own
  values on `.gotipe-page .gotipe-block-editor`. A container up to 640 px wide sets smaller sizes on the editor's
  children, which win over yours: `narrow={false}` (`data-gt-narrow="off"` on the page) keeps yours at any width.
- Part colours (`--gt-comment-soft`, `--gt-ai-ghost`, `--gt-check-fill`, `--gt-check-line`, `--gt-caption-color`,
  `--gt-image-ring-color`, `--gt-image-empty-bg`) are unset by default: their rules fall back to `--gt-comment-tint`,
  `--gt-text-3`, `--gt-ink`, `--gt-line-control`, `--gt-text-2`, `--gt-line` and `--gt-sunken` where they are drawn,
  so the base colours of the map below reach them. Set a part colour itself on any container.
- Parts with their own tokens (defaults keep the shared look; the full table is in `theming.md`): the task box
  (`--gt-check-fill`, `--gt-check-line`, `--gt-check-mark`), the review card (`--gt-card-name-size`,
  `--gt-card-name-weight`, `--gt-card-button-size`), an insertion (`--gt-sug-ins-bar`, or a text underline with
  `--gt-sug-ins-underline: underline` and `--gt-sug-ins-underline-thickness|-offset|-style`), a changed block's bar
  (`--gt-sug-changed-bar`, `--gt-sug-changed-bar-width`), the block handle's rail (`--gt-handle-rail`), the image
  (`--gt-image-radius`, `--gt-image-ring`, `--gt-image-ring-color`, `--gt-caption-color|-size|-leading`) and an empty
  image or file block (`--gt-image-empty-bg`, and as a row with `media={{ placeholder: "row" }}`: `--gt-media-row-*`); with
  `media={{ captionName: true }}` an image without a caption shows its file name as a quiet hint, not written to the file.

An example adapter on the SpecOrbit side (the names on the right are application tokens):

```css
.wk-page {
  --gt-page-bg: var(--canvas);      --gt-sunken: var(--surface);      --gt-overlay: var(--overlay);
  --gt-text: var(--text);           --gt-text-2: var(--text-2);       --gt-text-3: var(--text-3);
  --gt-fill-1: var(--fill-1);       --gt-fill-2: var(--fill-2);       --gt-fill-3: var(--fill-3);
  --gt-line: var(--line);           --gt-line-strong: var(--line-strong);
  --gt-line-control: var(--line-control);                             --gt-line-active: var(--line-active);
  --gt-ink: var(--primary);         --gt-ink-hover: var(--primary-hover); --gt-ink-text: var(--primary-text);
  --gt-accent: var(--accent);       --gt-accent-text: var(--accent-text);
  --gt-focus: var(--focus-ring);    --gt-selection: var(--selection);
  --gt-success: var(--success);     --gt-warning: var(--warning);     --gt-danger: var(--danger);
  --gt-danger-tint: var(--danger-soft);
  --gt-comment: var(--warning);     --gt-comment-tint: var(--warning-soft);
  --gt-shadow-overlay: var(--shadow-e2);
  --gt-font-ui: var(--font-ui);     --gt-font-mono: var(--font-mono);
  --gt-radius-control: var(--r-control); --gt-radius-overlay: var(--r-overlay);
}
```

Suggestion lane colors are `--gt-track-1…6`: three participant colors (blue, green, teal),
warning (amber), gray, and red; there is no purple or terracotta. A lane without `lanes[].color`
takes `--gt-track-1`, a comment without a lane takes `--gt-track-3`; a lane passes its own color in
`lanes[].color`.

Classes for your own edits: `.gotipe-page` (root), `.gotipe-page-title`, `.gotipe-raw`,
`.gotipe-table`, `.gotipe-column-handle`, `.gotipe-row-handle`, `.gotipe-column-menu`, `.gotipe-bubble-menu`, `.gotipe-slash-menu`,
`.gotipe-block-context-menu`, `.gotipe-review-bar`, `.gotipe-review-card`, `.gotipe-review-card-delete`, `.gotipe-lane-cursor`,
`.gotipe-btn-secondary`, `.gotipe-sug-ins|-del|-stale|-block-ins|-block-del|-block-changed`, `.gotipe-cmt`,
`.gotipe-page-head` (`icon`/`header`), `.gotipe-slash-menu-item-description`. Attributes:
`data-gt-view`, `data-gt-narrow`, `data-review-layout` (column in the margin), `data-gotipe-proposal`, `data-gotipe-comment`, `data-gotipe-lane`.

## What goes into Markdown

| Block | Markdown |
|---|---|
| Tasks | `- [ ]` / `- [x]`; a subtask is a nested list with indentation (Tab / Shift+Tab) |
| Callout | `> [!NOTE]` (TIP, IMPORTANT, WARNING, CAUTION) |
| Image | `![alt](assets/name.png "caption")` — the path is returned by `saveAsset` |
| File | `[name.pdf](assets/name.pdf)` — a paragraph with a single link, no title and no scheme (`assets/…` or `/…`), text = the file name from the path. A link with a scheme (`https://…/name.pdf`) stays a paragraph with a link |
| Column type | not stored: "Number" is `---:`, "Code" is cells in `` ` ``, "Yes / no" is cells `✓` and `—` in any UI language; words from earlier versions (`да`/`нет`, `yes`/`no`) are read as `✓` and `—` |
| HTML, footnotes, definitions | as is, a read-only block |

## Limitations

- Soft line breaks inside a paragraph are kept as a newline; in the editor they show as a
  break.
- An edited block is written canonically: `**`, `*`, `~~`, ATX headings, fenced code; list markers and
  numbering are kept.
- GFM turns bare URLs into links when an edited block is parsed again.
- Multi-paragraph list items and quotes, mixed task lists — as an "as is" block.
- Speed: an 80 KB page (2,000 blocks) — parsing ~190 ms, serialization after an edit ~16 ms.
