# Notion-like QA Master Plan

_Last updated: February 13, 2026_

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
- Переписан устаревший suite: `e2e/slash-menu.spec.ts`
- Исправлены core-преобразования в list-контексте:
  - `packages/core/src/chain.ts`
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
- Исправлен selection drift после `setContent`/programmatic range:
  - `packages/core/src/editor.ts`
  - `e2e/notion-like-nested-transform.spec.ts` (helper sync)
- Исправлено сохранение nested children при lift/unwrap list transform:
  - `packages/core/src/chain.ts`
- Улучшены nested list операции:
  - `packages/core/src/chain.ts` (`indent` / `outdent`)
- Добавлен детерминированный тестовый reset для Notion-like:
  - `apps/playground/src/templates/notion-editor.tsx` (`__GOTIPE_NOTION_EDITOR__`)
  - reset контента перед каждым e2e кейсом

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

- Chromium matrix: `28 passed`, `1 skipped (fixme)`  
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
- Chromium combined (`matrix + exhaustive + nested`): `48 passed`, `3 skipped`
- Chromium combined (`matrix + exhaustive + transform-matrix + nested`): `48 passed`, `75 skipped`
- Известные открытые flaky-зоны:
  - `SLASH-010` (slash в начале непустой строки)
  - quarantine `SLASH-022` / `REL-007` до стабилизации slash-path
- Firefox/WebKit: run blocked, отсутствуют браузерные бинарники Playwright в текущем окружении
  - требуется: `pnpm exec playwright install`

## Definition of Done

- Нет критических багов P0/P1 в `Notion-like`
- Все `Automated` кейсы из matrix проходят
- На каждый новый баг добавляется e2e-тест или unit-тест
- Все изменения отражены в `02-defect-roadmap.md`
