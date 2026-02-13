# Notion-like QA Master Plan

_Last updated: February 13, 2026_

## Цель

Сделать вкладку `Notion-like Editor` стабильной на уровне production:

- предсказуемые преобразования блоков через slash-команды
- корректная работа Enter/Backspace/selection
- аккуратный UI (slash-menu, gutter toolbar, светлая/тёмная тема)
- защита от регрессий через e2e-матрицу

## Связанные документы

- `docs/notion-like-qa/01-case-matrix.md`
- `docs/notion-like-qa/02-defect-roadmap.md`
- `docs/notion-like-qa/03-exploratory-charters.md`

## Что уже сделано

- Добавлены regression-тесты: `e2e/notion-like-matrix.spec.ts`
- Переписан устаревший suite: `e2e/slash-menu.spec.ts`
- Исправлены core-преобразования в list-контексте:
  - `packages/core/src/chain.ts`
- Исправлен блоковый gutter toolbar (позиционирование около контента):
  - `packages/block-editor/src/components/block-editor.tsx`
- Добавлена полноценная light/dark стилизация slash-menu:
  - `packages/theme/src/theme.css`

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

## Definition of Done

- Нет критических багов P0/P1 в `Notion-like`
- Все `Automated` кейсы из matrix проходят
- На каждый новый баг добавляется e2e-тест или unit-тест
- Все изменения отражены в `02-defect-roadmap.md`
