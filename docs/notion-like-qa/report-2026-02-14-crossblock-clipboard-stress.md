# Report: Cross-block Clipboard + Marks Stress (February 14, 2026)

## Scope

- Stress cross-block clipboard/selection behavior in Notion-like editor:
  - copy/paste chains on multi-block ranges
  - cut + undo/redo determinism
  - mixed loops (`selection + clipboard + marks + history`)

## New automation

- Added suite: `e2e/notion-like-crossblock-clipboard-stress.spec.ts`
- Coverage:
  - `CBM-001`: cross-block copy/paste chain keeps text and mark flow stable.
  - `CBM-002`: cross-block cut flow restores deterministically via undo/redo.
  - `CBM-003`: rapid mixed clipboard/marks/history loop keeps healthy state.

## Test runs

1. Chromium:
   - `pnpm playwright test e2e/notion-like-crossblock-clipboard-stress.spec.ts --project=chromium --workers=1`
   - Result: `3/3` PASS
2. Firefox + WebKit:
   - `pnpm playwright test e2e/notion-like-crossblock-clipboard-stress.spec.ts --project=firefox --project=webkit --workers=1`
   - Result: `6/6` PASS
3. Chromium repeat:
   - `pnpm playwright test e2e/notion-like-crossblock-clipboard-stress.spec.ts --project=chromium --workers=1 --repeat-each=3`
   - Result: `9/9` PASS
4. Combined sanity pack:
   - `pnpm playwright test e2e/notion-like-crossblock-clipboard-stress.spec.ts e2e/notion-like-selection-history-stress.spec.ts e2e/notion-like-ime-policy.spec.ts e2e/notion-like-dnd-policy.spec.ts --project=chromium --workers=1`
   - Result: `12/12` PASS

## Outcome

- `DEF-024` (cross-block clipboard + marks chain stability) closed.
- No regressions detected in adjacent selection/history, IME, and DnD hardening suites.
