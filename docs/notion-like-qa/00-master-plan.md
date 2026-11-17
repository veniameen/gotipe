# Notion-like QA Master Plan

_Last updated: February 14, 2026_

## Goal

Make the `Notion-like Editor` tab production-stable:

- predictable block transforms via slash commands
- correct Enter/Backspace/selection behavior
- polished UI (slash menu, gutter toolbar, light/dark theme)
- regression protection through the e2e matrix

## Related documents

- `docs/notion-like-qa/DONE.md`
- `docs/notion-like-qa/TODO.md`
- `docs/notion-like-qa/01-case-matrix.md`
- `docs/notion-like-qa/02-defect-roadmap.md`
- `docs/notion-like-qa/03-exploratory-charters.md`
- `docs/notion-like-qa/04-checklist-500.md`
- `docs/notion-like-qa/05-automation-batches.md`
- `docs/notion-like-qa/report-2026-02-13-chromium.md`
- `docs/notion-like-qa/report-2026-02-14-cross-browser.md`
- `docs/notion-like-qa/report-2026-02-14-step2-parity-hardening.md`
- `docs/notion-like-qa/report-2026-02-14-planned-ui-batch.md`
- `docs/notion-like-qa/report-2026-02-14-planned-selection-batch.md`
- `docs/notion-like-qa/report-2026-02-14-planned-reliability-batch.md`
- `docs/notion-like-qa/report-2026-02-14-critical-cross-browser-pack.md`
- `docs/notion-like-qa/report-2026-02-14-backlog-hardening.md`
- `docs/notion-like-qa/report-2026-02-14-dnd-policy-hardening.md`
- `docs/notion-like-qa/report-2026-02-14-ime-policy-hardening.md`
- `docs/notion-like-qa/report-2026-02-14-selection-history-stress.md`
- `docs/notion-like-qa/report-2026-02-14-crossblock-clipboard-stress.md`
- `docs/notion-like-qa/report-2026-02-14-crossblock-nested-chains.md`
- `docs/notion-like-qa/report-2026-02-14-integrated-chaos-pack.md`
- `docs/notion-like-qa/report-2026-02-14-headed-gutter-jitter.md`

## What is already done

- Added regression tests: `e2e/notion-like-matrix.spec.ts`
- Added keyboard regression cases for the slash menu (`ArrowUp/ArrowDown/Enter`, `Escape`)
- Added an extended stress/behavior suite: `e2e/notion-like-exhaustive.spec.ts`
- Added a data-driven transform suite: `e2e/notion-like-transform-matrix.spec.ts`
- Added a nested/multi-step suite: `e2e/notion-like-nested-transform.spec.ts`
- Added a checklist-batch suite: `e2e/notion-like-checklist-001-050.spec.ts`
- Added a checklist-batch suite: `e2e/notion-like-checklist-051-100.spec.ts`
- Added a checklist-batch suite: `e2e/notion-like-checklist-101-150.spec.ts`
- Added a checklist-batch suite: `e2e/notion-like-checklist-151-200.spec.ts`
- Added a checklist-batch suite: `e2e/notion-like-checklist-201-250.spec.ts`
- Added a checklist-batch suite: `e2e/notion-like-checklist-251-300.spec.ts`
- Added a checklist-batch suite: `e2e/notion-like-checklist-301-320.spec.ts`
- Added a checklist-batch suite: `e2e/notion-like-checklist-321-350.spec.ts`
- Added a checklist-batch suite: `e2e/notion-like-checklist-351-370.spec.ts`
- Added a checklist-batch suite: `e2e/notion-like-checklist-371-390.spec.ts`
- Added a checklist-batch suite: `e2e/notion-like-checklist-391-400.spec.ts`
- Added a checklist-batch suite: `e2e/notion-like-checklist-401-425.spec.ts`
- Added a checklist-batch suite: `e2e/notion-like-checklist-426-450.spec.ts`
- Added a checklist-batch suite: `e2e/notion-like-checklist-451-475.spec.ts`
- Added a checklist-batch suite: `e2e/notion-like-checklist-476-500.spec.ts`
- Rewrote an outdated suite: `e2e/slash-menu.spec.ts`
- Fixed core transforms in list context:
  - `packages/core/src/chain.ts`
- Slash list commands moved to an idempotent set path (no unwrap when the same type is chosen):
  - `packages/core/src/chain.ts`
  - `packages/core/src/extensions/bullet-list.ts`
  - `packages/core/src/extensions/ordered-list.ts`
- Fixed the block gutter toolbar (positioning next to the content):
  - `packages/block-editor/src/components/block-editor.tsx`
- Added full light/dark styling for the slash menu:
  - `packages/theme/src/theme.css`
- Fixed caret normalization for empty todos:
  - `packages/core/src/editor.ts`
  - `packages/block-editor/src/components/slash-menu.tsx`
  - `packages/react/src/editor-content.tsx`
  - `packages/theme/src/theme.css`
- Fixed caret normalization for clicks in the left zone of `todoItem`:
  - `packages/core/src/editor.ts` (selectionchange path)
  - `e2e/notion-like-matrix.spec.ts` (new regression cases)
- Fixed `codeBlock -> list/todo` conversions (preserving text):
  - `packages/core/src/chain.ts`
- Fixed `callout -> bullet/ordered/todo` conversions (preserving text):
  - `packages/core/src/chain.ts`
- Fixed selection drift after `setContent`/programmatic range:
  - `packages/core/src/editor.ts`
  - `e2e/notion-like-nested-transform.spec.ts` (helper sync)
- Fixed stored marks being reset on spurious `selectionchange` events:
  - `packages/core/src/editor.ts` (marks at a collapsed caret are no longer lost between toggle and typing)
- Fixed preservation of nested children during lift/unwrap list transforms:
  - `packages/core/src/chain.ts`
- Improved nested list operations:
  - `packages/core/src/chain.ts` (`indent` / `outdent`)
- Added a deterministic test reset for Notion-like:
  - `apps/playground/src/templates/notion-editor.tsx` (`__GOTIPE_NOTION_EDITOR__`)
  - content reset before each e2e case
- Closed the Step 2 reference pass (Notion list-row micro behavior):
  - `docs/notion-like-qa/notion-reference-step2/00-index.md`
  - `docs/notion-like-qa/notion-reference-step2/01-list-row-micro-behavior.md`
  - `docs/notion-like-qa/notion-reference-step2/02-parity-actions.md`
- Closed the post-slash caret restore race (first-char shift):
  - `packages/block-editor/src/components/slash-menu.tsx` (rAF guard so an already changed selection is not overwritten)
  - confirmed by immediate-typing regression cases
- Closed the immediate-typing race after a click in the left zone of `todoItem`:
  - `packages/react/src/editor-content.tsx` (syncSelection runs synchronously after the range is forcibly set)
- Increased the safe list-gutter offset for the block toolbar (it no longer overlaps the checkbox):
  - `packages/block-editor/src/components/block-editor.tsx`
- Strengthened anti-flicker for the hover toolbar (`+`/drag) under real fast hover:
  - `packages/block-editor/src/components/block-editor.tsx` (`TOOLBAR_HIDE_DELAY_MS`, delayed hide policy)
- Strengthened DOM caret placement for an empty `todoItem` after slash transforms:
  - `packages/block-editor/src/components/slash-menu.tsx` (`setDomCaretInBlock` -> fallback to `[data-gotipe-todo-content]`)
- Added a targeted Step 2 parity suite:
  - `e2e/notion-like-step2-parity.spec.ts` (slash boundary + jagged hover clickability)
  - cross-browser: Chromium/Firefox/WebKit PASS
- Added a strict Step 1 parity suite (Enter/Shift+Enter/Backspace) in split format:
  - `e2e/helpers/notion-step1-parity.ts`
  - `e2e/notion-like-step1-enter-shift-parity.spec.ts`
  - `e2e/notion-like-step1-split-backspace-parity.spec.ts`
  - Chromium: `15/15` PASS
- Closed the planned core batch of the matrix:
  - `e2e/notion-like-matrix-planned-core.spec.ts`
  - cases: `SLASH-011`, `SLASH-015`, `SLASH-016`, `ENTER-010` (+ `SEL-004`)
  - cross-browser: Chromium/Firefox/WebKit PASS
- Closed the planned UI batch of the matrix:
  - `e2e/notion-like-matrix-planned-ui.spec.ts`
  - cases: `SLASH-019`, `UI-007`, `UI-008`
  - cross-browser: Chromium/Firefox/WebKit PASS
- Closed the planned selection batch of the matrix:
  - `e2e/notion-like-matrix-planned-selection.spec.ts`
  - case: `SEL-005` (mark toggle on a list item without artifacts)
  - cross-browser: Chromium/Firefox/WebKit PASS
- Closed the planned reliability batch of the matrix:
  - `e2e/notion-like-matrix-planned-reliability.spec.ts`
  - cases: `REL-001`, `REL-002`, `REL-003`
  - cross-browser: Chromium/Firefox/WebKit PASS
- Closed the cross-browser critical pack:
  - Firefox + WebKit: `134/134` PASS (critical suites)
  - cases `REL-004` / `REL-005` moved to `Automated`
- Stabilized flaky helper paths for WebKit:
  - `e2e/notion-like-matrix.spec.ts` (`placeCaretInTopLevelListItem`, `placeCaretAtStartOfBlockByMarker` via the editor API + selection poll)
  - `e2e/slash-menu.spec.ts` (a more realistic caret-distance tolerance)
- Narrowed the mobile override for the slash menu:
  - `packages/theme/src/theme.css`
  - mobile width is now limited to `min(300px, 90vw)` with no layout overflow
- Closed the transform-matrix quarantine:
  - `e2e/notion-like-transform-matrix.spec.ts` moved from `fixme` to the active run
  - stabilized WebKit by placing the caret through the API (`setSelection`) in the matrix helper
- Closed the active backlog policy pack:
  - new suites:
    - `e2e/notion-like-backlog-hardening.spec.ts`
    - `e2e/notion-like-backlog-hardening-stress.spec.ts`
  - closed `DEF-005`, `DEF-007`, `DEF-014` (+ cross-browser `DEF-006`)
  - cross-browser PASS + Chromium repeat PASS
- Closed the deep DnD policy pack:
  - new suite: `e2e/notion-like-dnd-policy.spec.ts`
  - closed `DEF-021` (complex reordering policy)
  - cross-browser PASS + Chromium repeat PASS
- Closed the IME composition baseline:
  - new suite: `e2e/notion-like-ime-policy.spec.ts`
  - closed `DEF-022` (IME composition policy baseline)
  - cross-browser PASS + Chromium repeat PASS
- Closed the selection/history large-doc baseline:
  - new suite: `e2e/notion-like-selection-history-stress.spec.ts`
  - closed `DEF-023` (selection/format/history stress)
  - cross-browser PASS + Chromium repeat PASS
- Closed the cross-block clipboard/marks baseline:
  - new suite: `e2e/notion-like-crossblock-clipboard-stress.spec.ts`
  - closed `DEF-024` (cross-block clipboard + marks chains)
  - cross-browser PASS + Chromium repeat PASS
- Closed the nested cross-block range chains gap:
  - helper: `e2e/helpers/notion-crossblock.ts`
  - new suite: `e2e/notion-like-crossblock-nested-chains.spec.ts`
  - closed `DEF-025` (nested cross-block range chains stability)
  - cross-browser PASS + Chromium repeat PASS
- Closed the integrated chaos gap (mixed nested flows):
  - helper: `e2e/helpers/notion-chaos.ts`
  - new suite: `e2e/notion-like-integrated-chaos.spec.ts`
  - closed `DEF-026` (integrated mixed loop stability)
  - cross-browser PASS + Chromium repeat PASS
- Closed the headed gutter jitter exploratory gap:
  - new suite: `e2e/notion-like-gutter-jitter-headed.spec.ts`
  - closed `DEF-027` (headed jitter clickability for `+`/drag)
  - headed cross-browser PASS + headed Chromium repeat PASS

## Work phases

### Phase 1. Core Stability

Focus:

- correct `paragraph <-> list/todo/heading` transitions via slash
- no “disappearing line” when the block type changes
- correct exit from an empty todo on Enter

Exit criteria:

- matrix keys `SLASH-*`, `ENTER-*` are green in Chromium

### Phase 2. UI & Positioning Fidelity

Focus:

- the slash menu is positioned at the caret and flips correctly
- the gutter `+` and drag handle are anchored to the block, not to the left edge of the container
- the light/dark theme looks consistent

Exit criteria:

- matrix keys `UI-*` are green
- visual discrepancies are eliminated

### Phase 3. Cross-browser Reliability

Focus:

- Chromium/Firefox/WebKit runs
- stabilization of flaky cases

Exit criteria:

- stable pass rate > 95% for the `notion-like` suites in 3 browsers

## Current run status

- Chromium matrix: `32/32` PASS  
  - `pnpm playwright test e2e/notion-like-matrix.spec.ts --project=chromium`
- Chromium exhaustive: `15 passed`, `2 skipped (fixme)`  
  - `pnpm playwright test e2e/notion-like-exhaustive.spec.ts --project=chromium`
- Chromium transform-matrix: `72/72` PASS  
  - `pnpm playwright test e2e/notion-like-transform-matrix.spec.ts --project=chromium`
- Chromium nested/multi-step: `5/5` PASS  
  - `pnpm playwright test e2e/notion-like-nested-transform.spec.ts --project=chromium`
- Chromium nested/multi-step stress: `25/25` PASS (`--repeat-each=5`)
- Chromium todo-left-zone stress: `20/20` PASS (`--grep "todo click in left zone" --repeat-each=10`)
- Chromium checklist batch `NL-001..NL-050`: `50/50` PASS
- Chromium checklist batch `NL-051..NL-100`: `50/50` PASS
- Chromium checklist batch `NL-101..NL-150`: `50/50` PASS
- Chromium checklist batch `NL-151..NL-200`: `50/50` PASS
- Chromium checklist batch `NL-201..NL-250`: `50/50` PASS
- Chromium checklist batch `NL-251..NL-300`: `50/50` PASS
- Chromium checklist batch `NL-301..NL-320`: `20/20` PASS
- Chromium checklist batch `NL-321..NL-350`: `30/30` PASS
- Chromium checklist batch `NL-351..NL-370`: `20/20` PASS
- Chromium checklist batch `NL-371..NL-390`: `20/20` PASS
- Chromium checklist batch `NL-391..NL-400`: `10/10` PASS
- Chromium checklist batch `NL-401..NL-425`: `25/25` PASS
- Chromium checklist batch `NL-426..NL-450`: `25/25` PASS
- Chromium checklist batch `NL-451..NL-475`: `25/25` PASS
- Chromium checklist batch `NL-476..NL-500`: `25/25` PASS
- Chromium checklist full run `NL-001..NL-500`: `500/500` PASS
- Chromium checklist stress-repeat (`NL-151..NL-250`, `--repeat-each=2`): `200/200` PASS
- Chromium checklist stress-repeat (`NL-251..NL-300`, `--repeat-each=2`): `100/100` PASS
- Chromium checklist stress-repeat (`NL-301..NL-350`, `--repeat-each=2`): `100/100` PASS
- Chromium checklist stress-repeat (`NL-351..NL-400`, `--repeat-each=2`): `100/100` PASS
- Chromium checklist stress-repeat (`NL-401..NL-450`, `--repeat-each=2`): `100/100` PASS
- Chromium checklist stress-repeat (`NL-451..NL-500`, `--repeat-each=2`): `100/100` PASS
- Chromium combined (`matrix + block-toolbar + block-toolbar-fast-hover + production-ux`): `79/79` PASS
- Chromium combined (`matrix + block-toolbar-fast-hover + block-toolbar + checklist-101-150`): `116/116` PASS
- Chromium combined (`matrix + block-toolbar-fast-hover + block-toolbar + checklist-101-150 + checklist-151-200 + checklist-201-250`): `216/216` PASS
- Chromium combined (`matrix + block-toolbar-fast-hover + block-toolbar + checklist-101-150 + checklist-151-200 + checklist-201-250 + checklist-251-300`): `266/266` PASS
- Chromium combined (`matrix + block-toolbar-fast-hover + block-toolbar + checklist-101-150 + checklist-151-200 + checklist-201-250 + checklist-251-300 + checklist-301-320 + checklist-321-350`): `316/316` PASS
- Chromium combined (`matrix + block-toolbar-fast-hover + block-toolbar + checklist-101-150 + checklist-151-200 + checklist-201-250 + checklist-251-300 + checklist-301-320 + checklist-321-350 + checklist-351-370 + checklist-371-390 + checklist-391-400`): `366/366` PASS
- Chromium combined (`matrix + block-toolbar-fast-hover + block-toolbar + checklist-101-150 + checklist-151-200 + checklist-201-250 + checklist-251-300 + checklist-301-320 + checklist-321-350 + checklist-351-370 + checklist-371-390 + checklist-391-400 + checklist-401-425 + checklist-426-450`): `416/416` PASS
- Chromium combined (`matrix + block-toolbar + checklist-001-050 + checklist-051-100 + checklist-101-150 + checklist-151-200 + checklist-201-250 + checklist-251-300 + checklist-301-320 + checklist-321-350 + checklist-351-370 + checklist-371-390 + checklist-391-400 + checklist-401-425 + checklist-426-450 + checklist-451-475 + checklist-476-500`): `548/548` PASS
- Chromium combined (`matrix + exhaustive + nested`): `48 passed`, `3 skipped`
- Chromium transform-matrix (`e2e/notion-like-transform-matrix.spec.ts`): `72/72` PASS
- Chromium transform-matrix repeat (`--repeat-each=2`): `144/144` PASS
- Firefox transform-matrix: `72/72` PASS
- WebKit transform-matrix: `72/72` PASS
- Planned UI matrix (`e2e/notion-like-matrix-planned-ui.spec.ts`):
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
- Planned selection matrix (`e2e/notion-like-matrix-planned-selection.spec.ts`):
  - Chromium: `1/1` PASS
  - Firefox: `1/1` PASS
  - WebKit: `1/1` PASS
- Planned reliability matrix (`e2e/notion-like-matrix-planned-reliability.spec.ts`):
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
- Chromium combined (`slash-menu + block-toolbar-fast-hover + planned-core + planned-ui + planned-selection + planned-reliability`): `35/35` PASS
- Cross-browser critical-pack:
  - Firefox + WebKit: `134/134` PASS
  - matrix remaining `Planned`: `0`
- Cross-block clipboard/marks suite (`e2e/notion-like-crossblock-clipboard-stress.spec.ts`):
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
  - Chromium repeat (`--repeat-each=3`): `9/9` PASS
- Nested cross-block chains suite (`e2e/notion-like-crossblock-nested-chains.spec.ts`):
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
  - Chromium repeat (`--repeat-each=3`): `9/9` PASS
- Chromium combined (`crossblock-clipboard + crossblock-nested + selection-history + ime + dnd`): `15/15` PASS
- Integrated chaos suite (`e2e/notion-like-integrated-chaos.spec.ts`):
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
  - Chromium repeat (`--repeat-each=3`): `9/9` PASS
- Chromium combined (`integrated-chaos + crossblock-nested + crossblock-clipboard + selection-history + ime + dnd`): `18/18` PASS
- Headed gutter jitter exploratory (`e2e/notion-like-gutter-jitter-headed.spec.ts`):
  - Chromium headed: `3/3` PASS
  - Firefox + WebKit headed: `6/6` PASS
  - Chromium headed repeat (`--repeat-each=2`): `6/6` PASS
- Chromium headed combined (`gutter-jitter-headed + integrated-chaos + crossblock-nested`): `9/9` PASS
- Block-toolbar fast-hover cross-browser revalidation (`e2e/block-toolbar-fast-hover.spec.ts`):
  - Chromium: `18/18` PASS
  - Firefox + WebKit: `36/36` PASS
- SLASH-022 / REL-007 removed from quarantine and returned to the active run
- Firefox smoke (`notion-like-matrix + block-toolbar`): `48/48` PASS
- WebKit smoke (`notion-like-matrix + block-toolbar`): `48/48` PASS
- Firefox checklist full run (`NL-001..NL-500`): `500/500` PASS
- WebKit checklist full run (`NL-001..NL-500`): `500/500` PASS

## Definition of Done

- No critical P0/P1 bugs in `Notion-like`
- All `Automated` cases from the matrix pass
- Every new bug gets an e2e or unit test
- All changes are reflected in `02-defect-roadmap.md`
