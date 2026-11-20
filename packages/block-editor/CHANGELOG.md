# @gotipe/block-editor

## 0.1.5

### Patch Changes

- 5110b7e: `afterBlock?: { blockId, node } | null` on `EditorContent`, `Editor`, `BlockEditor` and
  `PageEditor` (type `BlockSlot`): the host's element in the flow of the document right after the
  top-level block that is or holds `blockId`, spaced as one more block, so the text below moves down
  for it (a field for writing with a model between paragraphs, say). A widget (`.gotipe-block-slot`,
  `data-gotipe-widget`): not part of the text, offsets or file; it keeps its element as it moves to
  another block. In `BlockEditor` and `PageEditor` its keys and input stay the host's, as with an
  inline page icon.
- Keys pressed in a host's element inside the page (an inline page icon, `afterBlock`) are no
  longer stopped there: the editor still takes none of them, and the host's own listeners on
  `document` and `window` (shortcuts, a hint of the keys held) now see them. Input events still
  stop at the element. The element is marked `data-gotipe-host`, and the editor's own listeners
  on the document skip its keys: an open slash, block, formatting or table menu, the AI bar's ⌘J,
  find's ⌘F, Enter on a formula and Escape of a review card.
- The page's review shows proposals that are still being written (`ReviewProposal.live`): the
  whole text at once, without the reveal, growing in place as the host gives longer texts under
  the same `id`; the same `id` without `live` is then an ordinary proposal, not revealed again
  and in the same elements. A growing proposal takes no decision: its card has no Accept or
  Reject (`.gotipe-review-card[data-live]`), `ReviewApi.accept` and `reject` resolve to `false`
  for it, and the default “Accept all” and “Reject all” pass it over. Markdown its end leaves
  unfinished is shown as text and changes nothing around it (a mark without its pair, a link; a
  table comes whole once its head and delimiter rows are, and grows by whole rows; an open code
  block holds the code so far; CRLF line ends too), and the spaces its text ends with stay while
  it grows, so its end, the caret and the cursor are after them (a space with no room at a line's
  end hangs there and starts no new line). Proposals that insert at one point stand by
  `ReviewProposal.order`. Its typing caret (`.gotipe-sug-live-caret`, drawn when a host gives
  `--gt-sug-live-caret-width`; without a width nothing is drawn or measured for it) is drawn with
  the lane cursors at its cursor's point: just after the last character of the text, on the row
  of the text's last piece. After inline code both stand inside the code's plate, after its last
  letter, on the text's row (the cursor used to stand by the code's smaller type, a pixel lower,
  and the caret after the plate).
- Lane cursors: a lane has as many as it is given (`LaneCursor.id`), each with its own `name` on
  the flag and `compact` for a flag in one line (`data-compact`). The cursor of a growing
  proposal stands where its text will start while it has none, and goes to the text's new end
  over `--gt-lane-cursor-move` when the text moved it (`data-glide`). A scroll of the page or
  a move of the page's edges takes it along at once; a scroll elsewhere on the screen does not
  end its glide. The cursors are placed again, at once, when web fonts have loaded
  (`document.fonts`): a font that came after them used to leave them where the text stood in the
  fallback font. Every cursor says on which side its flag has room (`data-chip-side="right"`, or
  `"left"` when the flag would cross the page's right edge; kept at the edge until the flag fits
  right of the cursor with room to spare; found again when the cursor or the page's edge moves;
  physical sides, not mirrored on a right-to-left page): the theme puts a compact flag left of
  its cursor then.
- The review binds and draws only what changed: a proposal or a comment that is as it was keeps
  its decorations, the editor's `review` layer is not set again for the same decorations, and
  `onStatesChange` is called only when a state changed.
- 484513c: The page title with an inline icon (`iconPlacement="inline"`): its accessible name is the title's
  text alone (the prompt when it is empty), no longer prefixed by the icon's own name, and the empty
  title's prompt starts after the icon instead of under it (`--gt-page-icon-inline` +
  `--gt-page-icon-inline-gap`, as the text).
- 2c6a867: The pointer lane cursor (`reviewLaneCursor="pointer"`) is placed and drawn by the host:
  `--gt-lane-pointer-at` (`0px`) sets where the tip stands in the row (`100%` is its bottom) and the
  name chip moves with it; `--gt-lane-pointer-outline` (`currentColor`) and
  `--gt-lane-pointer-outline-width` (unset: `--gt-icon-stroke`) outline the built-in arrow, for
  instance in the page's colour. `PageEditor`'s `reviewLanePointer?: ReactNode` draws the host's own
  arrow instead of the built-in one (`span.gotipe-lane-pointer`, in the lane's colour), and
  `--gt-lane-pointer-tip-x`/`-tip-y` (unset: the built-in arrow's 3/16 and 1.75/16 of the size) say
  where its tip lies in its box. Defaults draw the cursor as in 0.1.4.
- 3008901: A page bookmark follows its text into the new block when its block is split (Enter) and into the
  block before when two blocks are joined. A lost bookmark (its block gone or replaced) comes back
  once its block's text is as it was, so it survives showing another version with `setMarkdown` and
  restoring the current one, or an undo.
- a88ffed: `PageEditorHandle.bookmark(point?, bias?)` keeps a place (the caret's by default) that follows edits
  until `release()`: `resolve()` gives `{ blockId, offset }` now, or `null` once the text around it or
  its block is gone; text typed right at it goes before it (`"after"`, default) or after it
  (`"before"`). `markdownOffset(point, bias?)` gives a point's offset in `getMarkdown()`'s text, past
  or before a mark's delimiters at its edge. Types `PageBookmark`, `TextPoint`.
- 7730811: The review card on a narrow page (`reviewCardPlacement`) is placed from its measured height:
  `"above"` keeps the card's bottom 8 px above the row for any card (it used to assume 188 px, so a
  short card hung far above its row and a tall one covered it), and `"below"` turns above the row by
  the same measured rule when the window has no room below. `@gotipe/react`'s `FloatingPlacement`
  gains `"top-start"`: above the anchor, aligned to its left edge, below it when there is no room.
- 824f832: A proposed new block (a task or list item, say) opens its card at its text's lines
  (`.gotipe-sug-block-ins-text`) rather than at the block's taller box, so `--gt-review-card-gap` is
  measured from the text as for an edit's marks.
- a5b9de4: A suggestion that edits a list item opens its card at that row's marks (`.gotipe-sug-del`,
  `.gotipe-sug-ins`) instead of at the whole changed list; a block stands for the card only when the
  text has no mark. `--gt-review-card-gap` (8 px) sets the card's space to its row above or below it.
- 27f2aba: `textOffsetToMd(map, blockId, offset, bias?)` takes a `bias` like `mdOffsetToText`: at the edge of
  a mark, `"after"` (default, as before) stands past its delimiters, `"before"` before them, so the
  end of a selected `**bold**` no longer takes the closing `**`. New `textRangeToMd(map, from, to)`
  maps a text range to `{ start, end }` in the Markdown with no delimiters at its edges.
  `PageEditorHandle.selectionMarkdownRange()` returns the editor's selection as such a range in
  `getMarkdown()`'s text (selected blocks whole; `null` when the selection is not in the file).
- Updated dependencies [5110b7e]
- Updated dependencies [c4b13c7]
- Updated dependencies [484513c]
- Updated dependencies [2c6a867]
- Updated dependencies [0ea7f50]
- Updated dependencies [7730811]
- Updated dependencies [a5b9de4]
- Updated dependencies [27f2aba]
  - @gotipe/react@0.1.5
  - @gotipe/suggestions@0.1.3
  - @gotipe/theme@0.1.5
  - @gotipe/markdown@0.1.3
  - @gotipe/core@0.1.5
  - @gotipe/versions@0.1.1

## 0.1.4

### Patch Changes

- `PageEditor` calls the host's `saveAsset` and `resolveAsset` as its methods (a host object or class
  keeps its `this`). Clicks on an inline page icon reach the page again, so the editor's open menus
  close on them; keys and input still stop at the icon. With `reviewCardPlacement: "above"` and no
  room above or below, the card stays in the window.

- 280494d: `iconPlacement="inline"`: the icon's wrapper is no longer `aria-hidden`, so a host's icon button
  stays accessible, and its pointer and key events (mousedown, pointerdown, click, keydown,
  beforeinput, input) stop at the wrapper: clicking it or pressing Enter or Backspace in it does not
  move the caret, select or edit the title. It stays outside the title's text and the Markdown.
- 21cfed4: `PageEditor`'s `reviewCardPlacement?: "below" | "above"` (default `"below"`, today's behavior):
  where a review card by the text opens when there is no room beside it. `"above"` opens it above
  the row, below it when the window has no room above. `ReviewLayer` takes `cardPlacement`; type
  `ReviewCardPlacement`.
- 2fde80e: `PageEditor`'s `reviewLaneCursor?: "caret" | "pointer"` (default `"caret"`, today's caret with a
  flag): `"pointer"` draws a lane's cursor as an arrow pointer at the same place, its name chip below
  right of the tip, in the lane's colour (`.gotipe-lane-cursor[data-variant="pointer"]`,
  `.gotipe-lane-pointer`). Tokens `--gt-lane-pointer-size` (16 px), `--gt-lane-pointer-chip-x`
  (10 px), `--gt-lane-pointer-chip-y` (14 px), `--gt-lane-pointer-chip-radius`
  (`var(--gt-radius-inline)`). `ReviewLayer` takes `laneCursor`; type `ReviewLaneCursor`; `PageIcon`
  has a `pointer` glyph.
- 19cfd7f: Russian `review.staleText` keeps «не» with the next word (a no-break space), so the line never
  ends on the particle.
- Updated dependencies [4649fd9]
- Updated dependencies [2fde80e]
- Updated dependencies [10078d3]
- Updated dependencies [10078d3]
- Updated dependencies [10078d3]
- Updated dependencies [10078d3]
- Updated dependencies [10078d3]
  - @gotipe/core@0.1.4
  - @gotipe/react@0.1.4
  - @gotipe/theme@0.1.4
  - @gotipe/suggestions@0.1.2
  - @gotipe/versions@0.1.1

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
  `--gt-page-icon-inline-gap`), outside the title's text and the file.
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
