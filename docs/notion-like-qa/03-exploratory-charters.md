# Notion-like Exploratory Charters

_Last updated: February 14, 2026_

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

## Charter 6: Native IME (RU/JP/KR) in headed mode

Mission:

- пройти реальные OS-level composition сценарии (не synthetic events) в Notion-like editor.

Focus:

- composition-start/update/end на:
  - paragraph
  - listItem
  - todoItem
  - после slash-transform
- Enter/Backspace во время и сразу после composition.
- Undo/Redo после composition.
- стабильность caret/selection (не прыгает в левый край, не теряется block context).

Scenarios:

- RU: кириллица + пробел + Enter в paragraph/todo.
- JP: hiragana -> kanji conversion -> Enter confirm.
- KR: hangul syllable composition + быстрый Backspace.
- mixed: composition в list item, затем slash transform в другой block type.

Artifacts:

- pass/fail таблица по языкам и контекстам.
- short video/gif на каждый дефект caret/selection drift.
- финальный summary по parity gap относительно Notion.

## Charter 7: Headed Gutter Jitter (`+` / drag-handle)

Mission:

- проверить интерактивность левого gutter при агрессивных траекториях мыши в headed-режиме.

Focus:

- toolbar остаётся привязан к текущей строке (не “улетает”).
- `+` кликается сразу после jitter без потери hover-state.
- drag-handle стабильно открывает context menu после jitter.

Scenarios:

- rapid row-to-row jitter (40 проходов).
- jitter burst + immediate plus click (16 проходов, с `undo` для нормализации документа).
- jitter + drag-handle click + `Esc` close (18 проходов).

Artifacts:

- screenshots: `output/playwright/notion-like-headed-gutter-jitter/`
- traces: `output/playwright/notion-like-headed-gutter-jitter-results/**/trace.zip`
- repeat traces: `output/playwright/notion-like-headed-gutter-jitter-results-repeat/**/trace.zip`
