# Notion-like QA Master Plan

_Last updated: February 14, 2026_

## Цель

Сделать вкладку `Notion-like Editor` стабильной на уровне production:

- предсказуемые преобразования блоков через slash-команды
- корректная работа Enter/Backspace/selection
- аккуратный UI (slash-menu, gutter toolbar, светлая/тёмная тема)
- защита от регрессий через e2e-матрицу

## Связанные документы

- `docs/notion-like-qa/DONE.md`
- `docs/notion-like-qa/TODO.md`
- `docs/notion-like-qa/01-case-matrix.md`
- `docs/notion-like-qa/02-defect-roadmap.md`
- `docs/notion-like-qa/03-exploratory-charters.md`
- `docs/notion-like-qa/04-checklist-500.md`
- `docs/notion-like-qa/05-automation-batches.md`
- `docs/notion-like-qa/report-2026-02-13-chromium.md`

## Что уже сделано

- Добавлены regression-тесты: `e2e/notion-like-matrix.spec.ts`
- Добавлены keyboard regression-кейсы slash-menu (`ArrowUp/ArrowDown/Enter`, `Escape`)
- Добавлен расширенный стресс/поведенческий suite: `e2e/notion-like-exhaustive.spec.ts`
- Добавлен data-driven suite трансформаций: `e2e/notion-like-transform-matrix.spec.ts`
- Добавлен nested/multi-step suite: `e2e/notion-like-nested-transform.spec.ts`
- Добавлен checklist-batch suite: `e2e/notion-like-checklist-001-050.spec.ts`
- Добавлен checklist-batch suite: `e2e/notion-like-checklist-051-100.spec.ts`
- Добавлен checklist-batch suite: `e2e/notion-like-checklist-101-150.spec.ts`
- Добавлен checklist-batch suite: `e2e/notion-like-checklist-151-200.spec.ts`
- Добавлен checklist-batch suite: `e2e/notion-like-checklist-201-250.spec.ts`
- Добавлен checklist-batch suite: `e2e/notion-like-checklist-251-300.spec.ts`
- Добавлен checklist-batch suite: `e2e/notion-like-checklist-301-320.spec.ts`
- Добавлен checklist-batch suite: `e2e/notion-like-checklist-321-350.spec.ts`
- Добавлен checklist-batch suite: `e2e/notion-like-checklist-351-370.spec.ts`
- Добавлен checklist-batch suite: `e2e/notion-like-checklist-371-390.spec.ts`
- Добавлен checklist-batch suite: `e2e/notion-like-checklist-391-400.spec.ts`
- Добавлен checklist-batch suite: `e2e/notion-like-checklist-401-425.spec.ts`
- Добавлен checklist-batch suite: `e2e/notion-like-checklist-426-450.spec.ts`
- Добавлен checklist-batch suite: `e2e/notion-like-checklist-451-475.spec.ts`
- Добавлен checklist-batch suite: `e2e/notion-like-checklist-476-500.spec.ts`
- Переписан устаревший suite: `e2e/slash-menu.spec.ts`
- Исправлены core-преобразования в list-контексте:
  - `packages/core/src/chain.ts`
- Slash list-команды переведены в idempotent set-path (без unwrap при выборе того же типа):
  - `packages/core/src/chain.ts`
  - `packages/core/src/extensions/bullet-list.ts`
  - `packages/core/src/extensions/ordered-list.ts`
- Исправлен блоковый gutter toolbar (позиционирование около контента):
  - `packages/block-editor/src/components/block-editor.tsx`
- Добавлена полноценная light/dark стилизация slash-menu:
  - `packages/theme/src/theme.css`
- Исправлена нормализация каретки для пустых todo:
  - `packages/core/src/editor.ts`
  - `packages/block-editor/src/components/slash-menu.tsx`
  - `packages/react/src/editor-content.tsx`
  - `packages/theme/src/theme.css`
- Исправлена нормализация каретки для клика в левую зону `todoItem`:
  - `packages/core/src/editor.ts` (selectionchange path)
  - `e2e/notion-like-matrix.spec.ts` (новые regression кейсы)
- Исправлены конверсии `codeBlock -> list/todo` (с сохранением текста):
  - `packages/core/src/chain.ts`
- Исправлены конверсии `callout -> bullet/ordered/todo` (с сохранением текста):
  - `packages/core/src/chain.ts`
- Исправлен selection drift после `setContent`/programmatic range:
  - `packages/core/src/editor.ts`
  - `e2e/notion-like-nested-transform.spec.ts` (helper sync)
- Исправлен сброс stored marks на ложных `selectionchange`:
  - `packages/core/src/editor.ts` (marks при collapsed-caret теперь не теряются между toggle и вводом)
- Исправлено сохранение nested children при lift/unwrap list transform:
  - `packages/core/src/chain.ts`
- Улучшены nested list операции:
  - `packages/core/src/chain.ts` (`indent` / `outdent`)
- Добавлен детерминированный тестовый reset для Notion-like:
  - `apps/playground/src/templates/notion-editor.tsx` (`__GOTIPE_NOTION_EDITOR__`)
  - reset контента перед каждым e2e кейсом
- Закрыт Step 2 reference-pass (Notion list-row micro behavior):
  - `docs/notion-like-qa/notion-reference-step2/00-index.md`
  - `docs/notion-like-qa/notion-reference-step2/01-list-row-micro-behavior.md`
  - `docs/notion-like-qa/notion-reference-step2/02-parity-actions.md`
- Закрыт race post-slash caret restore (first-char shift):
  - `packages/block-editor/src/components/slash-menu.tsx` (rAF guard, чтобы не перетирать уже изменённый selection)
  - подтверждено regression-кейсами immediate typing
- Закрыт race immediate-typing после клика в левую зону `todoItem`:
  - `packages/react/src/editor-content.tsx` (syncSelection выполняется синхронно после принудительной постановки range)
- Увеличен безопасный list-gutter отступ для block-toolbar (не перекрывает checkbox):
  - `packages/block-editor/src/components/block-editor.tsx`

## Рабочие фазы

### Фаза 1. Core Stability

Фокус:

- корректные переходы `paragraph <-> list/todo/heading` через slash
- отсутствие “исчезновения строки” при смене типа блока
- корректный выход из пустого todo по Enter

Exit criteria:

- matrix-ключи `SLASH-*`, `ENTER-*` зелёные в Chromium

### Фаза 2. UI & Positioning Fidelity

Фокус:

- slash-menu позиционируется у каретки и корректно флипается
- gutter `+` и drag-handle привязаны к блоку, а не к левому краю контейнера
- тема светлая/тёмная выглядит консистентно

Exit criteria:

- matrix-ключи `UI-*` зелёные
- визуальные расхождения устранены

### Фаза 3. Cross-browser Reliability

Фокус:

- прогоны Chromium/Firefox/WebKit
- стабилизация флаки-кейсов

Exit criteria:

- стабильный pass-rate > 95% для `notion-like` suites в 3 браузерах

## Текущий статус прогонов

- Chromium matrix: `32/32` PASS  
  - `pnpm playwright test e2e/notion-like-matrix.spec.ts --project=chromium`
- Chromium exhaustive: `15 passed`, `2 skipped (fixme)`  
  - `pnpm playwright test e2e/notion-like-exhaustive.spec.ts --project=chromium`
- Chromium transform-matrix: временно quarantined, `72 skipped (fixme)`  
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
- Chromium checklist полный прогон `NL-001..NL-500`: `500/500` PASS
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
- Chromium combined (`matrix + exhaustive + transform-matrix + nested`): `48 passed`, `75 skipped`
- Известные открытые flaky-зоны:
  - quarantine `SLASH-022` / `REL-007` до стабилизации slash-path
- Firefox/WebKit: run blocked, отсутствуют браузерные бинарники Playwright в текущем окружении
  - требуется: `pnpm exec playwright install`

## Definition of Done

- Нет критических багов P0/P1 в `Notion-like`
- Все `Automated` кейсы из matrix проходят
- На каждый новый баг добавляется e2e-тест или unit-тест
- Все изменения отражены в `02-defect-roadmap.md`
