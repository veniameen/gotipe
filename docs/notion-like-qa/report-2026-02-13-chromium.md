# Notion-like Chromium E2E Report

_Date: February 13, 2026_

## Environment

- Browser: Chromium (Playwright)
- App: `http://localhost:5173` (Notion-like tab)

## Executed Suites

1. `pnpm playwright test e2e/notion-like-matrix.spec.ts --project=chromium --workers=1`
- Result: PASS
- Stats: `28 passed`, `1 skipped(fixme)`

2. `pnpm playwright test e2e/notion-like-exhaustive.spec.ts --project=chromium --workers=1`
- Result: PASS
- Stats: `15 passed`, `2 skipped(fixme)`

3. `pnpm playwright test e2e/notion-like-matrix.spec.ts e2e/notion-like-exhaustive.spec.ts e2e/notion-like-nested-transform.spec.ts --project=chromium --workers=1`
- Result: PASS
- Stats: `48 passed`, `3 skipped(fixme)`

4. `pnpm playwright test e2e/notion-like-matrix.spec.ts --project=chromium --workers=1 --grep "immediate typing" --repeat-each=10`
- Result: PASS
- Stats: `30/30`

5. `pnpm playwright test e2e/notion-like-nested-transform.spec.ts --project=chromium --workers=1 --repeat-each=5`
- Result: PASS
- Stats: `25/25`

6. `pnpm playwright test e2e/notion-like-matrix.spec.ts e2e/notion-like-exhaustive.spec.ts e2e/notion-like-transform-matrix.spec.ts e2e/notion-like-nested-transform.spec.ts --project=chromium --workers=1`
- Result: PASS
- Stats: `48 passed`, `75 skipped(fixme/quarantine)`

7. `pnpm playwright test e2e/notion-like-matrix.spec.ts --project=chromium --workers=1 --grep "todo click in left zone" --repeat-each=10`
- Result: PASS
- Stats: `20/20`

8. `pnpm playwright test e2e/notion-like-checklist-001-050.spec.ts --project=chromium --workers=1`
- Result: PASS
- Stats: `50/50`

9. `pnpm playwright test e2e/notion-like-checklist-051-100.spec.ts --project=chromium --workers=1`
- Result: PASS
- Stats: `50/50`

10. `pnpm playwright test e2e/notion-like-checklist-001-050.spec.ts --project=chromium --workers=1` (post-helper regression check)
- Result: PASS
- Stats: `50/50`

11. `pnpm playwright test e2e/block-toolbar-fast-hover.spec.ts --project=chromium --workers=1`
- Result: PASS
- Stats: `18/18`

12. `pnpm playwright test e2e/block-toolbar.spec.ts e2e/nl-471-480-gutter-drag.spec.ts --project=chromium --workers=1`
- Result: PASS
- Stats: `24/24`

## Key Coverage Confirmed

- Slash menu behavior: open, filter, keyboard nav, light/dark theme.
- Slash transforms between paragraph/list/todo/heading/code/divider (baseline matrix + exhaustive).
- Enter/Backspace semantics in list/todo/code.
- Code block regressions:
  - Enter inserts newline inside same block.
  - Escape exits to paragraph after block.
- Todo caret/checkbox alignment behavior.
- Todo left-zone click normalization (caret stays in content host, not left of checkbox).
- Mixed create/change/delete stress operations.
- Checklist batch `NL-001..NL-050` is fully automated in a separate spec.
- Checklist batch `NL-051..NL-100` is fully automated in a separate spec.
- Fast-hover reliability of the gutter toolbar (`+` and drag handle) is covered by a separate stress suite:
  - fast mouse movement across all main top-level blocks
  - check that `+` and the drag handle stay clickable after fast hover
  - a separate case for custom `orderedList` (outside the default RICH_CONTENT)
- Fast post-slash immediate typing (`SLASH-021`) stabilized and verified repeat-run.
- Nested slash transform and nested Backspace policy are stabilized (repeat-run `25/25`).

## Known Gaps

- `SLASH-010` (slash at the start of a non-empty line) remains `fixme`.
- `SLASH-022` / `REL-007`: the transform-matrix suite remains quarantined (`fixme`).
- Firefox/WebKit not executed in this environment (binaries missing).

## Newly fixed regressions (validated)

- `SLASH-021`: immediate typing after a slash item no longer loses the first character.
- `codeBlock -> bullet/ordered/todo`: the line text is preserved.
- `Enter` in a code block no longer duplicates the block.
- `setContent` no longer leaves the selection on a stale blockId.
- `beforeinput` path honors the current DOM selection (no immediate-typing regression).
- `todoItem` click-left selection is no longer pinned to `li` offset 0:
  - `selectionchange` path normalizes the caret into `data-gotipe-todo-content`.
- Hover gutter regression:
  - the block under the cursor is found via a point-based hit test (`elementsFromPoint`) plus a nearest-by-Y fallback
  - the toolbar stays stable during fast mouse movement in the left gutter
