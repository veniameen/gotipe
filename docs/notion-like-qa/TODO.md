# Notion-like TODO

_Last updated: February 14, 2026_

## Ближайшие приоритеты

- Закрыть remaining `Planned` кейсы из `docs/notion-like-qa/01-case-matrix.md`.
- Синхронизировать прогресс авто-кейсов с `docs/notion-like-qa/04-checklist-500.md`.
- Продолжить batch-подход по 50 кейсов:
  - закрыт блок: `NL-001..NL-050` (`50/50` PASS)
  - закрыт блок: `NL-051..NL-100` (`50/50` PASS)
  - закрыт блок: `NL-101..NL-150` (`50/50` PASS)
  - закрыт блок: `NL-151..NL-200` (`50/50` PASS)
  - закрыт блок: `NL-201..NL-250` (`50/50` PASS)
  - закрыт блок: `NL-251..NL-300` (`50/50` PASS)
  - закрыт блок: `NL-301..NL-350` (`50/50` PASS)
  - закрыт блок: `NL-351..NL-400` (`50/50` PASS)
  - закрыт блок: `NL-401..NL-450` (`50/50` PASS)
  - закрыт блок: `NL-451..NL-500` (`50/50` PASS)
  - полный checklist: `NL-001..NL-500` (`500/500` PASS)
- Step 2 reference pass (Notion list-row micro behavior) закрыт:
  - артефакты: `output/playwright/notion-step2/...`
  - документация: `docs/notion-like-qa/notion-reference-step2/`
- Пункт 1 (todo caret/selection baseline) закрыт и стабилизирован:
  - исправлена нормализация каретки при клике в левую зону `todoItem`
  - добавлены e2e кейсы в `e2e/notion-like-matrix.spec.ts`
  - repeat-run `--grep "todo click in left zone" --repeat-each=10`: `20/20` PASS
- Пункт 2 (nested/multi-step) закрыт и стабилизирован:
  - suite `e2e/notion-like-nested-transform.spec.ts` (`5` кейсов) проходит стабильно
  - repeat-run `--repeat-each=5`: `25/25` PASS
- Новый закрытый блок parity:
  - `SLASH-010` снят с `fixme` и переведён в `Automated`
  - в меню 6-точек добавлен `Turn into` + e2e конверсий
  - добавлен heading placeholder flow (`/heading` -> placeholder -> ввод)
- Дополнительно закрыт race post-slash caret restore:
  - `packages/block-editor/src/components/slash-menu.tsx`: rAF-restore больше не перетирает selection, если пользователь уже начал ввод
  - regression кейсы immediate-typing снова стабильны
- Дожать проблемные edge-case сценарии:
  - `SLASH-022` / `REL-007` (transform-matrix) — временно quarantined (`fixme`)
  - `ENTER-009` закрыт automation (`Backspace` policy зафиксирована e2e)

## Технический backlog

- Nested list conversion policy (`DEF-005`).
- Cross-browser stability в Firefox/WebKit (`DEF-006`).
- High-frequency input stress и race conditions (`DEF-007`) — частично покрыто, нужна более агрессивная нагрузка.
- Backspace boundary behavior в списках (`DEF-014`) — baseline закрыт, расширить на nested/cross-browser policy.
- Дальнейшая стабилизация selection/formatting кейсов на больших документах.

## Что нужно для кросс-браузерных прогонов

- Установить Playwright browsers:
  - `pnpm exec playwright install`

## Источники задач

- 500 чеклист: `docs/notion-like-qa/04-checklist-500.md`
- Batch-план автоматизации: `docs/notion-like-qa/05-automation-batches.md`
- Дефекты и статусы: `docs/notion-like-qa/02-defect-roadmap.md`
