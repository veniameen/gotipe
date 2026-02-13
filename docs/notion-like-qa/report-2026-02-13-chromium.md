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
- Checklist batch `NL-001..NL-050` полностью автоматизирован в отдельном spec.
- Checklist batch `NL-051..NL-100` полностью автоматизирован в отдельном spec.
- Fast-hover reliability для gutter-toolbar (`+` и drag-handle) закрыта отдельным stress suite:
  - быстрые перемещения мыши по всем основным top-level блокам
  - проверка кликабельности `+` и drag-handle после fast-hover
  - отдельный кейс custom `orderedList` (вне дефолтного RICH_CONTENT)
- Fast post-slash immediate typing (`SLASH-021`) stabilized and verified repeat-run.
- Nested slash-transform и nested backspace policy стабилизированы (repeat-run `25/25`).

## Known Gaps

- `SLASH-010` (slash в начале непустой строки) остаётся `fixme`.
- `SLASH-022` / `REL-007`: transform-matrix suite остаётся quarantined (`fixme`).
- Firefox/WebKit not executed in this environment (binaries missing).

## Newly fixed regressions (validated)

- `SLASH-021`: immediate typing после slash-item больше не теряет первый символ.
- `codeBlock -> bullet/ordered/todo`: текст строки сохраняется.
- `Enter` в code block больше не дублирует блок.
- `setContent` больше не оставляет selection на устаревшем blockId.
- `beforeinput` path учитывает актуальную DOM-selection (без регрессии immediate typing).
- `todoItem` click-left selection больше не фиксируется на `li` offset 0:
  - `selectionchange` path нормализует caret в `data-gotipe-todo-content`.
- Hover gutter regression:
  - блок под курсором определяется через point-based hit-test (`elementsFromPoint`) + nearest-by-Y fallback
  - тулбар стабильно удерживается при быстром движении мыши в левом gutter
