# Report: Deep DnD Policy Hardening (February 14, 2026)

## Scope

- Validate and harden block reordering behavior in Notion-like:
  - complex list/todo/code block reordering
  - deep subtree retention after drag
  - history correctness (`undo/redo`) after drag
  - drag stability after slash-transform + immediate typing

## New automation

- Added suite: `e2e/notion-like-dnd-policy.spec.ts`
- Coverage:
  - `DND-001`: moving complex list block preserves deep subtree and supports `undo/redo`.
  - `DND-002`: rapid alternating drag across top/bottom edges keeps healthy state.
  - `DND-003`: drag after slash transform keeps immediate typing stable.

## Test runs

1. Chromium:
   - `pnpm playwright test e2e/notion-like-dnd-policy.spec.ts --project=chromium --workers=1`
   - Result: `3/3` PASS
2. Firefox + WebKit:
   - `pnpm playwright test e2e/notion-like-dnd-policy.spec.ts --project=firefox --project=webkit --workers=1`
   - Result: `6/6` PASS
3. Chromium repeat:
   - `pnpm playwright test e2e/notion-like-dnd-policy.spec.ts --project=chromium --workers=1 --repeat-each=3`
   - Result: `9/9` PASS
4. Combined sanity with adjacent hardening/parity suites:
   - `pnpm playwright test e2e/notion-like-dnd-policy.spec.ts e2e/notion-like-backlog-hardening.spec.ts e2e/notion-like-backlog-hardening-stress.spec.ts e2e/notion-like-step2-parity.spec.ts e2e/block-toolbar-fast-hover.spec.ts --project=chromium --workers=1`
   - Result: `27/27` PASS

## Outcome

- `DEF-021` (deep DnD policy) closed.
- No regressions detected in adjacent hover/slash/backlog hardening flows.
