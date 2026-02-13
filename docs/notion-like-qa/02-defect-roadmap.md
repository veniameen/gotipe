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

### DEF-008: Каретка в пустом todo оказывалась слева от checkbox

Симптом:

- после `/todo` каретка могла остаться в list-контейнере (или в левом краю item)
- фактический ввод начинался “вдруг” уже справа от checkbox только после первого символа

Причина:

- selection после slash-команды могла дрейфовать в `todoList` контейнер
- restore и sync selection не всегда принудительно нормализовали точку в text-host `todoItem`

Фикс:

- `packages/core/src/editor.ts`
  - нормализация list container -> list item в `resolvePosition`
  - нормализация `resolveDomPoint` для list container в первый item
- `packages/block-editor/src/components/slash-menu.tsx`
  - пост-командная нормализация selection + принудительная DOM-постановка каретки
- `packages/react/src/editor-content.tsx`
  - явный `data-gotipe-todo-content` host + `contentEditable={false}` на checkbox

Покрытие:

- `e2e/notion-like-matrix.spec.ts` (`ENTER-011`, `UI-009`)

## Active backlog

### DEF-005: Nested list conversion policy

Риск:

- при сложной вложенности возможны неожиданные эффекты при конвертации listItem <-> todoItem

План:

- добавить сценарии `SLASH-018`, `ENTER-009`
- при необходимости доработать сохранение children при lift/convert

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

- добавить stress-тесты `REL-001..REL-003`
