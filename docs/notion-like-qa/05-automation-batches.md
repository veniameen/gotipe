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
  - `notion-like-matrix.spec.ts` + `notion-like-exhaustive.spec.ts`
  - текущий покрытый минимум: `39` авто-кейсов в Chromium
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-001-050.spec.ts` (`50/50` PASS)
  - добавлен отдельный batch-suite `e2e/notion-like-checklist-051-100.spec.ts` (`50/50` PASS)
  - суммарно по checklist-batch: `100/100` PASS (`NL-001..NL-100`)
  - запуск только Chromium обязателен в CI
  - статус: **Completed**

### Batch 2 (Transform matrix, top-level transitions)

- Область: `D` (вся матрица transform)
- Подход:
  - data-driven тесты (source x target)
  - валидация: тип блока, сохранение текста, позиция caret
- Результат:
  - отдельный spec: `e2e/notion-like-transform-matrix.spec.ts`
  - текущий статус: временно quarantined (`fixme`) из-за нестабильности slash start-line (`SLASH-010`)
  - `SLASH-021` закрыт и снят с `fixme` в matrix suite
  - статус: **In progress**; active-run восстановить после закрытия `SLASH-010`

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
- Текущий стабильный авто-охват (Chromium): `48` PASS, `75` quarantine(`fixme`) в combined run
