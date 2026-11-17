# Report: Integrated Chaos Pack (February 14, 2026)

## Scope

- Unified stress coverage for mixed operations in one flow:
  - nested DnD reorder
  - cross-block clipboard chains
  - mark toggles
  - slash transform with immediate typing
  - undo/redo history checks

## New automation

- Added helper: `e2e/helpers/notion-chaos.ts`.
- Added suite: `e2e/notion-like-integrated-chaos.spec.ts`.
- Coverage:
  - `CHAOS-001`: nested DnD + clipboard + marks + history chain.
  - `CHAOS-002`: long mixed loop (`DnD + clipboard + marks`) on nested document.
  - `CHAOS-003`: slash transform + immediate typing + DnD + clipboard.

## Test runs

1. Chromium:
   - `pnpm playwright test e2e/notion-like-integrated-chaos.spec.ts --project=chromium --workers=1`
   - Result: `3/3` PASS
2. Firefox + WebKit:
   - `pnpm playwright test e2e/notion-like-integrated-chaos.spec.ts --project=firefox --project=webkit --workers=1`
   - Result: `6/6` PASS
3. Chromium repeat:
   - `pnpm playwright test e2e/notion-like-integrated-chaos.spec.ts --project=chromium --workers=1 --repeat-each=3`
   - Result: `9/9` PASS
4. Combined sanity pack:
   - `pnpm playwright test e2e/notion-like-integrated-chaos.spec.ts e2e/notion-like-crossblock-nested-chains.spec.ts e2e/notion-like-crossblock-clipboard-stress.spec.ts e2e/notion-like-selection-history-stress.spec.ts e2e/notion-like-ime-policy.spec.ts e2e/notion-like-dnd-policy.spec.ts --project=chromium --workers=1`
   - Result: `18/18` PASS

## Outcome

- Closed the risk of mixed nested chains (`DnD + clipboard + marks + slash`) in a single scenario.
- The new chaos pack introduced no regressions in the existing stress/policy suites.
