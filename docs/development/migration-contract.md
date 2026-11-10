# Миграция существующего документа

`@gotipe/migration` преобразует JSON ProseMirror/Tiptap, Slate и Lexical без
загрузки их runtime. Это преобразование данных, а не перенос plugins, history,
selection, collaboration state или пользовательского интерфейса.

```ts
import { convertProseMirrorToGoTipe } from '@gotipe/migration';

const result = convertProseMirrorToGoTipe({
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [{ type: 'text', text: 'Привет 😀', marks: [{ type: 'bold' }] }],
  }],
});

// Inspect warnings and preservedNodes before replacing existing stored content.
const document = result.document;
```

| Вход | Публичная функция |
|---|---|
| ProseMirror / Tiptap `{ type: 'doc', content: [...] }` | `convertProseMirrorToGoTipe(input, options?)` |
| Slate array of elements | `convertSlateToGoTipe(input, options?)` |
| Lexical serialized state `{ root: { type: 'root', children: [...] } }` | `convertLexicalToGoTipe(input, options?)` |

Результат содержит `document`, `warnings`, `preservedNodes` и `skippedNodes`.
Последний равен нулю: неподдерживаемое содержимое не удаляется. Неизвестное
поддерево или непредставимый inline формат сохраняется как `markdownRaw` с JSON
источника и атрибутами `migrationSource` / `migrationType`. Сохраняется структура
JSON, а не исходные пробелы его текстового файла. Предупреждение указывает путь.
При `strict: true` такой случай бросает ошибку вместо выдачи частичного результата.

`onWarning(message)` позволяет собрать предупреждения. `blockTypeMap` и
`markTypeMap` переименовывают известные приложению типы; они не реализуют новую
семантику. `createId()` задаёт генератор уникальных непустых ID. Существующие ID
сохраняются; дубликат заменяется с предупреждением. По умолчанию новые ID создаёт
`crypto.randomUUID()`, поэтому повторная миграция без собственных ID не идемпотентна.

Преобразователи поддерживают распространённые paragraphs, headings, списки,
цитаты, код, таблицы, изображения и marks. Набор исходных имён различается между
редакторами: это не обещание совместимости с любым сторонним plugin. Атрибуты и
дополнительные данные сохраняются, включая `migrationNodeMetadata`,
`migrationDocumentMetadata` и `migrationFirstParagraph` при нормализации списка.
Схема целевого редактора должна объявлять нужные атрибуты и кастомные типы;
строгая схема GoTipe отклоняет незаявленные данные. Проверяйте результат через
`editor.validate(document)` до `editor.setContent(document)` и храните исходник
до завершения проверки на собственных документах.

Некорректный root, циклы, не-JSON значения, неверные поля и структурные лимиты
всегда вызывают ошибку. Пределы: 100 000 посещённых значений, глубина 128 и
32 Mi UTF-16 code units суммарного текста. Преобразование не загружает URL и
не вставляет HTML. Безопасное отображение ссылок и изображений остаётся частью
[контракта редактора](editor-contracts.md) и [asset boundary](assets.md).

CKEditor, TinyMCE и Quill не имеют отдельных JSON-конвертеров в этом пакете.
Для их данных приложению нужен явный адаптер или контролируемый экспорт в
поддерживаемый формат; старые примеры в `17-migration-guide.md` не являются API.
Нет подтверждённого универсального срока миграции или сравнительного ускорения.

Проверка: `pnpm --filter @gotipe/migration test` (Unicode, attrs, вложенность,
неизвестные узлы, strict, malformed input, custom mappings). Пакет также проходит
общую проверку архивов и строгую проверку деклараций в чистом потребителе.
