# Notion-like Defect Roadmap

_Last updated: February 14, 2026_

## Critical (closed in this iteration)

### DEF-001: Line disappearing on slash transitions between list/todo

Symptom:

- on `todo -> bullet` or similar transitions the line disappeared or the tree became invalid

Cause:

- `toggleList` used a `setBlockType(listType)` fallback at the item level
- this could create invalid type combinations in the tree

Fix:

- `packages/core/src/chain.ts`
- in-place conversion of the list type + item types
- correct lift of a list item into a top-level block on `setBlockType("paragraph" | "heading" | ...)`
- an idempotent set path for lists was added for slash commands:
  - choosing `Bullet/Numbered/To-do` on a list that already has that list type no longer unwraps it into a paragraph

Coverage:

- `e2e/notion-like-matrix.spec.ts` (`SLASH-004..SLASH-010`)

### DEF-002: Left toolbar (`+` and drag) "stuck" to the left edge of the container

Symptom:

- the controls visually drifted into the empty left area, not next to the block

Cause:

- positioning was relative to the container (`left: 0`) with no binding to the content column

Fix:

- `packages/block-editor/src/components/block-editor.tsx`
- `left` is computed from a fixed rail position relative to `data-gotipe-content`
- in list/todo scenarios the hover anchor is computed per row (`listItem`/`todoItem`), not per list container
- the fallback for the left gutter remaps the list container to the nearest item by `Y`, so the toolbar does not "stick" to the first row
- the following were separated:
  - `anchorBlockId` (visual positioning by row)
  - `actionBlockId` (toolbar actions on the top-level block)

Coverage:

- `e2e/notion-like-matrix.spec.ts` (`UI-006`)
- `e2e/notion-like-checklist-321-350.spec.ts` (`NL-321`, `NL-349`)
- `e2e/notion-like-step2-parity.spec.ts`
  - `toolbar uses fixed X rail across block types and item rows`
  - `toolbar tracks each list item row, not only list container top`
- `e2e/block-toolbar-fast-hover.spec.ts` (updated for the fixed-rail contract)

### DEF-003: Slash menu was dark-styled only

Symptom:

- in the light theme the menu stayed dark (hardcoded color)

Cause:

- the menu colors were set statically

Fix:

- `packages/theme/src/theme.css`
- `--gt-slash-*` token variables were introduced for light/dark modes

Coverage:

- `e2e/notion-like-matrix.spec.ts` (`UI-004`, `UI-005`)

### DEF-004: Slash did not open at the start of a non-empty line

Symptom:

- typing `/` at the start of an already filled line did not open the menu

Cause:

- slash open depended on the `^/$` input rule, which fires only for a completely empty block

Fix:

- `packages/core/src/editor.ts`
- a runtime `openSlashMenu` trigger was added for typing `/` at a valid caret position

Coverage:

- `e2e/notion-like-matrix.spec.ts` (`SLASH-010`)
- current status: **Closed** (`Automated`, `PASS`)

### DEF-008: Caret in an empty todo ended up to the left of the checkbox

Symptom:

- after `/todo` the caret could remain in the list container (or at the left edge of the item)
- actual typing started "suddenly" to the right of the checkbox only after the first character

Cause:

- the selection after a slash command could drift into the `todoList` container
- restore and selection sync did not always force the point back into the `todoItem` text host
- on a click in the left zone of a `todoItem` the browser could leave the caret at `li` offset `0`
  (visually left of the checkbox) until the first character was typed

Fix:

- `packages/core/src/editor.ts`
  - list container -> list item normalization in `resolvePosition`
  - `resolveDomPoint` normalization of a list container to its first item
  - the `selectionchange` path now normalizes a collapsed caret for `todoItem`
    (if the caret ended up outside `data-gotipe-todo-content`, it is forcibly moved into the text host)
- `packages/block-editor/src/components/slash-menu.tsx`
  - post-command selection normalization + forced DOM caret placement
- `packages/react/src/editor-content.tsx`
  - an explicit `data-gotipe-todo-content` host + `contentEditable={false}` on the checkbox

Coverage:

- `e2e/notion-like-matrix.spec.ts` (`ENTER-011`, `UI-009`)
- `e2e/notion-like-matrix.spec.ts`
  - `todo click in left zone normalizes caret after checkbox (empty item)`
  - `todo click in left zone normalizes caret after checkbox (item with text)`
  - repeat run `--repeat-each=10`: `20/20` PASS

### DEF-009: Enter in a code block duplicated the block instead of adding a new line

Symptom:

- in a `codeBlock`, Enter created an extra code block (it looked like duplication)

Cause:

- `insertParagraph` always ran `splitBlock`, with no separate behavior for `codeBlock`

Fix:

- `packages/core/src/editor.ts`
  - a branch for `codeBlock` was added to `beforeinput(insertParagraph)`:
    Enter inserts `\\n` in the same block
- `packages/core/src/extensions/code-block.ts`
  - Escape now inserts a paragraph after the current code block and moves the caret into it

Coverage:

- `e2e/notion-like-matrix.spec.ts` (`ENTER-012`, `ENTER-013`)

### DEF-011: Slash transform `codeBlock -> list/todo` lost text

Symptom:

- when transforming a code block into `Bullet List`/`Numbered List`/`To-do List`
  the line could become empty (content was lost)

Cause:

- the top-level wrap in `toggleList` supported only `paragraph/heading`
- for `codeBlock` it used a `setBlockType(listType)` fallback without correctly
  moving the text into the list item content

Fix:

- `packages/core/src/chain.ts`
  - `cloneInlineContent` was added (string/inline span -> listItem content)
  - the wrap branch in `toggleList` was extended to `codeBlock` and `blockquote`
  - `contentForTargetType` (span -> string) was added for the `listItem -> codeBlock` lift

Coverage:

- `e2e/notion-like-transform-matrix.spec.ts` (`code->bullet/ordered/todo` transitions and the reverse ones)

### DEF-012: Flakes in slash e2e caused by caret drift in a helper

Symptom:

- in the full run these cases failed intermittently:
  - `slash at line start preserves existing text`
  - `bullet->code keeps content and lands in expected block`
- on failure `/query` was typed at the end of the line instead of the start, and the slash menu did not open

Cause:

- in the e2e helper `placeCaretAtStartOfBlockByMarker` a range was set first, then `focus()` was called
- in some runs the browser collapsed the caret to the end of the block after `focus()`

Fix:

- `e2e/notion-like-matrix.spec.ts`
- `e2e/notion-like-transform-matrix.spec.ts`
- the order was changed to `focus -> setRange`, and an `expect.poll` on anchorOffset `0` was added

Coverage:

- targeted reruns:
  - `slash at line start`: `10/10` PASS
  - `bullet->code`: `10/10` PASS
- full combined run: `109/109` PASS

### DEF-010: Fast post-slash typing race (closed)

Symptom:

- when typing fast right after choosing a slash command (especially `list item -> heading`)
  the first character could be lost, or the input went to a block other than the target

Cause:

- a brief desync between the tracked selection and the DOM selection after a structural transform
- after `setContent(...)` the selection could stay on an invalid/stale `blockId`
- `beforeinput` did not always use the current DOM selection before typing

Fix:

- `packages/core/src/chain.ts`
  - a `selectionOverride` onto the inserted blockId was added for list lift
  - `run()` now explicitly applies `editor.setSelection(...)` from the override after dispatch
- `packages/core/src/editor.ts`
  - `setContent(...)` now always rebases the selection onto the first valid editable block
  - `beforeinput` now reads the DOM selection (when there is no pending restore) so it does not type into a stale block
  - the guard against a transient `selectionchange` during `pendingSelectionRestore` is kept
- `packages/block-editor/src/components/slash-menu.tsx`
  - the post-command caret lock and the fallback target resolution for list lift scenarios were strengthened
  - a guard for the `requestAnimationFrame` restore was added: if the user has already moved the caret or started typing, the restore does not overwrite the live selection
- `e2e/notion-like-nested-transform.spec.ts`
  - `editor.syncSelectionFromDOM()` was added to the helper after the programmatic range placement, to rule out a test race

Coverage:

- `e2e/notion-like-matrix.spec.ts`
  - `slash: third bullet item -> heading keeps caret on transformed row`
  - `slash: third todo item -> heading keeps caret on transformed row`
  - `slash click + immediate typing does not lose first character (heading)`
  - `slash: third bullet item -> heading + immediate typing stays on transformed row`
  - `slash: third todo item -> heading + immediate typing stays on transformed row`
- stress:
  - `workers=1`, `repeat-each=10` on the `immediate typing` group: `30/30` PASS
  - `e2e/notion-like-nested-transform.spec.ts --repeat-each=5`: `25/25` PASS
  - targeted re-check (Chromium): `todo checkbox toggle right after slash transform keeps text in place` + `slash click + immediate typing does not lose first character`: `2/2` PASS

### DEF-013: Nested list transform lost deep children (closed)

Symptom:

- on `nested listItem -> heading/paragraph` the nested child blocks could be lost
- on list unwrap (`toggle same list type`) the nested children of the items were also dropped

Cause:

- the lift branch in `setBlockType` created a new block with `children: []`
- the list unwrap branch (`toggleList`) lifted only the item's inline content, without children

Fix:

- `packages/core/src/chain.ts`
  - a deep clone tree helper for block children was added
  - on `listItem/todoItem -> non-list` lift, the trailing children are reinserted after the lifted block
  - on `list -> paragraph` unwrap, the children of each item are preserved and lifted along with it
  - `indent/outdent` were rewritten for nested list containers, without corrupting the structure

Coverage:

- `e2e/notion-like-nested-transform.spec.ts`
  - `nested slash: listItem -> heading keeps deep child text`
  - `nested slash: listItem -> paragraph keeps deep child text`
  - `nested ordered list: listItem -> heading keeps deep child text`
  - `backspace at start of second bullet item lifts it to paragraph and keeps first item in list`
  - `Tab and Shift+Tab keep nested bullet structure valid`

### DEF-015: Hover toolbar could lose interactivity when the cursor entered the toolbar itself (closed)

Symptom:

- `+` / drag-handle sometimes disappeared as the cursor moved onto them
- the toolbar appeared visually, but the click failed in fast scenarios

Cause:

- in the `onMouseMove` path the block was computed and reset even when the target was already inside the toolbar wrapper

Fix:

- `packages/block-editor/src/components/block-editor.tsx`
  - a guard was added: do not reset hover when the target is inside
    `.gotipe-block-toolbar` / `.gotipe-block-toolbar-wrapper` / `.gotipe-block-context-menu`

Coverage:

- `e2e/block-toolbar-fast-hover.spec.ts`
- `e2e/block-toolbar.spec.ts`
- combined regression (`matrix + block-toolbar + fast-hover + checklist-101-150`): `116/116` PASS

### DEF-016: Slash menu outside click could cause focus drift (closed)

Symptom:

- after a click outside the slash menu, focus moved unstably to various elements on the page

Cause:

- the outside-close path did not prevent the default `mousedown` and had no explicit capture-phase control

Fix:

- `packages/block-editor/src/components/slash-menu.tsx`
  - the outside-close handler was switched to a capture-phase `mousedown`
  - `preventDefault()` + an `editor.focus()` restore path were added

Coverage:

- `e2e/notion-like-checklist-101-150.spec.ts` (`NL-126`, `NL-134`, `NL-142`, `NL-150`)

### DEF-017: Todo left-zone click could briefly put the caret at the left edge of the item (closed)

Symptom:

- on a click to the left of the `todoItem` text, a transient caret appeared before the checkbox

Cause:

- the native mouse path sometimes set the range on the `<li>` before the post-normalization step

Fix:

- `packages/react/src/editor-content.tsx`
  - an `onMouseDown` guard for the left zone was added to `todoItem`:
    it forces the range into `[data-gotipe-todo-content]` + a synchronous `syncSelectionFromDOM()`

Coverage:

- `e2e/notion-like-matrix.spec.ts`
  - `todo click in left zone normalizes caret after checkbox (empty item)`
  - `todo click in left zone normalizes caret after checkbox (item with text)`
  - `todo checkbox is vertically aligned with text and has spacing`

### DEF-018: Slash transform `callout -> list/todo` lost the line text (closed)

Symptom:

- on `callout -> bullet/ordered/todo` the original line text could disappear

Cause:

- the top-level wrap in `toggleList` supported `paragraph/heading/blockquote/codeBlock`,
  but not `callout`
- for `callout` the `setBlockType(listType)` fallback ran, which created an
  incorrect path without an explicit `listItem` wrap

Fix:

- `packages/core/src/chain.ts`
  - `callout` was added to the safe wrap path for list transforms
  - the content is moved into `listItem/todoItem` without losing text

Coverage:

- `e2e/notion-like-checklist-301-320.spec.ts` (`NL-313..NL-315`)
- `e2e/notion-like-checklist-301-320.spec.ts` (`20/20` PASS)

## Active backlog

### DEF-005: Nested list conversion policy (closed)

Status:

- Closed (February 14, 2026)

What was pinned down:

- multi-step nested conversions `listItem <-> todoItem <-> ordered/bullet` without losing the deep subtree
- sibling items and nested children are preserved at every step

Coverage:

- `e2e/notion-like-backlog-policy.spec.ts` (`DEF-005` baseline)
- `e2e/notion-like-backlog-hardening.spec.ts` (`DEF-005` hardening policy)
- `e2e/notion-like-backlog-hardening-stress.spec.ts` (shared stress/hover hardening pack)
- Chromium: PASS
- Firefox: PASS
- WebKit: PASS
- Chromium repeat (`--repeat-each=2`): PASS

### DEF-006: Cross-browser stability (closed)

Status:

- Closed (February 14, 2026)

What was confirmed:

- critical pack in Firefox/WebKit: `134/134` PASS
- full checklist: Firefox `500/500` PASS, WebKit `500/500` PASS
- transform-matrix (including the Chromium repeat) is stable and was returned from quarantine

### DEF-007: High-frequency input stress (closed)

Status:

- Closed (February 14, 2026)

What was pinned down:

- long-run chains of `/`, Enter, Backspace, Undo/Redo do not cause DOM/state desync
- mixed stress scenarios with block type switching and history operations were checked

Coverage:

- `e2e/notion-like-exhaustive.spec.ts` (`REL-006`)
- `e2e/notion-like-matrix-planned-reliability.spec.ts` (`REL-001..REL-003`)
- `e2e/notion-like-backlog-policy.spec.ts` (`DEF-007` baseline)
- `e2e/notion-like-backlog-hardening-stress.spec.ts` (`DEF-007` long-run hardening)
- Chromium: PASS
- Firefox: PASS
- WebKit: PASS
- Chromium repeat (`--repeat-each=2`): PASS

### DEF-014: Backspace boundary policy in a list item (closed)

Status:

- Closed (February 14, 2026)

Policy:

- Backspace at `offset=0` of a non-empty `listItem/todoItem` consistently turns the line into a `paragraph`
- the behavior is covered for a top-level item, a nested list item and a todo item
- Undo/Redo after the boundary action keep the tree valid

Coverage:

- `e2e/notion-like-matrix.spec.ts` (`ENTER-009`)
- `e2e/notion-like-backlog-policy.spec.ts` (`DEF-014` baseline)
- `e2e/notion-like-backlog-hardening.spec.ts` (`DEF-014` nested + todo policy)
- Chromium: PASS
- Firefox: PASS
- WebKit: PASS

### DEF-021: Deep DnD reordering policy (closed)

Status:

- Closed (February 14, 2026)

What was pinned down:

- moving complex top-level blocks (including list/todo/code) does not break the tree
- nested children/text markers are preserved after a drag
- history after a drag (`undo/redo`) restores the order predictably
- a drag after a slash transform does not break immediate typing

Coverage:

- `e2e/notion-like-dnd-policy.spec.ts`
- Chromium: `3/3` PASS
- Firefox: `3/3` PASS
- WebKit: `3/3` PASS
- Chromium repeat (`--repeat-each=3`): `9/9` PASS

### DEF-022: IME composition policy baseline (closed)

Status:

- Closed (February 14, 2026)

What was pinned down:

- a composition insert into a paragraph does not break selection/state
- composition in a `todoItem` preserves the Enter flow and a correct structure
- composition after a slash transform (`paragraph -> bullet`) preserves type/text
- undo/redo after composition stays stable

Coverage:

- `e2e/notion-like-ime-policy.spec.ts`
- Chromium: `3/3` PASS
- Firefox: `3/3` PASS
- WebKit: `3/3` PASS
- Chromium repeat (`--repeat-each=3`): `9/9` PASS

### DEF-023: Selection/format/history stress on large docs (closed)

Status:

- Closed (February 14, 2026)

What was pinned down:

- bulk mark-toggle operations on paragraph/list/todo do not break the state
- the mixed loop (`selection + marks + typing + Enter + undo/redo`) is stable on large documents
- after stress cycles the tree stays valid and history stays predictable

Coverage:

- `e2e/notion-like-selection-history-stress.spec.ts`
- Chromium: `3/3` PASS
- Firefox: `3/3` PASS
- WebKit: `3/3` PASS
- Chromium repeat (`--repeat-each=3`): `9/9` PASS

### DEF-024: Cross-block clipboard + marks chain stability (closed)

Status:

- Closed (February 14, 2026)

What was pinned down:

- cross-block copy/paste and cut flow do not break the document structure
- mark toggles after clipboard chains stay valid
- undo/redo after cross-block operations restore the state deterministically
- the rapid mixed loop (`selection + clipboard + marks + history`) is stable

Coverage:

- `e2e/notion-like-crossblock-clipboard-stress.spec.ts`
- Chromium: `3/3` PASS
- Firefox: `3/3` PASS
- WebKit: `3/3` PASS
- Chromium repeat (`--repeat-each=3`): `9/9` PASS

### DEF-020: Slash start-line / immediate typing instability (closed)

Status:

- Closed (February 14, 2026)

What was pinned down:

- slash at the start of a line no longer loses the first character of immediate typing.
- the transform-matrix immediate typing cases were removed from `fixme` and returned to the mandatory run.
- stability was confirmed in a repeat run and cross-browser.

Coverage:

- `e2e/notion-like-transform-matrix.spec.ts`
- Chromium: `72/72` PASS
- Chromium repeat (`--repeat-each=2`): `144/144` PASS
- Firefox: `72/72` PASS
- WebKit: `72/72` PASS

### DEF-025: Nested cross-block range chains stability (closed)

Status:

- Closed (February 14, 2026)

What was pinned down:

- a range selection across nested `listItem/todoItem` leaves does not break the tree.
- nested copy/paste + mark toggles keep a valid state and structure.
- nested cut + undo/redo restores deterministically.
- the rapid mixed loop (`nested selection + clipboard + marks + history`) is stable.

Coverage:

- helper: `e2e/helpers/notion-crossblock.ts`
- `e2e/notion-like-crossblock-nested-chains.spec.ts`
- Chromium: `3/3` PASS
- Firefox: `3/3` PASS
- WebKit: `3/3` PASS
- Chromium repeat (`--repeat-each=3`): `9/9` PASS

### DEF-026: Integrated mixed-loop stability (`DnD + clipboard + marks + slash`) (closed)

Status:

- Closed (February 14, 2026)

What was pinned down:

- mixed nested scenarios with DnD/clipboard/marks/slash in one loop do not break the tree.
- after long-loop operations, block ids/structure stay valid and history stays predictable.
- slash transform + immediate typing does not lose context on a subsequent DnD/clipboard.

Coverage:

- helper: `e2e/helpers/notion-chaos.ts`
- `e2e/notion-like-integrated-chaos.spec.ts`
- Chromium: `3/3` PASS
- Firefox: `3/3` PASS
- WebKit: `3/3` PASS
- Chromium repeat (`--repeat-each=3`): `9/9` PASS

### DEF-027: Headed gutter jitter clickability (`+` / drag-handle) (closed)

Status:

- Closed (February 14, 2026)

What was pinned down:

- under aggressive mouse-path jitter the toolbar stays attached to the row.
- `+` stays clickable right after a jitter burst.
- the drag handle reliably opens/closes the context menu after jitter.

Coverage:

- `e2e/notion-like-gutter-jitter-headed.spec.ts`
- Chromium headed: `3/3` PASS
- Firefox headed: `3/3` PASS
- WebKit headed: `3/3` PASS
- Chromium headed repeat (`--repeat-each=2`): `6/6` PASS
