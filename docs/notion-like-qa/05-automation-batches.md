# Notion-like Automation Batches

_Last updated: February 14, 2026_

## Goal

Move `docs/notion-like-qa/04-checklist-500.md` from manual control to stable automation, by priority.

## Batch plan

### Batch 1 (P0 core, 80-100 cases)

- Areas: `A`, `B`, `C`, `E`
- Minimum set:
  - caret in todo after slash
  - basic Enter/Backspace transitions
  - slash transform for `paragraph/bullet/ordered/todo`
  - checkbox alignment + spacing
- Result:
  - `notion-like-matrix.spec.ts` + `notion-like-exhaustive.spec.ts`
  - `e2e/notion-like-step2-parity.spec.ts` (targeted UI parity hardening):
    - slash boundary behavior for `bullet/todo` rows
    - jagged fast-hover clickability for `+` and the drag handle
    - cross-browser PASS (Chromium/Firefox/WebKit)
    - stress repeat (`--repeat-each=5`) PASS in Chromium/WebKit
  - current minimum coverage: `39` auto cases in Chromium
  - added a separate batch suite `e2e/notion-like-checklist-001-050.spec.ts` (`50/50` PASS)
  - added a separate batch suite `e2e/notion-like-checklist-051-100.spec.ts` (`50/50` PASS)
  - added a separate batch suite `e2e/notion-like-checklist-101-150.spec.ts` (`50/50` PASS)
  - added a separate batch suite `e2e/notion-like-checklist-151-200.spec.ts` (`50/50` PASS)
  - added a separate batch suite `e2e/notion-like-checklist-201-250.spec.ts` (`50/50` PASS)
  - added a separate batch suite `e2e/notion-like-checklist-251-300.spec.ts` (`50/50` PASS)
  - added a separate batch suite `e2e/notion-like-checklist-301-320.spec.ts` (`20/20` PASS)
  - added a separate batch suite `e2e/notion-like-checklist-321-350.spec.ts` (`30/30` PASS)
  - added a separate batch suite `e2e/notion-like-checklist-351-370.spec.ts` (`20/20` PASS)
  - added a separate batch suite `e2e/notion-like-checklist-371-390.spec.ts` (`20/20` PASS)
  - added a separate batch suite `e2e/notion-like-checklist-391-400.spec.ts` (`10/10` PASS)
  - added a separate batch suite `e2e/notion-like-checklist-401-425.spec.ts` (`25/25` PASS)
  - added a separate batch suite `e2e/notion-like-checklist-426-450.spec.ts` (`25/25` PASS)
  - added a separate batch suite `e2e/notion-like-checklist-451-475.spec.ts` (`25/25` PASS)
  - added a separate batch suite `e2e/notion-like-checklist-476-500.spec.ts` (`25/25` PASS)
  - total across checklist batches: `500/500` PASS (`NL-001..NL-500`)
  - full checklist run (`e2e/notion-like-checklist-*.spec.ts`): `500/500` PASS
  - stress repeat `NL-251..NL-300` (`--repeat-each=2`): `100/100` PASS
  - stress repeat `NL-301..NL-350` (`--repeat-each=2`): `100/100` PASS
  - stress repeat `NL-351..NL-400` (`--repeat-each=2`): `100/100` PASS
  - stress repeat `NL-401..NL-450` (`--repeat-each=2`): `100/100` PASS
  - stress repeat `NL-451..NL-500` (`--repeat-each=2`): `100/100` PASS
  - the Chromium-only run is mandatory in CI
  - status: **Completed**

### Batch 2 (Transform matrix, top-level transitions)

- Area: `D` (the whole transform matrix)
- Approach:
  - data-driven tests (source x target)
  - validation: block type, text preservation, caret position
- Result:
  - separate spec: `e2e/notion-like-transform-matrix.spec.ts`
  - `SLASH-010` closed and removed from `fixme` in the matrix suite
  - `SLASH-022` closed (`72/72` PASS in Chromium/Firefox/WebKit)
  - `SLASH-021` closed and removed from `fixme` in the matrix suite
  - `REL-007` closed (`144/144` PASS in Chromium with `--repeat-each=2`)
  - status: **Completed**

### Batch 2.1 (Nested / Multi-step baseline)

- Area: nested transforms + list structure stability
- Result:
  - `e2e/notion-like-nested-transform.spec.ts`
  - current baseline: `5/5` PASS
  - stress repeat: `25/25` PASS (`--repeat-each=5`)
  - covers nested slash transforms and the `Tab/Shift+Tab` structure

### Batch 3 (Formatting/History, 70 cases)

- Areas: `F`, `G`
- Approach:
  - e2e for selection retention and mark toggles
  - undo/redo scenarios after transforms
- Result:
  - separate spec for selection + history
  - first slice closed:
    - `e2e/notion-like-matrix-planned-core.spec.ts`
    - `SLASH-015` (marks in list item), `SLASH-016`/`SEL-004` (range selection + slash), `ENTER-010` (undo/redo after slash)
    - cross-browser PASS (Chromium/Firefox/WebKit)
  - second slice closed:
    - `e2e/notion-like-matrix-planned-selection.spec.ts`
    - `SEL-005` (mark toggle on a `bullet/ordered/todo` item with no text or structural artifacts)
    - cross-browser PASS (Chromium/Firefox/WebKit)
  - third slice closed:
    - `e2e/notion-like-matrix-planned-reliability.spec.ts`
    - `REL-001` (50 slash transforms), `REL-002` (paste+slash+undo chain), `REL-003` (fast typing + Enter mash)
    - cross-browser PASS (Chromium/Firefox/WebKit)

### Batch 4 (Layout/Theme/Responsive, 40 cases)

- Areas: `H`, `I`
- Approach:
  - viewport snapshots + DOM metrics
  - light/dark and keyboard navigation checks
- Result:
  - first slice closed:
    - `e2e/notion-like-matrix-planned-ui.spec.ts`
    - `SLASH-019` (flip above near viewport bottom)
    - `UI-007` (mobile width behavior)
    - `UI-008` (long command title ellipsis)
    - cross-browser PASS (Chromium/Firefox/WebKit)
  - the mobile override for the slash menu is capped at `min(300px, 90vw)`:
    - `packages/theme/src/theme.css`
  - cross-browser critical pack closed:
    - `pnpm playwright test e2e/notion-like-matrix.spec.ts e2e/slash-menu.spec.ts e2e/block-toolbar-fast-hover.spec.ts e2e/notion-like-matrix-planned-core.spec.ts e2e/notion-like-matrix-planned-ui.spec.ts e2e/notion-like-matrix-planned-selection.spec.ts e2e/notion-like-matrix-planned-reliability.spec.ts --project=firefox --project=webkit`
    - `134/134` PASS
    - `REL-004` and `REL-005` closed

### Batch 5 (Backlog Policy Hardening)

- Area: `DEF-005`, `DEF-007`, `DEF-014` (+ cross-browser closure of `DEF-006`)
- Approach:
  - a separate hardening spec (<300 lines), not mixed with the old matrix suites
  - explicit policy assertions for nested transform/backspace boundaries
  - long-run mixed stress with history operations
  - repeatable check of hover toolbar (`+`/drag) interactivity in rapid passes
- Result:
  - new specs:
    - `e2e/notion-like-backlog-hardening.spec.ts`
    - `e2e/notion-like-backlog-hardening-stress.spec.ts`
  - Chromium: `4/4` PASS
  - Firefox: `4/4` PASS
  - WebKit: `4/4` PASS
  - Chromium repeat (`--repeat-each=2`): `8/8` PASS
  - combined regression (`block-toolbar-fast-hover + step2-parity + backlog-policy + backlog-hardening`): `27/27` PASS
  - status: **Completed**

### Batch 6 (Deep DnD Policy)

- Area: block-toolbar drag reordering policy in Notion-like
- Approach:
  - a dedicated suite (<300 lines) with no fallback to a direct `moveBlock`
  - checks for deep subtree retention when moving complex list blocks
  - checks for `undo/redo` after drag
  - stress with alternating drags across the top/bottom edges
  - case: drag right after a slash transform + immediate typing
- Result:
  - new spec: `e2e/notion-like-dnd-policy.spec.ts`
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
  - Chromium repeat (`--repeat-each=3`): `9/9` PASS
  - combined regression (`block-toolbar-fast-hover + step2-parity + backlog-hardening + dnd-policy`): `27/27` PASS
  - status: **Completed**

### Batch 7 (IME Composition Policy Baseline)

- Area: composition input around slash/list boundaries
- Approach:
  - a dedicated suite (<300 lines) with composition-event injection
  - paragraph/todo/slash-transform scenarios + history checks
  - cross-browser validation + repeat on Chromium
- Result:
  - new spec: `e2e/notion-like-ime-policy.spec.ts`
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
  - Chromium repeat (`--repeat-each=3`): `9/9` PASS
  - combined regression (`ime-policy + dnd-policy + backlog-hardening + step2-parity`): `12/12` PASS
  - status: **Completed**

### Batch 8 (Selection/History Large-Doc Stress)

- Area: selection + marks + history on large documents
- Approach:
  - a dedicated suite (<300 lines)
  - bulk mark-toggle operations across paragraph/list/todo leaves
  - mixed loop: range selection + mark toggle + typing + Enter + undo/redo
  - cross-browser validation + repeat on Chromium
- Result:
  - new spec: `e2e/notion-like-selection-history-stress.spec.ts`
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
  - Chromium repeat (`--repeat-each=3`): `9/9` PASS
  - combined regression (`selection-history + ime + dnd + backlog-hardening`): `13/13` PASS
  - status: **Completed**

### Batch 9 (Cross-block Clipboard + Marks Chains)

- Area: cross-block range selection + clipboard + marks history
- Approach:
  - a dedicated suite (<300 lines)
  - copy/paste chains on cross-block ranges
  - cut flow + deterministic undo/redo validation
  - rapid mixed loop with clipboard/marks/history on a multi-block document
- Result:
  - new spec: `e2e/notion-like-crossblock-clipboard-stress.spec.ts`
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
  - Chromium repeat (`--repeat-each=3`): `9/9` PASS
  - combined regression (`crossblock-clipboard + selection-history + ime + dnd`): `12/12` PASS
  - status: **Completed**

### Batch 10 (Nested Cross-block Range Chains)

- Area: nested `listItem/todoItem` range chains + clipboard/marks/history
- Approach:
  - a shared helper for cross-block operations: `e2e/helpers/notion-crossblock.ts`
  - a dedicated suite (<300 lines) for nested range coverage
  - copy/paste, cut + deterministic undo/redo, rapid mixed loop
  - cross-browser + Chromium repeat
- Result:
  - new spec: `e2e/notion-like-crossblock-nested-chains.spec.ts`
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
  - Chromium repeat (`--repeat-each=3`): `9/9` PASS
  - combined regression (`crossblock-clipboard + crossblock-nested + selection-history + ime + dnd`): `15/15` PASS
  - status: **Completed**

### Batch 11 (Integrated Chaos: DnD + Clipboard + Marks + Slash)

- Area: a single mixed loop for nested scenarios and history stability
- Approach:
  - a shared helper for mixed actions: `e2e/helpers/notion-chaos.ts`
  - a dedicated suite (<300 lines) with real DnD through drag events
  - scenarios that mix DnD, clipboard, marks, slash transform and immediate typing in one test
  - cross-browser + Chromium repeat + combined sanity pack
- Result:
  - new spec: `e2e/notion-like-integrated-chaos.spec.ts`
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
  - Chromium repeat (`--repeat-each=3`): `9/9` PASS
  - combined regression (`integrated-chaos + crossblock-nested + crossblock-clipboard + selection-history + ime + dnd`): `18/18` PASS
  - status: **Completed**

### Batch 12 (Headed Gutter Jitter Exploratory)

- Area: real-pointer jitter reliability for the gutter controls (`+` / drag-handle)
- Approach:
  - a dedicated headed suite (<300 lines) + artifact capture
  - rapid row-to-row mouse jitter
  - immediate plus click after jitter
  - drag-handle context-menu open/close after jitter
  - headed cross-browser + headed repeat
- Result:
  - new spec: `e2e/notion-like-gutter-jitter-headed.spec.ts`
  - Chromium headed: `3/3` PASS
  - Firefox + WebKit headed: `6/6` PASS
  - Chromium headed repeat (`--repeat-each=2`): `6/6` PASS
  - Chromium headed combined (`gutter-jitter-headed + integrated-chaos + crossblock-nested`): `9/9` PASS
  - artifacts: `output/playwright/notion-like-headed-gutter-jitter/` + `...-results/**/trace.zip`
  - status: **Completed**

## CI gating

- PR gate 1: Chromium + Batch 1
- PR gate 2: Chromium + Batch 1/2/3
- Nightly: full suite + Firefox/WebKit

## Current environment constraints

- Playwright Firefox/WebKit browsers are installed.
- Firefox full checklist run (`NL-001..NL-500`): `500/500` PASS.
- WebKit full checklist run (`NL-001..NL-500`): `500/500` PASS.

## Progress tracking

- Source of truth for cases: `docs/notion-like-qa/04-checklist-500.md`
- Defect status: `docs/notion-like-qa/02-defect-roadmap.md`
- Master coordination: `docs/notion-like-qa/00-master-plan.md`
- Current stable auto coverage (Chromium): `548/548` PASS in the combined regression (`matrix + block-toolbar + checklist 001..500`).
- Cross-browser status: Firefox `500/500` PASS, WebKit `500/500` PASS (full checklist).
