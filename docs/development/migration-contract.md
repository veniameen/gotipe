# Миграция существующего документа

`@gotipe/migration` преобразует JSON ProseMirror/Tiptap, Slate и Lexical без
загрузки их runtime. Это преобразование данных, а не перенос plugins, history,
selection, collaboration state или пользовательского интерфейса.

```ts
import { createEditor, defineExtension } from '@gotipe/core';
import { DefaultPreset } from '@gotipe/core/presets';
import { markdownRawNodeSpec } from '@gotipe/markdown';
import { convertProseMirrorToGoTipe } from '@gotipe/migration';

const MarkdownRaw = defineExtension({ name: 'markdownRaw', nodes: [markdownRawNodeSpec] });
const editor = await createEditor({ extensions: [...DefaultPreset, MarkdownRaw] });
const result = convertProseMirrorToGoTipe({
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [{ type: 'text', text: 'Привет 😀', marks: [{ type: 'bold' }] }],
  }],
});

// Inspect warnings, preserved and unmapped before replacing existing stored content.
if (editor.validate(result.document)) editor.setContent(result.document);
```

| Вход | Публичная функция |
|---|---|
| ProseMirror / Tiptap `{ type: 'doc', content: [...] }` | `convertProseMirrorToGoTipe(input, options?)` |
| Slate array of elements | `convertSlateToGoTipe(input, options?)` |
| Lexical serialized state `{ root: { type: 'root', children: [...] } }` | `convertLexicalToGoTipe(input, options?)` |

## Результат

Результат содержит `document`, `warnings`, `preserved`, `unmapped`, `preservedNodes`
(`preserved.length`) и `skippedNodes`. Последний равен нулю: неподдерживаемое
содержимое не удаляется.

`document` содержит только типы блоков, атрибуты, содержимое, marks и вложенность,
которые объявляют собственные extensions GoTipe. Пакет читает их specs из
`@gotipe/core/extensions` (peer dependency) при первом вызове, а не держит копию.
Документ проходит `editor.validate()` с `FullPreset`, с `DefaultPreset` — если в
нём нет marks и блоков вне пресета (`subscript`, `superscript`, типы из
`blockTypeMap`). Тесты пакета проверяют JS-движок; валидатор Rust применяет те же
правила схемы. Для сохранённых поддеревьев нужен узел `markdownRaw`
(`markdownRawNodeSpec` из `@gotipe/markdown`).

Атрибуты. Блок и mark получают атрибуты, объявленные схемой, со значением
объявленного типа: `level`, `start`, `checked`, `language`/`meta`,
`colspan`/`rowspan`/`align`, `align` абзаца и заголовка, `colWidths`,
`src`/`alt`/`width`/`height`, `href`/`title`/`target`/`rel`, `color`. Известные поля
источника переименовываются: `order` и `params` (prosemirror-markdown), `textAlign`
абзаца, заголовка и ячейки (Tiptap), `colSpan`, `rowSpan`, `altText`, `tag` и `format`
ячейки, абзаца и заголовка со значениями left/center/right/justify (Lexical), `url`
картинки (Slate); `align` Slate уже совпадает. Выравнивание абзаца, ставшего текстом
контейнера (пункта списка, ячейки), записывается в `unmapped`. Остальное попадает в `unmapped`:
поля узлов, marks и inline-элементов, корня, а также повторные, нестроковые ID и ID
абзаца, ставшего текстом контейнера. Запись — `{ blockId, path, sourceType, fields }`:
блок, который держит узел (`null` для корня), путь к объекту источника, тип источника
и исходные значения. Записи идут в порядке источника, записи корня первыми.
`null` означает «не задано» и не переносится. На каждую пару «тип источника + поле»
со значением — одно предупреждение. Значения по умолчанию редактора-источника
(`version`, `direction: "ltr"`, `indent: 0`, `format: ""` у Lexical,
`textAlign: "left"` у Tiptap, также под именем `align`) записываются без предупреждения.

`blockTypeMap` и `markTypeMap` переименовывают типы, но не реализуют новую семантику.
Тип GoTipe получает атрибуты по своей схеме; тип, которого нет среди extensions
GoTipe, получает атрибуты источника без изменений, их объявляет extension приложения.

Структура. Первый абзац элемента списка, задачи, цитаты, callout и ячейки
становится их текстом. Элементы списка вне списка (например, верхнеуровневые
`check-list-item` Slate) получают список. Абзац из одной картинки (inline-картинка
basic schema ProseMirror и Lexical) становится блоком `image`.

Ячейка таблицы содержит текст, а не блоки: её остальные абзацы, заголовки и списки
становятся строками её текста через перевод строки, с marks. Элемент списка
начинается с маркера `• `, `N. ` (от `start` списка), `☐ ` или `☑ `; вложенный
список сдвигается на два пробела на уровень; элемент Lexical, который только держит
вложенный список, своей строки не получает. Таблица остаётся редактируемой, `strict`
не бросает. Каждый такой список или заголовок попадает в `unmapped` полем `block` —
блок GoTipe, которым он был бы, — с предупреждением на пару «ячейка + тип источника».
Код, картинка, цитата или таблица в ячейке (и в списке внутри неё) текстом не
становятся: сохраняется вся таблица.

Неизвестный узел или mark, формат текста без mark, отформатированный код, текст
вперемешку с блоками и токены Lexical сохраняются как `markdownRaw` с `kind: "json"`
и JSON поддерева источника. Сохраняется структура JSON, а не исходные пробелы файла.
`preserved` перечисляет `{ blockId, path, sourceType, reason }`, предупреждение
указывает путь. Где схема не допускает `markdownRaw` (ячейка, цитата, список вне
элемента), сохраняется ближайший предок, который может им быть; записи,
предупреждения и ID поддерева откатываются. При `strict: true` первый такой случай
бросает экспортируемый `UnsupportedContent` (`path`, `reason`) вместо частичного
результата. Поля без атрибута в `strict` не бросают: они в `unmapped`.

`onWarning(message)` получает каждое предупреждение результата после завершения
преобразования. `createId()` задаёт генератор уникальных непустых ID. Существующие
ID сохраняются; дубликат заменяется с предупреждением. По умолчанию новые ID создаёт
`crypto.randomUUID()`, поэтому повторная миграция без собственных ID не идемпотентна.
Генератор вызывается и для блоков поддерева, которое потом сохраняется целиком.

Преобразователи поддерживают распространённые paragraphs, headings, списки,
цитаты, код, таблицы, изображения и marks. Набор исходных имён различается между
редакторами: это не обещание совместимости с любым сторонним plugin. Lexical хранит
вложенный список в отдельном элементе списка; он становится элементом без текста.
Храните исходник до завершения проверки на собственных документах.

Некорректный root, циклы, не-JSON значения, неверные поля и структурные лимиты
всегда вызывают ошибку. Пределы рассчитаны на длинную книгу и ограничивают
враждебный вход: 1 000 000 узлов (объектов с `type`, то есть узлов и marks, и
текстовых листьев Slate), вложенность узлов 128, вложенность массивов и объектов
JSON 512, 16 Mi значений JSON и 32 Mi UTF-16 code units текста всех строк.
Атрибуты и списки детей не считаются узлами и не углубляют вложенность узлов.
Сам редактор отклоняет документ больше 100 000 блоков или глубже 64 уровней:
результат проверяет `editor.validate()`. Преобразование не загружает URL и
не вставляет HTML. Безопасное отображение ссылок и изображений остаётся частью
[контракта редактора](editor-contracts.md) и [asset boundary](assets.md).

CKEditor, TinyMCE и Quill не имеют отдельных JSON-конвертеров в этом пакете.
Для их данных приложению нужен явный адаптер или контролируемый экспорт в
поддерживаемый формат; старые примеры в `17-migration-guide.md` не являются API.
Нет подтверждённого универсального срока миграции или сравнительного ускорения.

Проверка: `pnpm --filter @gotipe/migration test` (Unicode, attrs, вложенность,
неизвестные узлы, strict, malformed input, custom mappings, `unmapped`, откат
поддерева, списки и заголовки в ячейках, 50 000 абзацев в каждом формате, пределы
вложенности и `editor.validate()` реалистичных документов Tiptap, Slate и Lexical с
`DefaultPreset`/`FullPreset` на JS-движке). Пакет также проходит общую проверку
архивов и строгую проверку деклараций в чистом потребителе.
