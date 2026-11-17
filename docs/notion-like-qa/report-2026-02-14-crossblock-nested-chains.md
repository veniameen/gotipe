# Report: Nested Cross-block Range Chains (February 14, 2026)

## Scope

- Expand stress coverage for nested range behavior beyond flat cross-block cases:
  - ranges crossing nested `listItem/todoItem` leaves
  - clipboard + mark operations on nested structures
  - deterministic history after cut/mixed loops on deep trees

## New automation

- Added helper: `e2e/helpers/notion-crossblock.ts`.
- Added suite: `e2e/notion-like-crossblock-nested-chains.spec.ts`.
- Coverage:
  - `NCB-001`: copy/paste across nested ranges keeps tree and marks stable.
  - `NCB-002`: nested cross-block cut + undo/redo restores deterministic snapshot.
  - `NCB-003`: rapid mixed nested range loop keeps healthy state.

## Test runs

1. Chromium:
   - `pnpm playwright test e2e/notion-like-crossblock-nested-chains.spec.ts --project=chromium --workers=1`
   - Result: `3/3` PASS
2. Firefox + WebKit:
   - `pnpm playwright test e2e/notion-like-crossblock-nested-chains.spec.ts --project=firefox --project=webkit --workers=1`
   - Result: `6/6` PASS
3. Chromium repeat:
   - `pnpm playwright test e2e/notion-like-crossblock-nested-chains.spec.ts --project=chromium --workers=1 --repeat-each=3`
   - Result: `9/9` PASS
4. Combined sanity pack:
   - `pnpm playwright test e2e/notion-like-crossblock-clipboard-stress.spec.ts e2e/notion-like-crossblock-nested-chains.spec.ts e2e/notion-like-selection-history-stress.spec.ts e2e/notion-like-ime-policy.spec.ts e2e/notion-like-dnd-policy.spec.ts --project=chromium --workers=1`
   - Result: `15/15` PASS

## Outcome

- Closed an additional risk gap for nested cross-block range chains.
- The tech debt item on larger mixed document size + nested range chains is now covered by automation.
