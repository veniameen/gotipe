# Notion-like Automation Batches

_Last updated: February 13, 2026_

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
  - `notion-like-matrix.spec.ts` расширен до 30-40 тестов
  - запуск только Chromium обязателен в CI

### Batch 2 (Transform matrix, 120 кейсов)

- Область: `D` (вся матрица transform)
- Подход:
  - data-driven тесты (source x target)
  - валидация: тип блока, сохранение текста, позиция caret
- Результат:
  - отдельный spec: `e2e/notion-like-transform-matrix.spec.ts`

### Batch 3 (Formatting/History, 70 кейсов)

- Области: `F`, `G`
- Подход:
  - e2e на сохранение выделения и mark toggles
  - сценарии undo/redo после трансформаций
- Результат:
  - отдельный spec на selection + history

### Batch 4 (Layout/Theme/Responsive, 40 кейсов)

- Области: `H`, `I`
- Подход:
  - viewport snapshots + DOM metrics
  - проверка light/dark и keyboard navigation
- Результат:
  - визуальные регрессии по ключевым состояниям

## Гейтинг CI

- PR gate 1: Chromium + Batch 1
- PR gate 2: Chromium + Batch 1/2/3
- Nightly: Full suite + Firefox/WebKit (после установки браузеров)

## Ограничения текущего окружения

- Firefox/WebKit в этом окружении не установлены.
- Для кросс-браузерных прогонов нужен шаг:
  - `pnpm exec playwright install`

## Трекинг прогресса

- Источник правды по кейсам: `docs/notion-like-qa/04-checklist-500.md`
- Статус по дефектам: `docs/notion-like-qa/02-defect-roadmap.md`
- Master-координация: `docs/notion-like-qa/00-master-plan.md`
