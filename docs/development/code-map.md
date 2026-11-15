# Карта кода и границ

| Область | Владелец | Контракт |
|---|---|---|
| Документ/транзакции | `crates/gotipe-core`, `gotipe-schema` | блоки, marks, UTF-16 offsets, атомарность |
| JS и DOM-ввод | `packages/core/src` | createEditor, extensions, selection/history/clipboard |
| WASM | `crates/gotipe-wasm`, `packages/wasm`, core/wasm-bridge | тот же контракт, явная загрузка; в Node — условие `node` (`packages/wasm/node.js`) читает бинарник из пакета |
| Markdown | `packages/markdown/src` | parser/serializer/source-map, нетронутые байты |
| Синхронизация | `crates/gotipe-crdt`, `packages/collaboration` | convergence, transport, awareness |
| Адаптеры | `packages/react`, `vue`, `svelte`, `solid` | render/subscription/lifecycle, один документ |
| UI | `packages/block-editor`, `block-editor-vue`, `ai-ui` | views/commands через публичный core |
| Тема | `packages/theme/src/design-tokens.json`, generated CSS и presets | один источник tokens; scoped theme lifecycle |
| Review/версии | `packages/comments`, `suggestions`, `versions` | IDs, anchors, apply/reject/restore |
| AI | `packages/ai`, `crates/gotipe-ai` | provider, stream/cancel/error, правки |
| Экспорт/миграция | `packages/export`, `migration`, `crates/gotipe-export` | валидные форматы, явные ограничения |
| HTTP SDK | `packages/sdk` | Cloud client без UI |
| Cloud | `apps/cloud/internal` | auth/storage/sync/workers, права до доступа |
| Примеры | `apps/playground/src` | composition roots публичных API |
| Проверки | `scripts/quality`, `.github/workflows` | architecture/build/test/packaging |

Направление: приложения → UI/адаптеры/features → core → WASM.
Markdown и SDK самостоятельны. Core использует собственный `@gotipe/markdown`
для одинаковой сериализации в JS/WASM и не зависит от UI/адаптеров/демонстраций.
Между пакетами — public exports; внутренние модули не импортируют свой index
по кругу. Перенос entry point обновляет карту и потребителей.

GoTipe не владеет Wiki приложения-хоста: страницы, файловое дерево, вкладки,
сохранение и сценарии модели принадлежат потребителю. В playground основной пример
показывает Page/Block варианты библиотеки. `apps/playground/tests/csp` — отдельный
технический consumer для CSP-проверки публичного JS entry, без продуктового маршрута.

Размеры 600 строк / 24 прямых файла не заменяют review ответственности.
Чистая функция, state controller, транспорт и UI разделяются по причинам
изменения. Не передавай весь контекст ради удобства.

Медиа: core/assets отвечает за durable storage boundary; React/media — загрузку,
отмену, диалоги, preview/crop/resize. PageEditor переиспользует эти компоненты.
Таблицы: core/tables планирует одну атомарную структурную операцию;
`core/table/grid.ts` — сетка HTML (охваты, позиции, диапазон по объединённым ячейкам),
`table/layout.ts` — план правки и проверка сетки, `table/steps.ts` — шаги с сохранением
ID, `table/navigation.ts` — соседняя ячейка для Tab/Shift+Tab в пределах своей таблицы;
Rust-копия — `crates/gotipe-core/src/table` (`edit_table`), общие случаи —
`crates/gotipe-core/tests/fixtures/table-edits.json`.
React/content/table-layout владеет временной шириной при drag и controls,
`table-cells.tsx` — охватами ячеек и выделением ячеек; меню «Ячейки» —
`block-editor/src/table/cell-actions.ts`.


Контракты редактора и review: [editor-contracts.md](editor-contracts.md).
Внутри `core/src` владение разделено так:

| Поток | Владелец |
|---|---|
| Public document JSON / атрибуты / selection | `document/decode.ts`, `attributes.ts`, `selection.ts` |
| ID блоков и записей всех пакетов (UUID v4 и без безопасного контекста, HTTP) | `document/id.ts` — публичный `createId()`; прямой `crypto.randomUUID()` в `packages/` отклоняет `check:architecture` |
| Схема и предварительная атомарная проверка JS/WASM | `engine/schema.ts`, `validate.ts`, `js-transactions.ts`, `wasm-bridge.ts` |
| История, фильтры и события транзакций | `editor/transactions.ts`, `transaction-hooks.ts` |
| Lifecycle extensions/plugins и decoration layers | `editor/extension-lifecycle.ts` |
| Настроенные paste rules и изолированный draft | `editor/clipboard-options.ts`, `clipboard/paste-rules.ts` |
| Хуки вставки простого текста (`transformPastedText`, `parsePastedText`) | `clipboard/handler.ts` (`pasteText`), контекст со схемой — `editor/clipboard-options.ts` |
| Состояние расширения вне документа (поиск, счётчик, слои) — один контроллер на редактор | `extensions/scoped.ts`; владельцы — `extensions/find-replace`, `character-count`, `decorations`, `trailing-node.ts` |
| Правила ввода у каретки (типографика, автоссылки) | `extensions/typing/caret.ts`, `typing/typography.ts`, `links/` |
| Поиск регулярным выражением: Worker с прерыванием по таймауту, без Worker — статическая проверка | `extensions/find-replace/worker.ts`, `scan.ts` (общий сканер страницы и Worker), `guard.ts` |
| Шрифт, размер и направление текста: значения и проверки одни для команд, HTML и импорта | `document/text-style.ts`; команды — `extensions/text-style.ts`, `text-direction.ts`; Rust — `gotipe-export/src/html/text_style.rs` |
| IME в рендерерах: `editor.isComposing`, удержание декораций составляемого блока | `editor/mount.ts`; React `content/decorations.ts` (`holdComposing`), Vue `decorations.ts` |
| Вставка с учётом разрешённых детей контейнера | `commands/insertion-point.ts`, `commands/structure-commands.ts` |
| Наложение mark на span: замена того же типа, exclusive group | `engine/mark-rules.ts` = `crates/gotipe-core/src/transform/marks.rs` |
| Атомарная разметка: атомы, нормализация шагов, края | `engine/atoms.ts` = `crates/gotipe-core/src/atoms.rs`; выделение — `editor/atom-selection.ts`; ключи — `engine/atom-keys.ts`; поддержка атомов (`atomSupport`: чужой текст `engine/remote-atoms.ts` и `editor/remote-atom-repair.ts`, HTML `document/html-atoms.ts`) — `extensions/atoms/support.ts`, вне графа ядра |
| Атомы строки и подсказки по символу | `extensions/atoms/`, `extensions/suggestion/`; эмодзи — вход `emoji.ts` (русские имена — `emoji-ru.ts`); TeX → MathML — вход `math.ts` (`math/`); каретка у атома — `dom/selection.ts`. Вид атомов — React `content/atoms.tsx`, Vue `atoms.ts`; списки, выбор эмодзи и поле формулы — `block-editor/src/atoms/` |

`editor.ts` связывает владельцев. Команды получают узкий query собранной схемы
(`commands/schema.ts`: разрешённые дети, marks блока, exclusive group, defaults атрибутов,
`values`); кастомные контейнеры не требуют веток по имени приложения.

DOCX: `crates/gotipe-export/src/docx.rs` owns OOXML rendering; `docx/package.rs`
owns OPC parts and relationships. ZIP is a container codec, not a document model.
PDF and DOCX share `links.rs` (which references become links, attachment labels) and
`assets.rs` (bounded decoding of embedded PNG/JPEG/GIF/WebP).

PDF: `crates/gotipe-export/src/pdf.rs` owns options and export orchestration;
`pdf/validation.rs` checks complete supported structure before rendering, including
explicit rejection of content/children that a leaf or structural container cannot hold.
`pdf/layout.rs`, `inline.rs`, `table.rs` and `flow.rs` own GoTipe block layout,
line wrapping, merged cells and page boundaries. `pagination.rs` fills remaining
page space by splitting large measured fragments at intact text/image boundaries.
`highlight.rs` owns code token
presentation. `fonts.rs`/`text.rs` own embedded font selection and shaping;
`font_embedding.rs`, `images.rs`, `outlines.rs` and `writer.rs` own PDF resources,
bookmarks and serialization. `semantics.rs` attaches block roles before pagination;
`tagging.rs` owns the connected PDF structure/MCID/annotation tree and `metadata.rs`
owns XMP. The same Rust path runs natively and in optional
export WASM; no Typst compiler or host browser printing is used.
Миграция JSON: `packages/migration/src` содержит отдельный конвертер каждого
источника и общий владелец IDs/предупреждений/сохранения неизвестных данных.
Поддерживаемый API и границы: [migration-contract.md](migration-contract.md).

Жесты ручки: `block-editor/src/interaction/use-touch-drag.ts` владеет одним touch/pen
pointer, таймером удержания, capture, edge scroll и cleanup. PageEditor и BlockEditor
передают hit testing/indicator/move callbacks; `components/block-interaction.ts` остаётся
владельцем разрешённого перемещения строки и одной undoable транзакции.

`interaction/block-text-metrics.ts` измеряет только собственный текст блока;
`data-gotipe-text-content` имеет приоритет, controls/widgets и чужие вложенные блоки
не могут смещать ручку или область наведения.

`react/src/content/decorations.ts` и `vue/src/decorations.ts` приводят все виды декораций
ядра к диапазонам, виджетам и атрибутам блока с одними классами; `text-renderer.tsx` и
`vue/src/text.ts` их рисуют. `react/src/content/selection-keeper.tsx` (во Vue — хуки
`EditorContent`) сохраняет native selection, когда изменился только слой декораций.

`react/src/content/code-text.tsx` сохраняет native selection при смене только
подсветки, используя чистое чтение `editor.getDOMSelection()`. Транзакционное
выделение остаётся во владении ядра. Перерисовка токенов откладывается до завершения
native composition и её DOM reconciliation; listeners/frame очищаются при смене
редактора, destroy и unmount.

Переносы строк Markdown (D-88): мягкий перенос читается пробелом в обоих читателях
(`markdown/src/grammar/inline.ts`, `crates/gotipe-export/src/markdown_parse/inline.rs`);
`"\n"` документа пишется жёстким переносом в `inline-serialize.ts`. Rust-писатель текста — перенос
`writeInline` (D-97): единицы `crates/gotipe-export/src/markdown/units.rs` (как
`serialization/inline-units.ts`), шаги `inline.rs`, `characters.rs` (как пишется набранный
символ), `escapes.rs` (как `serialization/escapes.ts`) и `autolink_escapes.rs`; строки ссылок,
адреса и подписи ссылок и картинок — `links.rs`; уровень записи
выбирает проверка чтением `verify.rs` (как `renderVerified`). Голые адреса GFM находят `markdown/src/grammar/autolinks.ts` и
`markdown_parse/autolinks.rs` — одни правила для читателя и писателя. Концы строк правленого блока
и их написание по снимку возвращает `markdown/src/serialization/line-breaks.ts`; промежуток без
пустой строки у переписанного соседа `serialize.ts` оставляет, только если пара читается с ним так
же, как с пустой строкой (D-99). Отступ первой строки блока снимок держит в конце промежутка перед
ним; `separators` в `serialize.ts` пишет его с блоком: сохранённый блок держит его, пока остаётся
отдельным блоком, переписанный пишется без него; блок, который ушёл бы в предыдущий, удерживает
исходный отступ предыдущего, иначе переписывается (D-102). Блочные защиты TS без снимка
(`resolveHazards` в `markdown/src/serialization/hazards.ts`, `isBlockEmpty`, `cannotInterrupt`)
Rust-писатель повторяет в `markdown/hazards.rs` (D-100). Пункты сырого списка рядом с сырым
списком того же маркера получают другой маркер (D-107); ограждение или HTML, которые закрыл конец
файла, получают свою закрывающую строку, когда за ними есть блок (D-106,
`serialization/closing.ts`). Что читается после такой правки, писатели проверяют чтением структуры
блоков: `readBlockNodes` в `grammar/blocks.ts`, в Rust — `markdown_parse/structure.rs`. Защиту
соседних списков (`separateLists`, в Rust `separate`) писатели применяют и к детям любого блока
(`siblingBlocks` в `serialization/hazards.ts`, `hazards::children`, D-105). Ленивую строку пункт
списка берёт, только если его содержимое читает её текстом абзаца (`lazyReading` в
`grammar/lists.ts`, `lazy_reading` в `markdown_parse/lists.rs`, D-101). Общие случаи —
`markdown-line-breaks.json`, `markdown-write-read.json` и `markdown-nested-write-read.json` в
`crates/gotipe-export/tests/fixtures/`.

HTML/SSR: `packages/core/src/serialization/html.ts` owns the canonical serializer;
`html-styles.ts` supplies optional neutral export styles. `getHTML()` on both engines
(`wasm-bridge.ts`), core `serializeHtml`, server rendering and the HTML export wrapper
call this implementation. The native `crates/gotipe-export/src/html.rs` (Cloud,
`gotipe-convert html`) is a separate port that must stay byte-identical: both suites
check `crates/gotipe-export/tests/fixtures/html-parity.json`. `html/js.rs` mirrors the
JavaScript attribute conversions, `html/safety.rs` the URL and color checks.

Нативный IME: `core/src/input/composition.ts` планирует одну транзакцию ввода,
`composition-dom.ts` временно сохраняет идентичность затронутых DOM-узлов до передачи
документа обратно renderer. Браузерная перестройка DOM не является моделью документа.
`composition-interruption.ts` owns recoverable `COMPOSITION_CONFLICT` and suppression of
late input after a concurrent mutation. Transaction/history, document replacement and CRDT
receive boundaries interrupt before writing the model, so old snapshots never restore over
new renderer nodes. Presentation layers queue their latest update until composition
reconciliation; awareness decorations do not interrupt IME. React `CodeText` cancels an old resume frame on the next compositionstart
and releases deferred tokens on the `compositionInterrupted` lifecycle event without
consuming the application error channel.

`editor.getDOMSelection()` — чистый public read через существующий `core/src/dom/selection.ts`;
React captures native selection before presentation-only DOM replacement without changing
the model snapshot or implementing a second DOM-to-document mapper.

Поиск, счётчик и раскладка текста в UI (Атлас, кадры 25–28): `block-editor/src/text/` — строка
поиска (`find-bar.tsx`, клавиши `find-keys.ts`), строка счётчика и слой текста за пределом
(`status-line.tsx`, `over-limit.ts`), выравнивание в «Ещё» и в панели (`align.tsx`), шрифт и размер
(`font.tsx`), переключатель ¶ (`invisibles.tsx`), ручка блока справа налево (`direction.ts`).
`BlockEditor` только подключает их; вид — `theme/src/theme/{find,status,text-style}.css`.

Закреплённая панель вида modern (Атлас, кадр 31): `block-editor/src/toolbar/`. `fixed-toolbar.tsx`
(`FixedToolbar`) связывает полосу и «Ещё»; состав и порядок ухода — `units.tsx`; что уходит в «Ещё» —
чистый `overflow.ts`, измерение — `measure.ts`; одна остановка Tab и стрелки — `roving.ts`;
«Вставить» по командам «/» — `insert-menu.tsx`; что умеет редактор (шрифты, ¶) — `support.ts`.
Причина недоступного инструмента — `components/formatting/reasons.ts`, она же подсказка и
`aria-describedby`; есть ли mark в схеме (шрифты панели, индексы «Ещё») — `formatting/schema.ts`.
⌘K (`openLinkDialog`) слушает один владелец на редактор, `formatting/link-shortcut.ts`: поле
открывает `LinkEditor` пузыря, без пузыря — панели. Вид — `theme/src/theme/toolbar.css`.

Картинки и файлы в React: `react/src/content/media-view.tsx` рисует их только для чтения,
`content/media-blocks.ts` — `MediaBlocksContext`. Редактирование (загрузка, ссылка, размер,
кадрирование, подпись, alt, просмотр, меню действий) — отдельный вход `@gotipe/react/media`
(`react/src/media/index.ts`); основной вход React его не импортирует (`media-entry.test.tsx`).
`block-editor/src/components/editor-providers.tsx` подключает его вместе со строками и атомами.

Строки интерфейса: `@gotipe/i18n` (`i18n/src/locales/`) несёт то, что рисует `@gotipe/react`,
и общие слова; строки самого блочного редактора — `block-editor/src/i18n/{en,ru}.ts` (ключи —
тип `BlockEditorTranslationKey`, `i18n/src/block-editor-keys.ts`). `withBlockEditorStrings`
кладёт их под `I18n` хоста; компоненты блочного редактора читают `useBlockEditorI18n()`.
