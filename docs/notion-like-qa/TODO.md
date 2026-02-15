# Notion-like TODO

_Last updated: February 14, 2026_

## Ближайшие приоритеты

- Matrix `docs/notion-like-qa/01-case-matrix.md` закрыт полностью (не осталось `Planned`).
- Дальше только расширение покрытия под новые баги/регрессии и стресс-сценарии.
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
- Step 2 hardening (hover/caret parity) закрыт:
  - `packages/block-editor/src/components/block-editor.tsx`: anti-flicker delayed hide для `+`/drag
  - `packages/block-editor/src/components/slash-menu.tsx`: fallback DOM-caret в `todo` text-host
  - `e2e/notion-like-step2-parity.spec.ts`: cross-browser PASS + stress-repeat PASS
- Дожать проблемные edge-case сценарии:
  - `SLASH-022` / `REL-007` закрыты:
    - `e2e/notion-like-transform-matrix.spec.ts` снят с `fixme`
    - Chromium: `72/72` PASS + `144/144` PASS (`--repeat-each=2`)
    - Firefox: `72/72` PASS
    - WebKit: `72/72` PASS
  - закрыт planned-block матрицы:
    - `SLASH-011`, `SLASH-015`, `SLASH-016`, `ENTER-010` переведены в `Automated`
    - `SEL-004` переведён в `Automated` (slash-transform при range-selection)
    - новый suite: `e2e/notion-like-matrix-planned-core.spec.ts` (`4/4` PASS во всех 3 браузерах)
  - закрыт planned UI-block матрицы:
    - `SLASH-019`, `UI-007`, `UI-008` переведены в `Automated`
    - новый suite: `e2e/notion-like-matrix-planned-ui.spec.ts` (`3/3` PASS во всех 3 браузерах)
    - мобильная ширина slash-menu ограничена до `min(300px, 90vw)` без overflow
  - закрыт selection planned-кейс:
    - `SEL-005` переведён в `Automated`
    - новый suite: `e2e/notion-like-matrix-planned-selection.spec.ts` (`1/1` PASS во всех 3 браузерах)
  - закрыт reliability planned-блок:
    - `REL-001`, `REL-002`, `REL-003` переведены в `Automated`
    - новый suite: `e2e/notion-like-matrix-planned-reliability.spec.ts` (`3/3` PASS во всех 3 браузерах)
  - `ENTER-009` закрыт automation (`Backspace` policy зафиксирована e2e)
  - закрыт backlog policy-hardening блок:
    - `e2e/notion-like-backlog-hardening.spec.ts` + `e2e/notion-like-backlog-hardening-stress.spec.ts`
    - закрыты `DEF-005`, `DEF-007`, `DEF-014` + cross-browser closure `DEF-006`
    - cross-browser `12/12` PASS + Chromium repeat `8/8` PASS

## Технический backlog

- `DEF-005`, `DEF-007`, `DEF-014` закрыты hardening-пакетом (`backlog-policy` + `backlog-hardening`).
- Selection/history stress baseline на больших документах закрыт (`e2e/notion-like-selection-history-stress.spec.ts`, cross-browser + repeat PASS).
- Cross-block clipboard/marks stress baseline закрыт (`e2e/notion-like-crossblock-clipboard-stress.spec.ts`, cross-browser + repeat PASS).
- Nested cross-block range chains закрыт (`e2e/notion-like-crossblock-nested-chains.spec.ts`, cross-browser + repeat PASS).
- Deep DnD policy для block reordering закрыт (`e2e/notion-like-dnd-policy.spec.ts`, cross-browser + repeat PASS).
- IME composition baseline закрыт (`e2e/notion-like-ime-policy.spec.ts`, cross-browser + repeat PASS).
- Mixed nested loop (`DnD + clipboard + marks + slash`) закрыт (`e2e/notion-like-integrated-chaos.spec.ts`, cross-browser + repeat PASS).
- Headed gutter jitter exploratory закрыт (`e2e/notion-like-gutter-jitter-headed.spec.ts`, headed cross-browser + repeat PASS).
- Следующий шаг по IME: native OS-level composition/manual charters (RU/JP/KR) в headed-режиме.
- Следующий шаг по reliability: headed exploratory charters для bubble-menu/focus-trap при быстрых selection drag-path.

## Кросс-браузерный статус

- Playwright Firefox/WebKit browsers установлены (`pnpm exec playwright install` выполнен).
- Firefox checklist полный прогон (`NL-001..NL-500`): `500/500` PASS.
- WebKit checklist полный прогон (`NL-001..NL-500`): `500/500` PASS.

## Источники задач

- 500 чеклист: `docs/notion-like-qa/04-checklist-500.md`
- Batch-план автоматизации: `docs/notion-like-qa/05-automation-batches.md`
- Дефекты и статусы: `docs/notion-like-qa/02-defect-roadmap.md`
