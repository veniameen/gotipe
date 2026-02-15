# Report: Selection/History Large-Doc Stress (February 14, 2026)

## Scope

- Stress selection/formatting/history behavior on large Notion-like documents:
  - mass mark toggles across paragraph/list/todo leaves
  - mixed loops (`selection + mark + typing + Enter + undo/redo`)
  - tree health and mark integrity after stress chains

## New automation

- Added suite: `e2e/notion-like-selection-history-stress.spec.ts`
- Coverage:
  - `SELH-001`: bulk mark toggles across large doc keep mark integrity and history.
  - `SELH-002`: list/todo mark toggles with typing remain stable through undo/redo.
  - `SELH-003`: rapid mixed selection/mark/typing loop keeps healthy state.

## Test runs

1. Chromium:
   - `pnpm playwright test e2e/notion-like-selection-history-stress.spec.ts --project=chromium --workers=1`
   - Result: `3/3` PASS
2. Firefox + WebKit:
   - `pnpm playwright test e2e/notion-like-selection-history-stress.spec.ts --project=firefox --project=webkit --workers=1`
   - Result: `6/6` PASS
3. Chromium repeat:
   - `pnpm playwright test e2e/notion-like-selection-history-stress.spec.ts --project=chromium --workers=1 --repeat-each=3`
   - Result: `9/9` PASS
4. Combined sanity with adjacent hardening suites:
   - `pnpm playwright test e2e/notion-like-selection-history-stress.spec.ts e2e/notion-like-ime-policy.spec.ts e2e/notion-like-dnd-policy.spec.ts e2e/notion-like-backlog-hardening.spec.ts e2e/notion-like-backlog-hardening-stress.spec.ts --project=chromium --workers=1`
   - Result: `13/13` PASS

## Outcome

- `DEF-023` (selection/format/history stress on large docs) closed.
- No regressions detected in IME/DnD/backlog hardening flows.
