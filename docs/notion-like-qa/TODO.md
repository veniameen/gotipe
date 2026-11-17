# Notion-like TODO

_Last updated: February 14, 2026_

## Near-term priorities

- Matrix `docs/notion-like-qa/01-case-matrix.md` is fully closed (no `Planned` left).
- From here on, only coverage expansion for new bugs/regressions and stress scenarios.
- Keep auto-case progress in sync with `docs/notion-like-qa/04-checklist-500.md`.
- Continue the batch approach of 50 cases:
  - closed block: `NL-001..NL-050` (`50/50` PASS)
  - closed block: `NL-051..NL-100` (`50/50` PASS)
  - closed block: `NL-101..NL-150` (`50/50` PASS)
  - closed block: `NL-151..NL-200` (`50/50` PASS)
  - closed block: `NL-201..NL-250` (`50/50` PASS)
  - closed block: `NL-251..NL-300` (`50/50` PASS)
  - closed block: `NL-301..NL-350` (`50/50` PASS)
  - closed block: `NL-351..NL-400` (`50/50` PASS)
  - closed block: `NL-401..NL-450` (`50/50` PASS)
  - closed block: `NL-451..NL-500` (`50/50` PASS)
  - full checklist: `NL-001..NL-500` (`500/500` PASS)
- Step 2 reference pass (Notion list-row micro behavior) is closed:
  - artifacts: `output/playwright/notion-step2/...`
  - documentation: `docs/notion-like-qa/notion-reference-step2/`
- Item 1 (todo caret/selection baseline) is closed and stabilized:
  - fixed caret normalization on a click in the left zone of `todoItem`
  - added e2e cases in `e2e/notion-like-matrix.spec.ts`
  - repeat-run `--grep "todo click in left zone" --repeat-each=10`: `20/20` PASS
- Item 2 (nested/multi-step) is closed and stabilized:
  - suite `e2e/notion-like-nested-transform.spec.ts` (`5` cases) passes stably
  - repeat-run `--repeat-each=5`: `25/25` PASS
- New closed parity block:
  - `SLASH-010` taken off `fixme` and moved to `Automated`
  - added `Turn into` to the 6-dot menu, plus e2e for conversions
  - added heading placeholder flow (`/heading` -> placeholder -> typing)
- Also closed the post-slash caret restore race:
  - `packages/block-editor/src/components/slash-menu.tsx`: the rAF restore no longer overwrites the selection if the user has already started typing
  - immediate-typing regression cases are stable again
- Step 2 hardening (hover/caret parity) is closed:
  - `packages/block-editor/src/components/block-editor.tsx`: anti-flicker delayed hide for `+`/drag
  - `packages/block-editor/src/components/slash-menu.tsx`: fallback DOM caret in the `todo` text host
  - `e2e/notion-like-step2-parity.spec.ts`: cross-browser PASS + stress-repeat PASS
- Finish off the problematic edge-case scenarios:
  - `SLASH-022` / `REL-007` closed:
    - `e2e/notion-like-transform-matrix.spec.ts` taken off `fixme`
    - Chromium: `72/72` PASS + `144/144` PASS (`--repeat-each=2`)
    - Firefox: `72/72` PASS
    - WebKit: `72/72` PASS
  - closed the planned block of the matrix:
    - `SLASH-011`, `SLASH-015`, `SLASH-016`, `ENTER-010` moved to `Automated`
    - `SEL-004` moved to `Automated` (slash transform with a range selection)
    - new suite: `e2e/notion-like-matrix-planned-core.spec.ts` (`4/4` PASS in all 3 browsers)
  - closed the planned UI block of the matrix:
    - `SLASH-019`, `UI-007`, `UI-008` moved to `Automated`
    - new suite: `e2e/notion-like-matrix-planned-ui.spec.ts` (`3/3` PASS in all 3 browsers)
    - mobile slash-menu width capped at `min(300px, 90vw)` with no overflow
  - closed the selection planned case:
    - `SEL-005` moved to `Automated`
    - new suite: `e2e/notion-like-matrix-planned-selection.spec.ts` (`1/1` PASS in all 3 browsers)
  - closed the reliability planned block:
    - `REL-001`, `REL-002`, `REL-003` moved to `Automated`
    - new suite: `e2e/notion-like-matrix-planned-reliability.spec.ts` (`3/3` PASS in all 3 browsers)
  - `ENTER-009` automation closed (`Backspace` policy pinned by e2e)
  - closed the backlog policy-hardening block:
    - `e2e/notion-like-backlog-hardening.spec.ts` + `e2e/notion-like-backlog-hardening-stress.spec.ts`
    - closed `DEF-005`, `DEF-007`, `DEF-014` + cross-browser closure of `DEF-006`
    - cross-browser `12/12` PASS + Chromium repeat `8/8` PASS

## Technical backlog

- `DEF-005`, `DEF-007`, `DEF-014` closed by the hardening package (`backlog-policy` + `backlog-hardening`).
- Selection/history stress baseline on large documents closed (`e2e/notion-like-selection-history-stress.spec.ts`, cross-browser + repeat PASS).
- Cross-block clipboard/marks stress baseline closed (`e2e/notion-like-crossblock-clipboard-stress.spec.ts`, cross-browser + repeat PASS).
- Nested cross-block range chains closed (`e2e/notion-like-crossblock-nested-chains.spec.ts`, cross-browser + repeat PASS).
- Deep DnD policy for block reordering closed (`e2e/notion-like-dnd-policy.spec.ts`, cross-browser + repeat PASS).
- IME composition baseline closed (`e2e/notion-like-ime-policy.spec.ts`, cross-browser + repeat PASS).
- Mixed nested loop (`DnD + clipboard + marks + slash`) closed (`e2e/notion-like-integrated-chaos.spec.ts`, cross-browser + repeat PASS).
- Headed gutter jitter exploratory closed (`e2e/notion-like-gutter-jitter-headed.spec.ts`, headed cross-browser + repeat PASS).
- Next step for IME: native OS-level composition/manual charters (RU/JP/KR) in headed mode.
- Next step for reliability: headed exploratory charters for bubble-menu/focus-trap on fast selection drag paths.

## Cross-browser status

- Playwright Firefox/WebKit browsers are installed (`pnpm exec playwright install` done).
- Firefox full checklist run (`NL-001..NL-500`): `500/500` PASS.
- WebKit full checklist run (`NL-001..NL-500`): `500/500` PASS.

## Task sources

- 500 checklist: `docs/notion-like-qa/04-checklist-500.md`
- Automation batch plan: `docs/notion-like-qa/05-automation-batches.md`
- Defects and statuses: `docs/notion-like-qa/02-defect-roadmap.md`
