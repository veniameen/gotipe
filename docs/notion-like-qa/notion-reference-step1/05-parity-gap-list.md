# Step 1E: Parity Gap List (Notion vs Notion-like)

_Updated: February 14, 2026_

## Closed in this iteration

### GAP-001 (P0) — `SLASH-010`: slash at the start of a non-empty line

- Notion reference: existing text is preserved on transform.
- Was in our editor: the case was in `fixme` quarantine.
- Done:
  - `fixme` removed in `/Users/veniameen/Projects/gotipe/e2e/notion-like-matrix.spec.ts`
  - the case is included in the main run as mandatory
- Evidence:
  - `Notion-like matrix`: `32/32` PASS (Chromium)
  - case: `slash at line start preserves existing text`

### GAP-002 (P0) — No production `Turn into` in the 6-dot menu

- Notion reference: the row handle menu contains `Turn into` and allows in-place conversion.
- Was in our editor: only `Delete / Duplicate / Reset Formatting / Copy`.
- Done:
  - added the `Turn into` item and a submenu with the types:
    - `Text`, `Heading 1/2/3`, `Bullet List`, `Numbered List`, `To-do List`, `Blockquote`, `Code Block`
  - added text preservation when converting paragraph -> heading/todo
- Code:
  - `/Users/veniameen/Projects/gotipe/packages/block-editor/src/components/block-context-menu.tsx`
  - `/Users/veniameen/Projects/gotipe/packages/theme/src/theme.css`
- Evidence:
  - `Block toolbar suite`: `16/16` PASS
  - cases:
    - `Turn into converts paragraph to heading 2 and preserves text`
    - `Turn into converts paragraph to to-do list item and preserves text`

### GAP-003 (P1) — Missing placeholder for an empty heading after slash

- Notion reference: after `/heading 1` the empty block shows `Heading 1` until typing.
- Was in our editor: the placeholder was not rendered.
- Done:
  - placeholder for empty headings (`Heading 1/2/3...`)
  - e2e check that it appears and clears after typing
- Code:
  - `/Users/veniameen/Projects/gotipe/packages/react/src/editor-content.tsx`
  - `/Users/veniameen/Projects/gotipe/packages/theme/src/base.css`
- Evidence:
  - case in `notion-like-matrix`:
    - `slash: heading shows placeholder before typing and clears after input`

### GAP-004 (P0) — Checkbox check right after slash transform

- Notion reference: a checkbox toggle must not break the line's text/position.
- Done:
  - a separate e2e case for the immediate flow after `/todo`
- Evidence:
  - case:
    - `todo checkbox toggle right after slash transform keeps text in place`
  - `notion-like-matrix`: `32/32` PASS

## Remaining gaps (next iteration)

### GAP-005 (P1) — The 6-dot context menu is still simpler than Notion's

- What differs:
  - fewer ecosystem-level items (`Color`, `Comment`, `Suggest edits`, etc.)
  - simplified submenu structure.
- Plan:
  - extend the menu to the full production action matrix without breaking the current 16 e2e.

### GAP-006 (P1) — A second reference pass over list-row behavior is needed

- What remains:
  - detailed row-by-row check of handle/plus behavior specifically inside multi-line lists,
  - additional capture of caret/menu geometry in long documents.
- Plan:
  - a separate Notion step 2 capture + a mirrored autoplay scenario in our editor.

## Regression summary (this iteration)

- `pnpm playwright test e2e/notion-like-matrix.spec.ts --project=chromium --workers=1`
  - Result: `32 passed`
- `pnpm playwright test e2e/block-toolbar.spec.ts --project=chromium --workers=1`
  - Result: `16 passed`
- `pnpm playwright test e2e/notion-like-matrix.spec.ts e2e/block-toolbar-fast-hover.spec.ts e2e/block-toolbar.spec.ts e2e/editor-production-ux.spec.ts --project=chromium --workers=1`
  - Result: `79 passed`
