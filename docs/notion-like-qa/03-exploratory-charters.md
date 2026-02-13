# Notion-like Exploratory Charters

_Last updated: February 13, 2026_

## Charter 1: Slash in every block type

Mission:

- пройти slash-команды в `paragraph`, `heading`, `listItem`, `todoItem`, `blockquote`, `codeBlock`

Focus:

- пропадает ли строка
- корректно ли удаляется trigger `/query`
- где остаётся caret после выполнения

Artifacts:

- короткий log `pass/fail` по каждому типу блока
- скриншот на любой визуальный баг

## Charter 2: List conversion torture

Mission:

- многошаговые последовательности:
  - `paragraph -> bullet -> todo -> ordered -> text`
  - `todo -> heading -> bullet -> text`

Focus:

- сохраняется ли текст каждой строки
- не ломается ли структура родительского списка
- корректность Undo/Redo после цепочки

## Charter 3: Enter/Backspace edge cases

Mission:

- проверить начало/конец блока и пустые блоки в list/todo

Focus:

- Enter в empty item
- Backspace в начале второго item
- merge/split без потери caret

## Charter 4: Theme and visual parity

Mission:

- проверить light/dark визуально на slash-menu и block toolbar

Focus:

- контраст текста
- hover/selected states
- отступы и отсутствие overflow

## Charter 5: Accessibility sanity

Mission:

- быстрый проход ARIA и keyboard-навигации slash-menu

Focus:

- `ArrowUp/ArrowDown/Enter/Escape`
- фокус не теряется на кнопках вне editor content
- нет keyboard trap
