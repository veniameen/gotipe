# Report: IME Composition Policy Baseline (February 14, 2026)

## Scope

- Harden composition-input behavior in Notion-like:
  - paragraph composition insert
  - todo composition + Enter flow
  - slash-transform + composition + undo/redo stability

## New automation

- Added suite: `e2e/notion-like-ime-policy.spec.ts`
- Coverage:
  - `IME-001`: composition insert in paragraph appends text without state corruption.
  - `IME-002`: composition in todo keeps Enter behavior and healthy tree.
  - `IME-003`: slash transform + composition + undo/redo stays consistent.

## Test runs

1. Chromium:
   - `pnpm playwright test e2e/notion-like-ime-policy.spec.ts --project=chromium --workers=1`
   - Result: `3/3` PASS
2. Firefox + WebKit:
   - `pnpm playwright test e2e/notion-like-ime-policy.spec.ts --project=firefox --project=webkit --workers=1`
   - Result: `6/6` PASS
3. Chromium repeat:
   - `pnpm playwright test e2e/notion-like-ime-policy.spec.ts --project=chromium --workers=1 --repeat-each=3`
   - Result: `9/9` PASS
4. Combined sanity with adjacent hardening suites:
   - `pnpm playwright test e2e/notion-like-ime-policy.spec.ts e2e/notion-like-dnd-policy.spec.ts e2e/notion-like-backlog-hardening.spec.ts e2e/notion-like-backlog-hardening-stress.spec.ts e2e/notion-like-step2-parity.spec.ts --project=chromium --workers=1`
   - Result: `12/12` PASS

## Outcome

- `DEF-022` (IME composition policy baseline) closed.
- No regressions detected in DnD/step2/backlog-hardening flows.
