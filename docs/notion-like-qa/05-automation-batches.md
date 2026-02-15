# Notion-like Automation Batches

_Last updated: February 14, 2026_

## Цель

Перевести `docs/notion-like-qa/04-checklist-500.md` из ручного контроля в стабильную автоматизацию по приоритетам.

## Batch-план

### Batch 1 (P0 core, 80-100 кейсов)

- Области: `A`, `B`, `C`, `E`
- Минимальный набор:
  - caret в todo после slash
  - Enter/Backspace базовые переходы
  - slash transform для `paragraph/bullet/ordered/todo`
  - checkbox alignment + spacing
- Результат:
  - `notion-like-matrix.spec.ts` + `notion-like-exhaustive.spec.ts`
  - `e2e/notion-like-step2-parity.spec.ts` (targeted UI parity hardening):
    - slash boundary behavior для `bullet/todo` rows
    - jagged fast-hover clickability для `+` и drag-handle
    - cross-browser PASS (Chromium/Firefox/WebKit)
    - stress-repeat (`--repeat-each=5`) PASS в Chromium/WebKit
  - текущий покрытый минимум: `39` авто-кейсов в Chromium
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-001-050.spec.ts` (`50/50` PASS)
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-051-100.spec.ts` (`50/50` PASS)
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-101-150.spec.ts` (`50/50` PASS)
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-151-200.spec.ts` (`50/50` PASS)
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-201-250.spec.ts` (`50/50` PASS)
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-251-300.spec.ts` (`50/50` PASS)
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-301-320.spec.ts` (`20/20` PASS)
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-321-350.spec.ts` (`30/30` PASS)
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-351-370.spec.ts` (`20/20` PASS)
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-371-390.spec.ts` (`20/20` PASS)
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-391-400.spec.ts` (`10/10` PASS)
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-401-425.spec.ts` (`25/25` PASS)
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-426-450.spec.ts` (`25/25` PASS)
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-451-475.spec.ts` (`25/25` PASS)
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-476-500.spec.ts` (`25/25` PASS)
  - суммарно по checklist-batch: `500/500` PASS (`NL-001..NL-500`)
  - полный прогон checklist (`e2e/notion-like-checklist-*.spec.ts`): `500/500` PASS
  - стресс-повтор `NL-251..NL-300` (`--repeat-each=2`): `100/100` PASS
  - стресс-повтор `NL-301..NL-350` (`--repeat-each=2`): `100/100` PASS
  - стресс-повтор `NL-351..NL-400` (`--repeat-each=2`): `100/100` PASS
  - стресс-повтор `NL-401..NL-450` (`--repeat-each=2`): `100/100` PASS
  - стресс-повтор `NL-451..NL-500` (`--repeat-each=2`): `100/100` PASS
  - запуск только Chromium обязателен в CI
  - статус: **Completed**

### Batch 2 (Transform matrix, top-level transitions)

- Область: `D` (вся матрица transform)
- Подход:
  - data-driven тесты (source x target)
  - валидация: тип блока, сохранение текста, позиция caret
- Результат:
  - отдельный spec: `e2e/notion-like-transform-matrix.spec.ts`
  - `SLASH-010` закрыт и снят с `fixme` в matrix suite
  - `SLASH-022` закрыт (`72/72` PASS в Chromium/Firefox/WebKit)
  - `SLASH-021` закрыт и снят с `fixme` в matrix suite
  - `REL-007` закрыт (`144/144` PASS в Chromium при `--repeat-each=2`)
  - статус: **Completed**

### Batch 2.1 (Nested / Multi-step baseline)

- Область: nested transforms + list structure stability
- Результат:
  - `e2e/notion-like-nested-transform.spec.ts`
  - текущий baseline: `5/5` PASS
  - стресс-повтор: `25/25` PASS (`--repeat-each=5`)
  - покрыты nested slash-transform и `Tab/Shift+Tab` структура

### Batch 3 (Formatting/History, 70 кейсов)

- Области: `F`, `G`
- Подход:
  - e2e на сохранение выделения и mark toggles
  - сценарии undo/redo после трансформаций
- Результат:
  - отдельный spec на selection + history
  - first slice closed:
    - `e2e/notion-like-matrix-planned-core.spec.ts`
    - `SLASH-015` (marks in list item), `SLASH-016`/`SEL-004` (range selection + slash), `ENTER-010` (undo/redo after slash)
    - cross-browser PASS (Chromium/Firefox/WebKit)
  - second slice closed:
    - `e2e/notion-like-matrix-planned-selection.spec.ts`
    - `SEL-005` (mark toggle на `bullet/ordered/todo` item без текстовых/структурных артефактов)
    - cross-browser PASS (Chromium/Firefox/WebKit)
  - third slice closed:
    - `e2e/notion-like-matrix-planned-reliability.spec.ts`
    - `REL-001` (50 slash transforms), `REL-002` (paste+slash+undo chain), `REL-003` (fast typing + Enter mash)
    - cross-browser PASS (Chromium/Firefox/WebKit)

### Batch 4 (Layout/Theme/Responsive, 40 кейсов)

- Области: `H`, `I`
- Подход:
  - viewport snapshots + DOM metrics
  - проверка light/dark и keyboard navigation
- Результат:
  - первый slice закрыт:
    - `e2e/notion-like-matrix-planned-ui.spec.ts`
    - `SLASH-019` (flip above near viewport bottom)
    - `UI-007` (mobile width behavior)
    - `UI-008` (long command title ellipsis)
    - cross-browser PASS (Chromium/Firefox/WebKit)
  - mobile override для slash-menu ограничен до `min(300px, 90vw)`:
    - `packages/theme/src/theme.css`
  - cross-browser critical-pack закрыт:
    - `pnpm playwright test e2e/notion-like-matrix.spec.ts e2e/slash-menu.spec.ts e2e/block-toolbar-fast-hover.spec.ts e2e/notion-like-matrix-planned-core.spec.ts e2e/notion-like-matrix-planned-ui.spec.ts e2e/notion-like-matrix-planned-selection.spec.ts e2e/notion-like-matrix-planned-reliability.spec.ts --project=firefox --project=webkit`
    - `134/134` PASS
    - закрыты `REL-004` и `REL-005`

### Batch 5 (Backlog Policy Hardening)

- Область: `DEF-005`, `DEF-007`, `DEF-014` (+ cross-browser closure `DEF-006`)
- Подход:
  - отдельный hardening spec (<300 строк) без смешивания со старыми матричными suite
  - explicit policy assertions для nested transform/backspace boundaries
  - long-run mixed stress с history-операциями
  - повторяемая проверка интерактивности hover-toolbar (`+`/drag) в rapid passes
- Результат:
  - новые spec:
    - `e2e/notion-like-backlog-hardening.spec.ts`
    - `e2e/notion-like-backlog-hardening-stress.spec.ts`
  - Chromium: `4/4` PASS
  - Firefox: `4/4` PASS
  - WebKit: `4/4` PASS
  - Chromium repeat (`--repeat-each=2`): `8/8` PASS
  - combined regression (`block-toolbar-fast-hover + step2-parity + backlog-policy + backlog-hardening`): `27/27` PASS
  - статус: **Completed**

### Batch 6 (Deep DnD Policy)

- Область: block-toolbar drag reordering policy в Notion-like
- Подход:
  - dedicated suite (<300 строк) без fallback на прямой `moveBlock`
  - проверки deep subtree retention при переносе complex list blocks
  - checks на `undo/redo` после drag
  - stress на alternating drag across top/bottom edges
  - кейс: drag сразу после slash-transform + immediate typing
- Результат:
  - новый spec: `e2e/notion-like-dnd-policy.spec.ts`
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
  - Chromium repeat (`--repeat-each=3`): `9/9` PASS
  - combined regression (`block-toolbar-fast-hover + step2-parity + backlog-hardening + dnd-policy`): `27/27` PASS
  - статус: **Completed**

### Batch 7 (IME Composition Policy Baseline)

- Область: composition input around slash/list boundaries
- Подход:
  - dedicated suite (<300 строк) с composition-event injection
  - paragraph/todo/slash-transform сценарии + history checks
  - кросс-браузерная валидация + repeat на Chromium
- Результат:
  - новый spec: `e2e/notion-like-ime-policy.spec.ts`
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
  - Chromium repeat (`--repeat-each=3`): `9/9` PASS
  - combined regression (`ime-policy + dnd-policy + backlog-hardening + step2-parity`): `12/12` PASS
  - статус: **Completed**

### Batch 8 (Selection/History Large-Doc Stress)

- Область: selection + marks + history на больших документах
- Подход:
  - dedicated suite (<300 строк)
  - массовые mark-toggle операции по paragraph/list/todo leafs
  - mixed loop: range-selection + mark toggle + typing + Enter + undo/redo
  - кросс-браузерная валидация + repeat на Chromium
- Результат:
  - новый spec: `e2e/notion-like-selection-history-stress.spec.ts`
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
  - Chromium repeat (`--repeat-each=3`): `9/9` PASS
  - combined regression (`selection-history + ime + dnd + backlog-hardening`): `13/13` PASS
  - статус: **Completed**

### Batch 9 (Cross-block Clipboard + Marks Chains)

- Область: cross-block range selection + clipboard + marks history
- Подход:
  - dedicated suite (<300 строк)
  - copy/paste цепочки на cross-block ranges
  - cut flow + deterministic undo/redo validation
  - rapid mixed loop с clipboard/mark/history на multi-block документе
- Результат:
  - новый spec: `e2e/notion-like-crossblock-clipboard-stress.spec.ts`
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
  - Chromium repeat (`--repeat-each=3`): `9/9` PASS
  - combined regression (`crossblock-clipboard + selection-history + ime + dnd`): `12/12` PASS
  - статус: **Completed**

### Batch 10 (Nested Cross-block Range Chains)

- Область: nested `listItem/todoItem` range chains + clipboard/marks/history
- Подход:
  - shared helper для cross-block операций: `e2e/helpers/notion-crossblock.ts`
  - dedicated suite (<300 строк) для nested range coverage
  - copy/paste, cut + deterministic undo/redo, rapid mixed loop
  - cross-browser + Chromium repeat
- Результат:
  - новый spec: `e2e/notion-like-crossblock-nested-chains.spec.ts`
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
  - Chromium repeat (`--repeat-each=3`): `9/9` PASS
  - combined regression (`crossblock-clipboard + crossblock-nested + selection-history + ime + dnd`): `15/15` PASS
  - статус: **Completed**

### Batch 11 (Integrated Chaos: DnD + Clipboard + Marks + Slash)

- Область: единый mixed loop для nested сценариев и history stability
- Подход:
  - shared helper для mixed действий: `e2e/helpers/notion-chaos.ts`
  - dedicated suite (<300 строк) с реальным DnD через drag events
  - сценарии, где в одном тесте смешаны DnD, clipboard, marks, slash transform и immediate typing
  - cross-browser + Chromium repeat + combined sanity pack
- Результат:
  - новый spec: `e2e/notion-like-integrated-chaos.spec.ts`
  - Chromium: `3/3` PASS
  - Firefox: `3/3` PASS
  - WebKit: `3/3` PASS
  - Chromium repeat (`--repeat-each=3`): `9/9` PASS
  - combined regression (`integrated-chaos + crossblock-nested + crossblock-clipboard + selection-history + ime + dnd`): `18/18` PASS
  - статус: **Completed**

### Batch 12 (Headed Gutter Jitter Exploratory)

- Область: real-pointer jitter reliability для gutter controls (`+` / drag-handle)
- Подход:
  - dedicated headed suite (<300 строк) + artifact capture
  - rapid row-to-row mouse jitter
  - immediate plus click после jitter
  - drag-handle context-menu open/close после jitter
  - headed cross-browser + headed repeat
- Результат:
  - новый spec: `e2e/notion-like-gutter-jitter-headed.spec.ts`
  - Chromium headed: `3/3` PASS
  - Firefox + WebKit headed: `6/6` PASS
  - Chromium headed repeat (`--repeat-each=2`): `6/6` PASS
  - Chromium headed combined (`gutter-jitter-headed + integrated-chaos + crossblock-nested`): `9/9` PASS
  - артефакты: `output/playwright/notion-like-headed-gutter-jitter/` + `...-results/**/trace.zip`
  - статус: **Completed**

## Гейтинг CI

- PR gate 1: Chromium + Batch 1
- PR gate 2: Chromium + Batch 1/2/3
- Nightly: Full suite + Firefox/WebKit

## Ограничения текущего окружения

- Playwright Firefox/WebKit browsers установлены.
- Firefox checklist полный прогон (`NL-001..NL-500`): `500/500` PASS.
- WebKit checklist полный прогон (`NL-001..NL-500`): `500/500` PASS.

## Трекинг прогресса

- Источник правды по кейсам: `docs/notion-like-qa/04-checklist-500.md`
- Статус по дефектам: `docs/notion-like-qa/02-defect-roadmap.md`
- Master-координация: `docs/notion-like-qa/00-master-plan.md`
- Текущий стабильный авто-охват (Chromium): `548/548` PASS в combined regression (`matrix + block-toolbar + checklist 001..500`).
- Кросс-браузерный статус: Firefox `500/500` PASS, WebKit `500/500` PASS (full checklist).
