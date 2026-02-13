# Notion-like Case Matrix

_Last updated: February 13, 2026_

## Legend

- `Automated`: покрыто e2e
- `Planned`: кейс в roadmap, тест ещё не написан
- `Manual`: пока только ручная проверка
- `Fixme`: кейс автоматизирован/описан, но временно quarantined из-за известной нестабильности

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
| SLASH-008 | bullet -> text | list item корректно выносится в paragraph | Automated |
| SLASH-009 | todo -> heading 1 | item выносится в h1 без потери текста | Automated |
| SLASH-010 | slash в начале непустой строки | существующий текст не удаляется | Fixme |
| SLASH-011 | slash + Enter в пустом paragraph | создаётся целевой блок, caret остаётся в нём | Planned |
| SLASH-012 | slash menu Esc | меню закрывается, редактор остаётся рабочим | Automated |
| SLASH-013 | slash menu click outside | меню закрывается | Automated |
| SLASH-014 | slash query без совпадений | виден empty-state | Planned |
| SLASH-015 | slash в list item с marks | marks не ломаются | Planned |
| SLASH-016 | slash при выделении диапазона | поведение предсказуемое, без краша | Planned |
| SLASH-017 | slash в heading -> paragraph | корректная смена типа | Automated |
| SLASH-018 | slash в nested list | нет потери вложенности | Automated |
| SLASH-019 | slash near viewport bottom | меню флипается вверх | Planned |
| SLASH-020 | slash near right edge | нет горизонтального overflow | Automated |
| SLASH-021 | мгновенный ввод после клика slash-item | первый символ не теряется | Automated |
| SLASH-022 | data-driven source->target matrix (72 перехода) | текст сохраняется, целевой тип корректен | Fixme |
| SLASH-023 | slash keyboard nav (`↑`, `↓`, `Enter`) | выбранная команда применяется без mouse interaction | Automated |

## Enter / Backspace / Caret

| ID | Сценарий | Ожидание | Статус |
|---|---|---|---|
| ENTER-001 | Enter в paragraph | split на новый paragraph | Automated |
| ENTER-002 | Enter в пустом paragraph | новая строка сразу видима | Automated |
| ENTER-003 | Shift+Enter | soft break в том же блоке | Automated |
| ENTER-004 | Enter в non-empty todo | создаётся новый todoItem | Automated |
| ENTER-005 | Enter в empty todo | выход в paragraph | Automated |
| ENTER-006 | Enter в bullet item | новый listItem | Automated |
| ENTER-007 | Enter в ordered item | новый listItem | Automated |
| ENTER-008 | Backspace в начале блока | merge с предыдущим блоком | Automated |
| ENTER-009 | Backspace в начале второго list item | корректный list behavior | Automated |
| ENTER-010 | Undo/Redo после slash-transform | дерево документа восстанавливается корректно | Planned |
| ENTER-011 | Caret в пустом todo сразу после slash | каретка после checkbox в text-host, не на левом краю list | Automated |
| ENTER-012 | Enter в code block | вставляется `\\n` в этом же блоке, без дублирования code block | Automated |
| ENTER-013 | Escape в code block | создаётся paragraph после блока и каретка переходит в него | Automated |

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
| UI-009 | todo checkbox/text alignment | checkbox и текст выровнены по вертикали, есть стабильный gap | Automated |

## Надёжность и стресс

| ID | Сценарий | Ожидание | Статус |
|---|---|---|---|
| REL-001 | 50 последовательных slash-трансформаций | нет краша и рассинхрона DOM/state | Planned |
| REL-002 | paste + slash + undo chain | стабильный state | Planned |
| REL-003 | быстрый ввод + Enter mash | нет потери блоков | Planned |
| REL-004 | Firefox run | критические кейсы стабильны | Planned |
| REL-005 | WebKit run | критические кейсы стабильны | Planned |
| REL-006 | mixed stress create/change/delete (18 итераций) | нет краша, маркеры не теряются в каждой итерации | Automated |
| REL-007 | transform-matrix repeat runs | нет флаков на `repeat-each=2` | Fixme |
