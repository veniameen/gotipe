# Notion-like Case Matrix

_Last updated: February 13, 2026_

## Legend

- `Automated`: покрыто e2e
- `Planned`: кейс в roadmap, тест ещё не написан
- `Manual`: пока только ручная проверка

## Slash & Block Transform

| ID | Сценарий | Ожидание | Статус |
|---|---|---|---|
| SLASH-001 | paragraph -> bullet | создаётся listItem, строка не пропадает | Automated |
| SLASH-002 | paragraph -> ordered | создаётся ordered list item | Automated |
| SLASH-003 | paragraph -> todo | создаётся todoItem | Automated |
| SLASH-004 | todo -> bullet | сохраняется текст текущей строки | Automated |
| SLASH-005 | todo -> ordered | сохраняется текст текущей строки | Automated |
| SLASH-006 | bullet -> todo | сохраняется текст текущей строки | Automated |
| SLASH-007 | ordered -> bullet | сохраняется текст текущей строки | Automated |
| SLASH-008 | bullet -> text | list item корректно выносится в paragraph | Planned |
| SLASH-009 | todo -> heading 1 | item выносится в h1 без потери текста | Planned |
| SLASH-010 | slash в начале непустой строки | существующий текст не удаляется | Automated |
| SLASH-011 | slash + Enter в пустом paragraph | создаётся целевой блок, caret остаётся в нём | Planned |
| SLASH-012 | slash menu Esc | меню закрывается, редактор остаётся рабочим | Automated |
| SLASH-013 | slash menu click outside | меню закрывается | Automated |
| SLASH-014 | slash query без совпадений | виден empty-state | Planned |
| SLASH-015 | slash в list item с marks | marks не ломаются | Planned |
| SLASH-016 | slash при выделении диапазона | поведение предсказуемое, без краша | Planned |
| SLASH-017 | slash в heading -> paragraph | корректная смена типа | Planned |
| SLASH-018 | slash в nested list | нет потери вложенности | Planned |
| SLASH-019 | slash near viewport bottom | меню флипается вверх | Planned |
| SLASH-020 | slash near right edge | нет горизонтального overflow | Automated |

## Enter / Backspace / Caret

| ID | Сценарий | Ожидание | Статус |
|---|---|---|---|
| ENTER-001 | Enter в paragraph | split на новый paragraph | Automated |
| ENTER-002 | Enter в пустом paragraph | новая строка сразу видима | Automated |
| ENTER-003 | Shift+Enter | soft break в том же блоке | Automated |
| ENTER-004 | Enter в non-empty todo | создаётся новый todoItem | Automated |
| ENTER-005 | Enter в empty todo | выход в paragraph | Automated |
| ENTER-006 | Enter в bullet item | новый listItem | Planned |
| ENTER-007 | Enter в ordered item | новый listItem | Planned |
| ENTER-008 | Backspace в начале блока | merge с предыдущим блоком | Planned |
| ENTER-009 | Backspace в начале второго list item | корректный list behavior | Planned |
| ENTER-010 | Undo/Redo после slash-transform | дерево документа восстанавливается корректно | Planned |

## Selection / Formatting

| ID | Сценарий | Ожидание | Статус |
|---|---|---|---|
| SEL-001 | bubble menu bold/italic | выделение не теряется визуально | Automated |
| SEL-002 | toolbar bold/italic (simple/agent) | selection остаётся активным | Automated |
| SEL-003 | headless bold | focus возвращается в редактор | Automated |
| SEL-004 | slash transform после выделения | selection/caret не ломаются | Planned |
| SEL-005 | mark toggle на list item | marks применяются без артефактов | Planned |

## UI / Layout / Theme

| ID | Сценарий | Ожидание | Статус |
|---|---|---|---|
| UI-001 | slash menu width/height | компактный размер в пределах лимитов | Automated |
| UI-002 | slash menu не прыгает в левый верхний угол | меню у каретки | Automated |
| UI-003 | slash menu no horizontal overflow | контент не вылезает | Automated |
| UI-004 | light theme slash menu | светлая тема корректная | Automated |
| UI-005 | dark theme slash menu | тёмная тема корректная | Automated |
| UI-006 | block toolbar gutter anchor | `+` и drag рядом с блоком | Automated |
| UI-007 | mobile width behavior | меню не ломает layout на узком экране | Planned |
| UI-008 | long command titles | ellipsis без разрыва layout | Planned |

## Надёжность и стресс

| ID | Сценарий | Ожидание | Статус |
|---|---|---|---|
| REL-001 | 50 последовательных slash-трансформаций | нет краша и рассинхрона DOM/state | Planned |
| REL-002 | paste + slash + undo chain | стабильный state | Planned |
| REL-003 | быстрый ввод + Enter mash | нет потери блоков | Planned |
| REL-004 | Firefox run | критические кейсы стабильны | Planned |
| REL-005 | WebKit run | критические кейсы стабильны | Planned |
