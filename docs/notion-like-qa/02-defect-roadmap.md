# Notion-like Defect Roadmap

_Last updated: February 13, 2026_

## Critical (закрыто в этой итерации)

### DEF-001: Пропадание строки при slash-переходах между list/todo

Симптом:

- при `todo -> bullet` или похожих переходах строка исчезала или дерево становилось невалидным

Причина:

- в `toggleList` использовался fallback `setBlockType(listType)` на item-уровне
- это могло создать невалидные сочетания типов в дереве

Фикс:

- `packages/core/src/chain.ts`
- in-place конвертация типа списка + item типов
- корректный lift list item в top-level блок при `setBlockType("paragraph" | "heading" | ...)`

Покрытие:

- `e2e/notion-like-matrix.spec.ts` (`SLASH-004..SLASH-010`)

### DEF-002: Левый toolbar (`+` и drag) “прилипал” к левому краю контейнера

Симптом:

- controls визуально уезжали в левую пустую область, не рядом с блоком

Причина:

- позиционирование было от контейнера (`left: 0`) без привязки к контентной колонке

Фикс:

- `packages/block-editor/src/components/block-editor.tsx`
- вычисление `left` относительно `data-gotipe-content`
- выравнивание wrapper по реальному gutter около блока

Покрытие:

- `e2e/notion-like-matrix.spec.ts` (`UI-006`)

### DEF-003: Slash-menu был только в dark-стиле

Симптом:

- в light теме меню оставалось тёмным (хардкод цвета)

Причина:

- цвета меню были заданы статически

Фикс:

- `packages/theme/src/theme.css`
- введены token-переменные `--gt-slash-*` для light/dark режимов

Покрытие:

- `e2e/notion-like-matrix.spec.ts` (`UI-004`, `UI-005`)

### DEF-004: Slash не открывался в начале непустой строки

Симптом:

- при вводе `/` в начале уже заполненной строки меню не открывалось

Причина:

- slash open зависел от input-rule `^/$`, который срабатывает только для полностью пустого блока

Фикс:

- `packages/core/src/editor.ts`
- добавлен runtime-триггер `openSlashMenu` при вводе `/` в валидной позиции каретки

Покрытие:

- `e2e/notion-like-matrix.spec.ts` (`SLASH-010`)
- текущий статус: `fixme`, кейс остаётся нестабильным и вынесен в active backlog (`DEF-015`)

### DEF-008: Каретка в пустом todo оказывалась слева от checkbox

Симптом:

- после `/todo` каретка могла остаться в list-контейнере (или в левом краю item)
- фактический ввод начинался “вдруг” уже справа от checkbox только после первого символа

Причина:

- selection после slash-команды могла дрейфовать в `todoList` контейнер
- restore и sync selection не всегда принудительно нормализовали точку в text-host `todoItem`
- при клике в левую зону `todoItem` браузер мог оставить caret на `li` offset `0`
  (визуально слева от checkbox) до первого введённого символа

Фикс:

- `packages/core/src/editor.ts`
  - нормализация list container -> list item в `resolvePosition`
  - нормализация `resolveDomPoint` для list container в первый item
  - в `selectionchange` path добавлена нормализация collapsed-caret для `todoItem`
    (если caret оказался вне `data-gotipe-todo-content`, он принудительно переносится в text-host)
- `packages/block-editor/src/components/slash-menu.tsx`
  - пост-командная нормализация selection + принудительная DOM-постановка каретки
- `packages/react/src/editor-content.tsx`
  - явный `data-gotipe-todo-content` host + `contentEditable={false}` на checkbox

Покрытие:

- `e2e/notion-like-matrix.spec.ts` (`ENTER-011`, `UI-009`)
- `e2e/notion-like-matrix.spec.ts`
  - `todo click in left zone normalizes caret after checkbox (empty item)`
  - `todo click in left zone normalizes caret after checkbox (item with text)`
  - repeat-run `--repeat-each=10`: `20/20` PASS

### DEF-009: Enter в code block дублировал блок вместо новой строки

Симптом:

- в `codeBlock` по Enter создавался дополнительный code block (визуально выглядело как дублирование)

Причина:

- `insertParagraph` всегда выполнял `splitBlock`, без отдельного поведения для `codeBlock`

Фикс:

- `packages/core/src/editor.ts`
  - в `beforeinput(insertParagraph)` добавлен branch для `codeBlock`:
    Enter вставляет `\\n` в том же блоке
- `packages/core/src/extensions/code-block.ts`
  - Escape теперь вставляет paragraph после текущего code block и переносит туда каретку

Покрытие:

- `e2e/notion-like-matrix.spec.ts` (`ENTER-012`, `ENTER-013`)

### DEF-011: Slash transform `codeBlock -> list/todo` терял текст

Симптом:

- при трансформации code block в `Bullet List`/`Numbered List`/`To-do List`
  строка могла становиться пустой (контент терялся)

Причина:

- в `toggleList` top-level wrap поддерживал только `paragraph/heading`
- для `codeBlock` использовался fallback `setBlockType(listType)` без корректного
  переноса текста в list item content

Фикс:

- `packages/core/src/chain.ts`
  - добавлен `cloneInlineContent` (string/inline span -> listItem content)
  - расширен wrap branch в `toggleList` для `codeBlock` и `blockquote`
  - при lift `listItem -> codeBlock` добавлена `contentForTargetType` (span -> string)

Покрытие:

- `e2e/notion-like-transform-matrix.spec.ts` (переходы `code->bullet/ordered/todo` и обратные)

### DEF-012: Флаки в slash e2e из-за дрейфа каретки в helper

Симптом:

- в полном прогоне периодически падали кейсы:
  - `slash at line start preserves existing text`
  - `bullet->code keeps content and lands in expected block`
- при падении `/query` печатался в конец строки вместо начала, slash-menu не открывался

Причина:

- в e2e-helper `placeCaretAtStartOfBlockByMarker` сначала ставился range, затем `focus()`
- в части запусков браузер после `focus()` коллапсировал каретку в конец блока

Фикс:

- `e2e/notion-like-matrix.spec.ts`
- `e2e/notion-like-transform-matrix.spec.ts`
- порядок изменён на `focus -> setRange`, добавлен `expect.poll` на anchorOffset `0`

Покрытие:

- targeted reruns:
  - `slash at line start`: `10/10` PASS
  - `bullet->code`: `10/10` PASS
- full combined run: `109/109` PASS

### DEF-010: Fast post-slash typing race (закрыто)

Симптом:

- при быстром вводе сразу после выбора slash-команды (особенно `list item -> heading`)
  первый символ мог теряться или ввод улетал не в целевой блок

Причина:

- кратковременный рассинхрон между tracked selection и DOM selection после структурной трансформации
- после `setContent(...)` selection могла оставаться на невалидном/старом `blockId`
- в `beforeinput` не всегда использовалась актуальная DOM-selection перед вводом

Фикс:

- `packages/core/src/chain.ts`
  - для list lift добавлен `selectionOverride` на вставленный blockId
  - в `run()` явно применяется `editor.setSelection(...)` по override после dispatch
- `packages/core/src/editor.ts`
  - `setContent(...)` теперь всегда ребазит selection на первый валидный редактируемый блок
  - в `beforeinput` добавлено чтение DOM-selection (когда нет pending restore), чтобы не печатать в устаревший блок
  - сохранён guard от transient `selectionchange` во время `pendingSelectionRestore`
- `packages/block-editor/src/components/slash-menu.tsx`
  - усилен post-command caret lock и fallback target resolution для list lift сценариев
- `e2e/notion-like-nested-transform.spec.ts`
  - после программной постановки range добавлен `editor.syncSelectionFromDOM()` в helper, чтобы исключить тестовый race

Покрытие:

- `e2e/notion-like-matrix.spec.ts`
  - `slash: third bullet item -> heading keeps caret on transformed row`
  - `slash: third todo item -> heading keeps caret on transformed row`
  - `slash click + immediate typing does not lose first character (heading)`
  - `slash: third bullet item -> heading + immediate typing stays on transformed row`
  - `slash: third todo item -> heading + immediate typing stays on transformed row`
- стресс:
  - `workers=1`, `repeat-each=10` на `immediate typing` группе: `30/30` PASS
  - `e2e/notion-like-nested-transform.spec.ts --repeat-each=5`: `25/25` PASS

### DEF-013: Nested list transform терял deep children (закрыто)

Симптом:

- при `nested listItem -> heading/paragraph` дочерние вложенные блоки могли теряться
- при unwrap list (`toggle same list type`) nested children item-ов также отбрасывались

Причина:

- lift branch в `setBlockType` создавал новый block c `children: []`
- unwrap list branch (`toggleList`) поднимал только inline content item-а, без children

Фикс:

- `packages/core/src/chain.ts`
  - добавлен deep clone tree helper для block children
  - при lift `listItem/todoItem -> non-list` trailing children реинсертятся после lifted block
  - при unwrap `list -> paragraph` children каждого item сохраняются и поднимаются вместе с ним
  - `indent/outdent` переписаны под nested list контейнеры, без порчи структуры

Покрытие:

- `e2e/notion-like-nested-transform.spec.ts`
  - `nested slash: listItem -> heading keeps deep child text`
  - `nested slash: listItem -> paragraph keeps deep child text`
  - `nested ordered list: listItem -> heading keeps deep child text`
  - `backspace at start of second bullet item lifts it to paragraph and keeps first item in list`
  - `Tab and Shift+Tab keep nested bullet structure valid`

## Active backlog

### DEF-005: Nested list conversion policy

Риск:

- при сложной вложенности возможны неожиданные эффекты при конвертации listItem <-> todoItem

План:

- `SLASH-018` закрыт automation (`nested transform` suite)
- доработать policy для конверсий nested `listItem <-> todoItem` (в т.ч. ограничения `todoItem` children)
- зафиксировать unit/e2e матрицу multi-step nested преобразований (>2 шагов)

### DEF-006: Cross-browser stability

Риск:

- Chromium может быть стабилен, но Firefox/WebKit могут падать по caret/selection

План:

- прогон matrix suite в 3 браузерах
- фиксация флаков в отдельном stability board

### DEF-007: High-frequency input stress

Риск:

- быстрые последовательности `/`, Enter, Backspace, Undo могут давать race condition

План:

- добавлен `e2e/notion-like-exhaustive.spec.ts` (`REL-006`, mixed stress на 18 итераций)
- расширить до long-run сценариев `REL-001..REL-003` (в т.ч. > 50 операций и mash-ввод)
- `SLASH-021` закрыт automation в `e2e/notion-like-matrix.spec.ts`

### DEF-014: Backspace boundary policy в list item

Риск:

- поведение Backspace на границе non-empty list item может отличаться от продового UX (lift/merge/no-op)
- без формализованной policy высок риск регрессий между браузерами

План:

- зафиксировать целевой UX-policy (Notion-like) для:
  - top-level list item
  - nested list item
  - todo item
- `ENTER-009` закрыт в automation (`e2e/notion-like-matrix.spec.ts`)
- расширить policy на nested/cross-browser сценарии

### DEF-015: Slash start-line / immediate typing instability

Риск:

- `slash` в начале непустой строки нестабилен (`SLASH-010`)
- transform-matrix (`SLASH-022` / `REL-007`) временно quarantined как `fixme`

План:

- стабилизировать selection/caret race в slash-path
- вернуть `e2e/notion-like-transform-matrix.spec.ts` из `fixme` в активный прогон
- снять `fixme` с `SLASH-010` после repeat-run в Chromium
