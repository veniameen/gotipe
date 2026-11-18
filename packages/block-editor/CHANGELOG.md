# @gotipe/block-editor

## 0.1.3

### Patch Changes

- 2c3dccb: A reliable first focus:

  - `editor.focus(position)` puts the caret at `position` before the `focus` event and emits the
    `selectionChange` of that move after it (it used to emit `selectionChange` first).
  - `PageEditor`'s `autoFocus` comes after `onReady` and after every effect of the render `onReady`
    causes, so a host that keeps the editor in state and subscribes in an effect hears `focus` and
    then `selectionChange`, under StrictMode too. It no longer depends on a frame, which under load
    could come before the host's subscription.

- 2ca6ed6: `PageEditor` passes the host's `discardAsset` on to the editor; it used to drop it, so a file
  stored for a paste that was then not inserted stayed with the host. A test now fails when
  `EditorHost` gains a member the page does not pass on.
- f67955e: `PageEditor`'s `iconPlacement: "above" | "inline"` (default `"above"`): `"inline"` draws the page's
  glyph in the title's row before its text (`.gotipe-page-title-icon`, `--gt-page-icon-inline`,
  `--gt-page-icon-inline-gap`), outside the title's text and the file. `createPageBlockViews` takes
  `titleIcon`.
- 358b9c1: The card of a suggested block (a new list item or task, pending or stale) stands at the block's
  text, past its marker or checkbox, as a card of an inline suggestion does, not at the block's
  left edge.
- ccc02e6: The "/" menu takes the host's row drawing: `PageEditor`'s `slashMenu.renderIcon` and
  `slashMenu.renderMeta`, `BlockEditor`'s `slashRenderIcon` and `slashRenderMeta`. In `SlashMenu`,
  `undefined` from either keeps the built-in icon or Markdown shortcut (it used to draw nothing),
  and `null` from `renderMeta` shows none. The menu's row and group classes are documented, so a
  host can put the description beside the title or hide the group lines in its CSS.
- ec77da1: `editor.batch(fn)` makes every change committed while `fn` runs one undo step, on both
  engines and with collaboration: Undo restores the document and the selection from before
  the first change, Redo restores all of them. Events and filters still run per transaction;
  a nested batch joins the outer one; typing before and after a batch stays a step of its own.
  `@gotipe/wasm` joins a change marked `metadata.typing: "group"` to the open step of its
  collaboration history.

  `PageEditor`'s `insertBlock` from the title and the image and file blocks that replace an
  empty paragraph are one undo step; they used to take two.

- Updated dependencies [2c3dccb]
- Updated dependencies [9ca2225]
- Updated dependencies [f67955e]
- Updated dependencies [f633ccf]
- Updated dependencies [ec77da1]
  - @gotipe/core@0.1.3
  - @gotipe/react@0.1.3
  - @gotipe/i18n@0.1.3
  - @gotipe/theme@0.1.3
  - @gotipe/suggestions@0.1.2
  - @gotipe/versions@0.1.1

## 0.1.2

### Patch Changes

- 7103833: A comment can be deleted from its card. `PageReviewProps.onDeleteComment(id)` adds a trash
  button at the end of the open comment card's head, labelled "Delete comment" (`review.deleteComment`,
  Russian included). Ask for confirmation inside the callback if you need it: `false` keeps the
  card, a throw is reported as `COMMENT_ACTION_FAILED`, and after success drop the comment from
  `comments`. Without the callback the card is unchanged.
- 5d8df93: Typing in a long document is responsive: a key press in a Markdown page of about 7,400 blocks
  went from about 415 ms to about 30 ms to the next frame (Chromium, JS engine, one machine). The
  work of a key press no longer grows with the document:

  - `@gotipe/core`: the check for text the browser inserted after handled input reads only the
    blocks that changed; the JS engine copies only the blocks a transaction changes and keeps what
    it knows of the others (their text, decoded form and validity), and a state is parsed once;
    `before` and `after` of a `transaction` event are decoded when a listener reads them.
  - `@gotipe/react`: a block drawn by the built-in views is drawn again only when it changes, the
    caret enters or leaves it, or the editor becomes read-only or editable. A custom view is still
    drawn on every change unless it sets `pure` (`BlockViewComponent.pure`): then it draws only from
    its props, hooks and contexts and gets `selectedBlockId` only for its own block and those under
    it.
  - `@gotipe/markdown`: `serializeMarkdown(doc, snapshot, { fingerprints })` keeps the fingerprints
    of top-level blocks between calls for documents whose blocks are never changed in place. The
    written text is the same.
  - `@gotipe/block-editor`: `PageEditor` writes its draft from the editor's view with kept
    fingerprints; the table cell, page heading and raw Markdown views are `pure`.

- abfad86: The image and file placeholders take options: `media={{ links, inlineErrors }}` on `BlockEditor`
  and `PageEditor` (or `MediaOptionsContext` from `@gotipe/react`). `links: false` hides "By link"
  (catalogs of `host.imageSources` stay); `inlineErrors: false` shows no failure text in the block,
  and the failures shown only there until now are reported instead: a wrong address as
  `LINK_BLOCKED`, an image changed during a crop as `ASSET_SAVE_FAILED`, a failed catalog search as
  `ASSET_RESOLVE_FAILED`. Both default to `true`: nothing changes.
- 7103833: `PageEditor` fixes:

  - A host `resolveAsset` that returns `null` now shows the image or file as unavailable, as
    `EditorHost` documents; the page used to fall back to the raw path and request it.
  - `autoFocus` comes on the frame after `onReady`, so a host that starts listening in the render
    `onReady` causes sees the first focus and selection.
  - `ref.insertBlock(kind)` with the caret in the page title inserts the block under the title
    instead of turning the title into it.
  - A `review` without `comments` no longer re-renders in a loop ("Maximum update depth exceeded").
  - An image or file placeholder whose source is not chosen yet is no longer written to the file as
    `![](<>)`; it becomes content once it has a source.

- 7103833: `PageEditor` gives the host more control without workarounds:

  - `ref.flush()` sends a draft not yet emitted to `onChange` at once and returns the Markdown;
    call it before saving. `onChange` still comes at most once a frame.
  - `ref.setMarkdown(text)` replaces the document even when `text` equals the last `markdown`
    value (for example a revert to the file on disk), as an undoable external edit without
    `onChange`.
  - `icon` and `header` draw a page head above the title in the text column (`.gotipe-page-head`).
  - `slashMenu: { commands, groups, descriptions }`: the host's commands (a list, or a function over
    the page's own), group order and labels, and an opt-in hint under each command's name.
    `BlockEditor` gets `slashGroups` and `slashDescriptions`, `SlashMenu` gets `descriptions`.
  - `reviewLayout: "auto" | "inline" | "margin"` (default `"auto"`, today's width rule).
  - `narrow={false}` (also on `BlockEditor`) keeps the wide view sizes, or the host's own, in a
    container up to 640 px wide.
  - `undoableReplace={false}` (and `setMarkdown(text, { addToHistory: false })`) loads an external
    text without an undo step: the history is cleared, e.g. while the host shows an earlier version.

- Updated dependencies [7103833]
- Updated dependencies [5d8df93]
- Updated dependencies [abfad86]
- Updated dependencies [7103833]
- Updated dependencies [7103833]
- Updated dependencies [7103833]
- Updated dependencies [7103833]
- Updated dependencies [7103833]
  - @gotipe/i18n@0.1.2
  - @gotipe/core@0.1.2
  - @gotipe/markdown@0.1.2
  - @gotipe/react@0.1.2
  - @gotipe/suggestions@0.1.2
  - @gotipe/theme@0.1.2
  - @gotipe/versions@0.1.1
