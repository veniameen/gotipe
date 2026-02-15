# Notion-like Defect Roadmap

_Last updated: February 14, 2026_

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
- для slash-команд добавлен idempotent set-path списка:
  - выбор `Bullet/Numbered/To-do` на уже таком же list-type больше не выполняет unwrap в paragraph

Покрытие:

- `e2e/notion-like-matrix.spec.ts` (`SLASH-004..SLASH-010`)

### DEF-002: Левый toolbar (`+` и drag) “прилипал” к левому краю контейнера

Симптом:

- controls визуально уезжали в левую пустую область, не рядом с блоком

Причина:

- позиционирование было от контейнера (`left: 0`) без привязки к контентной колонке

Фикс:

- `packages/block-editor/src/components/block-editor.tsx`
- вычисление `left` по фиксированной rail-позиции относительно `data-gotipe-content`
- в list/todo сценариях hover-anchor вычисляется по строке (`listItem`/`todoItem`), а не по контейнеру списка
- fallback для левого gutter remap-ит list container в ближайший item по `Y`, чтобы toolbar не “залипал” на первой строке
- разделены:
  - `anchorBlockId` (визуальное позиционирование по строке)
  - `actionBlockId` (действия toolbar на top-level блоке)

Покрытие:

- `e2e/notion-like-matrix.spec.ts` (`UI-006`)
- `e2e/notion-like-checklist-321-350.spec.ts` (`NL-321`, `NL-349`)
- `e2e/notion-like-step2-parity.spec.ts`
  - `toolbar uses fixed X rail across block types and item rows`
  - `toolbar tracks each list item row, not only list container top`
- `e2e/block-toolbar-fast-hover.spec.ts` (обновлён на fixed-rail контракт)

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
- текущий статус: **Closed** (`Automated`, `PASS`)

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
  - добавлен guard для `requestAnimationFrame` restore: если пользователь уже сдвинул каретку/начал ввод, restore не перетирает live selection
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
  - targeted re-check (Chromium): `todo checkbox toggle right after slash transform keeps text in place` + `slash click + immediate typing does not lose first character` — `2/2` PASS

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

### DEF-015: Hover toolbar мог терять интерактивность при заходе курсора на сам toolbar (закрыто)

Симптом:

- `+` / drag-handle иногда исчезали в момент наведения на них
- визуально тулбар появлялся, но клик в быстрых сценариях срывался

Причина:

- в `onMouseMove` path блок вычислялся и сбрасывался даже когда target уже внутри toolbar wrapper

Фикс:

- `packages/block-editor/src/components/block-editor.tsx`
  - добавлен guard: не сбрасывать hover при target внутри
    `.gotipe-block-toolbar` / `.gotipe-block-toolbar-wrapper` / `.gotipe-block-context-menu`

Покрытие:

- `e2e/block-toolbar-fast-hover.spec.ts`
- `e2e/block-toolbar.spec.ts`
- combined regression (`matrix + block-toolbar + fast-hover + checklist-101-150`): `116/116` PASS

### DEF-016: Slash-menu outside click мог приводить к фокус-дрифту (закрыто)

Симптом:

- после клика вне slash-menu возникал нестабильный фокусный переход в разные элементы страницы

Причина:

- outside-close path не предотвращал дефолтный `mousedown` и не имел явного capture-phase контроля

Фикс:

- `packages/block-editor/src/components/slash-menu.tsx`
  - outside-close обработчик переведён на capture-phase `mousedown`
  - добавлен `preventDefault()` + `editor.focus()` restore path

Покрытие:

- `e2e/notion-like-checklist-101-150.spec.ts` (`NL-126`, `NL-134`, `NL-142`, `NL-150`)

### DEF-017: Todo left-zone click мог кратковременно ставить caret на левый край item (закрыто)

Симптом:

- при клике слева от текста `todoItem` появлялся transient caret перед checkbox

Причина:

- нативный mouse path иногда устанавливал range на `<li>` до post-normalization этапа

Фикс:

- `packages/react/src/editor-content.tsx`
  - в `todoItem` добавлен `onMouseDown` guard для левой зоны:
    принудительная постановка range в `[data-gotipe-todo-content]` + синхронный `syncSelectionFromDOM()`

Покрытие:

- `e2e/notion-like-matrix.spec.ts`
  - `todo click in left zone normalizes caret after checkbox (empty item)`
  - `todo click in left zone normalizes caret after checkbox (item with text)`
  - `todo checkbox is vertically aligned with text and has spacing`

### DEF-018: Slash transform `callout -> list/todo` терял текст строки (закрыто)

Симптом:

- при `callout -> bullet/ordered/todo` исходный текст строки мог исчезать

Причина:

- в `toggleList` top-level wrap поддерживал `paragraph/heading/blockquote/codeBlock`,
  но не `callout`
- для `callout` срабатывал fallback `setBlockType(listType)`, который создавал
  некорректный path без явного `listItem`-wrap

Фикс:

- `packages/core/src/chain.ts`
  - `callout` добавлен в безопасный wrap-path для list-transform
  - контент переносится в `listItem/todoItem` без потери текста

Покрытие:

- `e2e/notion-like-checklist-301-320.spec.ts` (`NL-313..NL-315`)
- `e2e/notion-like-checklist-301-320.spec.ts` (`20/20` PASS)

## Active backlog

### DEF-005: Nested list conversion policy (закрыто)

Статус:

- Closed (February 14, 2026)

Что зафиксировано:

- multi-step nested конверсии `listItem <-> todoItem <-> ordered/bullet` без потери deep subtree
- сохранение sibling-элементов и nested children на каждом шаге

Покрытие:

- `e2e/notion-like-backlog-policy.spec.ts` (`DEF-005` baseline)
- `e2e/notion-like-backlog-hardening.spec.ts` (`DEF-005` hardening policy)
- `e2e/notion-like-backlog-hardening-stress.spec.ts` (shared stress/hover hardening pack)
- Chromium: PASS
- Firefox: PASS
- WebKit: PASS
- Chromium repeat (`--repeat-each=2`): PASS

### DEF-006: Cross-browser stability (закрыто)

Статус:

- Closed (February 14, 2026)

Что подтверждено:

- критический pack в Firefox/WebKit: `134/134` PASS
- полный checklist: Firefox `500/500` PASS, WebKit `500/500` PASS
- transform-matrix (включая repeat в Chromium) стабилен и возвращён из quarantine

### DEF-007: High-frequency input stress (закрыто)

Статус:

- Closed (February 14, 2026)

Что зафиксировано:

- long-run цепочки `/`, Enter, Backspace, Undo/Redo не приводят к рассинхрону DOM/state
- проверены mixed-стресс сценарии c переключением block types и history-операциями

Покрытие:

- `e2e/notion-like-exhaustive.spec.ts` (`REL-006`)
- `e2e/notion-like-matrix-planned-reliability.spec.ts` (`REL-001..REL-003`)
- `e2e/notion-like-backlog-policy.spec.ts` (`DEF-007` baseline)
- `e2e/notion-like-backlog-hardening-stress.spec.ts` (`DEF-007` long-run hardening)
- Chromium: PASS
- Firefox: PASS
- WebKit: PASS
- Chromium repeat (`--repeat-each=2`): PASS

### DEF-014: Backspace boundary policy в list item (закрыто)

Статус:

- Closed (February 14, 2026)

Policy:

- Backspace в позиции `offset=0` у non-empty `listItem/todoItem` стабильно переводит строку в `paragraph`
- поведение покрыто для top-level, nested list item и todo item
- Undo/Redo после boundary action сохраняют валидное дерево

Покрытие:

- `e2e/notion-like-matrix.spec.ts` (`ENTER-009`)
- `e2e/notion-like-backlog-policy.spec.ts` (`DEF-014` baseline)
- `e2e/notion-like-backlog-hardening.spec.ts` (`DEF-014` nested + todo policy)
- Chromium: PASS
- Firefox: PASS
- WebKit: PASS

### DEF-021: Deep DnD reordering policy (закрыто)

Статус:

- Closed (February 14, 2026)

Что зафиксировано:

- перенос complex top-level blocks (включая list/todo/code) не ломает дерево
- сохраняются nested children/text markers после drag
- history после drag (`undo/redo`) предсказуемо восстанавливает порядок
- drag после slash-transform не ломает immediate typing

Покрытие:

- `e2e/notion-like-dnd-policy.spec.ts`
- Chromium: `3/3` PASS
- Firefox: `3/3` PASS
- WebKit: `3/3` PASS
- Chromium repeat (`--repeat-each=3`): `9/9` PASS

### DEF-022: IME composition policy baseline (закрыто)

Статус:

- Closed (February 14, 2026)

Что зафиксировано:

- composition insert в paragraph не ломает selection/state
- composition в `todoItem` сохраняет Enter-flow и корректную структуру
- composition после slash-transform (`paragraph -> bullet`) сохраняет тип/текст
- undo/redo после composition остаётся стабильным

Покрытие:

- `e2e/notion-like-ime-policy.spec.ts`
- Chromium: `3/3` PASS
- Firefox: `3/3` PASS
- WebKit: `3/3` PASS
- Chromium repeat (`--repeat-each=3`): `9/9` PASS

### DEF-023: Selection/format/history stress on large docs (закрыто)

Статус:

- Closed (February 14, 2026)

Что зафиксировано:

- массовые mark-toggle операции на paragraph/list/todo не ломают состояние
- mixed loop (`selection + marks + typing + Enter + undo/redo`) стабилен на больших документах
- после stress-циклов сохраняется валидное дерево и предсказуемый history

Покрытие:

- `e2e/notion-like-selection-history-stress.spec.ts`
- Chromium: `3/3` PASS
- Firefox: `3/3` PASS
- WebKit: `3/3` PASS
- Chromium repeat (`--repeat-each=3`): `9/9` PASS

### DEF-024: Cross-block clipboard + marks chain stability (закрыто)

Статус:

- Closed (February 14, 2026)

Что зафиксировано:

- cross-block copy/paste и cut flow не ломают структуру документа
- mark toggles после clipboard-цепочек остаются валидными
- undo/redo после cross-block операций детерминированно восстанавливают state
- rapid mixed loop (`selection + clipboard + marks + history`) стабилен

Покрытие:

- `e2e/notion-like-crossblock-clipboard-stress.spec.ts`
- Chromium: `3/3` PASS
- Firefox: `3/3` PASS
- WebKit: `3/3` PASS
- Chromium repeat (`--repeat-each=3`): `9/9` PASS

### DEF-020: Slash start-line / immediate typing instability (закрыто)

Статус:

- Closed (February 14, 2026)

Что зафиксировано:

- slash в начале строки больше не теряет первый символ immediate typing.
- transform-matrix кейсы immediate typing сняты с `fixme` и возвращены в обязательный прогон.
- стабильность подтверждена в repeat-run и в cross-browser.

Покрытие:

- `e2e/notion-like-transform-matrix.spec.ts`
- Chromium: `72/72` PASS
- Chromium repeat (`--repeat-each=2`): `144/144` PASS
- Firefox: `72/72` PASS
- WebKit: `72/72` PASS

### DEF-025: Nested cross-block range chains stability (закрыто)

Статус:

- Closed (February 14, 2026)

Что зафиксировано:

- range selection через nested `listItem/todoItem` leafs не ломает дерево.
- nested copy/paste + mark toggles сохраняют валидный state и структуру.
- nested cut + undo/redo даёт детерминированное восстановление.
- rapid mixed loop (`nested selection + clipboard + marks + history`) стабилен.

Покрытие:

- helper: `e2e/helpers/notion-crossblock.ts`
- `e2e/notion-like-crossblock-nested-chains.spec.ts`
- Chromium: `3/3` PASS
- Firefox: `3/3` PASS
- WebKit: `3/3` PASS
- Chromium repeat (`--repeat-each=3`): `9/9` PASS

### DEF-026: Integrated mixed-loop stability (`DnD + clipboard + marks + slash`) (закрыто)

Статус:

- Closed (February 14, 2026)

Что зафиксировано:

- mixed nested сценарии с DnD/clipboard/marks/slash в одном цикле не ломают дерево.
- после long-loop операций сохраняются валидные block ids/structure и предсказуемая history.
- slash transform + immediate typing не теряет контекст при последующем DnD/clipboard.

Покрытие:

- helper: `e2e/helpers/notion-chaos.ts`
- `e2e/notion-like-integrated-chaos.spec.ts`
- Chromium: `3/3` PASS
- Firefox: `3/3` PASS
- WebKit: `3/3` PASS
- Chromium repeat (`--repeat-each=3`): `9/9` PASS

### DEF-027: Headed gutter jitter clickability (`+` / drag-handle) (закрыто)

Статус:

- Closed (February 14, 2026)

Что зафиксировано:

- при агрессивных mouse-path jitter toolbar остаётся привязан к строке.
- `+` остаётся кликабельным сразу после jitter burst.
- drag-handle стабильно открывает/закрывает context menu после jitter.

Покрытие:

- `e2e/notion-like-gutter-jitter-headed.spec.ts`
- Chromium headed: `3/3` PASS
- Firefox headed: `3/3` PASS
- WebKit headed: `3/3` PASS
- Chromium headed repeat (`--repeat-each=2`): `6/6` PASS
