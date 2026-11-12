# Карта кода и границ

| Область | Владелец | Контракт |
|---|---|---|
| Документ/транзакции | `crates/gotipe-core`, `gotipe-schema` | блоки, marks, UTF-16 offsets, атомарность |
| JS и DOM-ввод | `packages/core/src` | createEditor, extensions, selection/history/clipboard |
| WASM | `crates/gotipe-wasm`, `packages/wasm`, core/wasm-bridge | тот же контракт, явная загрузка |
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
React/content/table-layout владеет временной шириной при drag и controls.


Контракты редактора и review: [editor-contracts.md](editor-contracts.md).
Внутри `core/src` владение разделено так:

| Поток | Владелец |
|---|---|
| Public document JSON / атрибуты / selection | `document/decode.ts`, `attributes.ts`, `selection.ts` |
| Схема и предварительная атомарная проверка JS/WASM | `engine/schema.ts`, `validate.ts`, `js-transactions.ts`, `wasm-bridge.ts` |
| История, фильтры и события транзакций | `editor/transactions.ts`, `transaction-hooks.ts` |
| Lifecycle extensions/plugins и decoration layers | `editor/extension-lifecycle.ts` |
| Настроенные paste rules и изолированный draft | `editor/clipboard-options.ts`, `clipboard/paste-rules.ts` |
| Вставка с учётом разрешённых детей контейнера | `commands/insertion-point.ts`, `commands/structure-commands.ts` |

`editor.ts` связывает владельцев. Команды получают узкий query разрешённых детей
из собранной схемы; кастомные контейнеры не требуют веток по имени приложения.

DOCX: `crates/gotipe-export/src/docx.rs` owns OOXML rendering; `docx/package.rs`
owns OPC parts and relationships. ZIP is a container codec, not a document model.

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

`react/src/content/code-text.tsx` сохраняет native selection при смене только
подсветки, используя чистое чтение `editor.getDOMSelection()`. Транзакционное
выделение остаётся во владении ядра. Перерисовка токенов откладывается до завершения
native composition и её DOM reconciliation; listeners/frame очищаются при смене
редактора, destroy и unmount.

HTML/SSR: `packages/core/src/serialization/html.ts` owns the canonical serializer;
`html-styles.ts` supplies optional neutral export styles. Core `serializeHtml`,
server rendering and the HTML export wrapper share this implementation.

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
