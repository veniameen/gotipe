# Notion-like DONE

_Last updated: February 13, 2026_

## Что уже сделано

- Стабилизированы базовые slash-конверсии между `paragraph`, `bullet`, `ordered`, `todo`.
- Исправлено исчезновение строки при list/todo трансформациях.
- Исправлено позиционирование gutter-контролов (`+` и drag-handle) рядом с контентом.
- Усилен hover/position pipeline gutter-тулбара:
  - hit-testing блока под курсором через `elementsFromPoint(...)` + nearest-by-Y fallback
  - тулбар не теряется при быстром проходе курсора через левый gutter
  - отдельный отступ для list-блоков (`bullet/ordered/todo`) чтобы не налезать на маркеры
- Приведён slash-menu к production-стилю, включая поддержку light/dark темы.
- Добавлены regression e2e для ключевых сценариев Notion-like.
- Усилен `todo` UX:
  - корректный caret после checkbox в пустом item
  - нормализация caret при клике в левую зону `todoItem` (каретка не остаётся слева от checkbox)
  - выравнивание checkbox и текста
  - стабилизация переходов `todo <-> list`
- Исправлено поведение `code block`:
  - Enter добавляет новую строку в том же code block
  - Escape выводит в paragraph после code block
- Добавлена детерминированная e2e-инициализация Notion-like:
  - `window.__GOTIPE_NOTION_EDITOR__` в playground
  - reset документа перед каждым тестом
- Добавлен расширенный suite `e2e/notion-like-exhaustive.spec.ts`:
  - 17 сценариев (slash/enter/backspace/delete/цепочки transform/стресс mixed-операций)
- Добавлен suite `e2e/notion-like-transform-matrix.spec.ts`:
  - 72 data-driven перехода (`source -> target`) для slash-конверсий
- Добавлен batch suite `e2e/notion-like-checklist-001-050.spec.ts`:
  - покрытие `NL-001..NL-050` в отдельном файле (< 300 строк)
  - shared helper `e2e/helpers/notion-checklist.ts` (< 300 строк)
- Добавлен batch suite `e2e/notion-like-checklist-051-100.spec.ts`:
  - покрытие `NL-051..NL-100` в отдельном файле (< 300 строк)
  - батч закрыт в одном прогоне `50/50`
- Стабилизирована синхронизация internal selection после программной постановки каретки:
  - `e2e/helpers/notion-checklist.ts`: `setCaretAt(...)` теперь вызывает `syncSelectionFromDOM()`
- Исправлен дефект `codeBlock -> list/todo`:
  - до фикса текст строки терялся при transform
  - после фикса текст сохраняется (подтверждено transform-matrix)
- Добавлены keyboard regression-кейсы для slash-menu:
  - `ArrowUp/ArrowDown/Enter` применяют команду
  - `Escape` закрывает меню и редактор остаётся рабочим
- Добавлены targeted regression-кейсы:
  - `slash: third bullet item -> heading keeps caret on transformed row`
  - `slash: third todo item -> heading keeps caret on transformed row`
- Закрыт `SLASH-021` (fast post-slash immediate typing):
  - сняты `fixme` с трёх matrix-кейсов immediate typing
  - repeat-run `workers=1`, `repeat-each=10`: `30/30` PASS
- Закрыт drift selection после `setContent` и программной постановки каретки:
  - `packages/core/src/editor.ts`: `setContent` ребазит selection на валидный первый блок
  - `packages/core/src/editor.ts`: `beforeinput` читает DOM-selection (когда нет `pendingSelectionRestore`)
  - `e2e/notion-like-nested-transform.spec.ts`: helper синхронизирует `syncSelectionFromDOM()`
- Закрыт baseline `пункта 2` (nested/multi-step):
  - добавлен suite `e2e/notion-like-nested-transform.spec.ts` (`5` кейсов)
  - покрыты nested slash-конверсии (`listItem -> heading/paragraph`) с сохранением deep-child контента
  - покрыта стабильность структуры при `Backspace` на границе list item
  - покрыта nested структура по `Tab`/`Shift+Tab`
- Усилена nested-логика в core:
  - `packages/core/src/chain.ts`: сохранение `children` при lift `listItem/todoItem -> non-list block`
  - `packages/core/src/chain.ts`: unwrap list -> paragraph теперь не теряет nested children
  - `packages/core/src/chain.ts`: переписаны `indent`/`outdent` для реального list-tree (nested list container)
  - `packages/core/src/editor.ts`: tree-aware backward/forward delete в nested blocks
- Slash-command path стабилизирован для nested:
  - `packages/block-editor/src/components/slash-menu.tsx`
  - после удаления `/query` явно фиксируется selection на trigger-offset до `cmd.execute(...)`
  - fallback reposition не перетирает уже валидный post-command selection

## Текущий автоматизированный статус

- Chromium matrix: `28 passed`, `1 skipped(fixme)`.
- Chromium exhaustive: `15 passed`, `2 skipped(fixme)`.
- Chromium transform-matrix: `72 skipped(fixme)` (quarantine до стабилизации slash-path).
- Chromium nested/multi-step: `5/5` PASS.
- Chromium nested/multi-step repeat: `25/25` PASS (`--repeat-each=5`).
- Chromium todo-left-zone repeat: `20/20` PASS (`--grep "todo click in left zone" --repeat-each=10`).
- Chromium checklist batch `NL-001..NL-050`: `50/50` PASS.
- Chromium checklist batch `NL-051..NL-100`: `50/50` PASS.
- Chromium block-toolbar fast-hover stress: `18/18` PASS (`e2e/block-toolbar-fast-hover.spec.ts`).
- Chromium block-toolbar baseline: `14/14` PASS (`e2e/block-toolbar.spec.ts`).
- Chromium gutter/drag batch `NL-471..NL-480`: `10/10` PASS.
- Chromium combined (`matrix + exhaustive + nested`): `48 passed`, `3 skipped`.
- Chromium combined (`matrix + exhaustive + transform-matrix + nested`): `48 passed`, `75 skipped`.
- Открытые нестабильные зоны:
  - `SLASH-010` (slash в начале непустой строки)
  - quarantine `SLASH-022` / `REL-007` (transform-matrix)
- Firefox/WebKit: не выполнено в этом окружении (нет установленных браузерных бинарников Playwright).

## Где смотреть детали

- Master-plan: `docs/notion-like-qa/00-master-plan.md`
- Матрица кейсов: `docs/notion-like-qa/01-case-matrix.md`
- Закрытые дефекты: `docs/notion-like-qa/02-defect-roadmap.md` (раздел `Critical`)
