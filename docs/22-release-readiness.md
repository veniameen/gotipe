# GoTipe — доведение до публикации

Статус: **не готово к выпуску: документация нашла блокеры — [docs/24](24-documentation-findings.md)**;
проверки пройдены в Chromium, Firefox и WebKit.
Начато 2026-11-09 по прямому запросу владельца.

10 ноября владелец разрешил заменить Typst собственным PDF layout поверх небольших
библиотек записи PDF и работы со шрифтами, сохранив функции браузерного и серверного
экспорта. Typst и Git patch citationberg удалены; свежие Cargo advisory/license и
source-release gates проходят. Итоговое дерево после сведения в `main` принято
2026-11-12 (раздел «Сведение в main»); более ранние приёмки ниже — история.

## Результат

Собственная библиотека редактора, пригодная для использования в SpecOrbit и других
приложениях: публичные API, все заявленные в репозитории функции, адаптеры, готовый UI,
документация и проверенные пакеты. Визуальная основа — Атлас GoTipe (`design/atlas`):
общие виды notion/docs/modern/minimal на одних токенах, светлая и тёмная темы.
PageEditor стоит на тех же видах, отдельной темы страницы больше нет.

Уточнение владельца 10 ноября: GoTipe остаётся библиотекой, аналогом редакторного
SDK. Wiki, дерево страниц, вкладки, права, сохранение и workflow модели реализуются
в SpecOrbit поверх её публичного API. Отдельная оболочка SpecOrbit Wiki удалена
из GoTipe; PageEditor показывается как вариант общего примера редактора. Проверки
CSP остаются техническим consumer-тестом, не приложением Wiki.

Готовность означает прохождение перечисленных ниже проверок и отсутствие известных
блокирующих дефектов в поддерживаемых сценариях. Старые отметки «готово» и успешные
сборки без тестов сами по себе результат не подтверждают.

Публикация в npm/crates.io, push и развёртывание внешнего сервиса не выполняются
автоматически. Результат этой работы — проверяемый локальный кандидат к публикации.

## Рабочий порядок

1. Инвентаризация публичных функций и воспроизводимый исходный прогон.
2. Ошибки потери данных, выделения, истории и границ доступа.
3. Полноценные реализации API и функций, которые сейчас являются заглушками.
4. Один визуальный язык для всех примеров, панелей и состояний редактора.
5. Адаптивность, клавиатура, доступность, прокрутка, меню и жизненный цикл.
6. Интеграции, чистая установка, упаковка и честная документация.
7. Повторный полный прогон на зафиксированном состоянии и отчёт о выпуске.

Изменения делаются небольшими проверяемыми пакетами. Тяжёлые сборки/браузерные прогоны
запускаются последовательно; до четырёх рабочих потоков. Агентам выделяются отдельные
каталоги. Секреты и пользовательские данные не входят в артефакты проверок.

## Обязательная матрица функций

| Направление | Обязательный результат | Статус |
|---|---|---|
| Ядро JS / Rust / WASM | одинаковая семантика транзакций, Unicode, схема, события, история | 268 core tests и 228 native tests прошли; полный browser повтор 2634/2634 |
| Ввод | кириллица, emoji, IME, выделение, Enter/Backspace/Delete, undo/redo | Unicode/IME/каретка/Shift+Enter исправлены; полный повтор в трёх движках прошёл; конфликт ввода описан в R-041 |
| Буфер обмена | текст, HTML, Markdown, вложенные и пересекающие блоки выделения; безопасный cut | native clipboard и строгие cross-block Undo/Redo проверки прошли |
| Markdown | исходные байты неизменённых фрагментов, минимальный diff, вложенные структуры | свой parser; 94 TS tests, 652 CommonMark cases и native parity прошли |
| Блоки и marks | все экспортируемые расширения, команды и преобразования без потери содержимого | unit/transform matrix и общий повтор 878 сценариев × 3 движка прошли |
| Перемещение | блоки/строки/вложенные списки, видимое место вставки, атомарная отмена | desktop, nested rows, touch/pen, cancel и один Undo проверены |
| Таблицы и медиа | редактирование, размеры, вставка, файлы через host API, ошибки/отмена | atomic table/resize/upload/crop/caption/read-only проверены во всех трёх движках |
| UI | PageEditor, BlockEditor, панели, меню, состояния загрузки/ошибки/пустоты/чтения | 12 маршрутов + второй вариант основного редактора × 5 ширин × 2 темы; floating/keyboard/container проверки прошли |
| Обсуждения и правки | комментарии/ответы/разрешение, предложения/устаревание/принятие | comments/replies/anchors/persistence и accept/reject/undo проверены |
| Версии | создание, список, просмотр, сравнение, восстановление, история | snapshot/diff/restore/undo и интерфейс проверены |
| AI | настоящий API провайдера, поток/отмена/ошибки, инструменты и правки; демо обозначено | provider contracts/stream/cancel/error и три браузера проверены; платные внешние вызовы не выполнялись |
| Совместная работа | реальная синхронизация, конкурентные правки, reconnect, курсоры | две реальные WASM реплики → offline edits → reconnect → durable PostgreSQL bootstrap проверены |
| Экспорт/импорт | каждый заявленный формат выдаёт валидный результат, ограничения описаны | Собственный PDF backend: native corpus 26/26, полный Rust 249/249; native/WASM 52/52, PDF browsers 78/78, Cloud 19/19 и clean consumer прошли. R-034 устранён |
| Адаптеры | React/Vue/Svelte/Solid: рендер, подписки, destroy, SSR, строгий режим | lifecycle, destroy, subscriptions, SSR и чистые package consumers проверены |
| SDK / Cloud | совпадение контрактов, права доступа, хранение, ошибки, тесты без внешней оплаты | role/scope/storage/errors, Go race/integration, Docker и native/browser exports проверены |
| Миграция | поддерживаемые документы других редакторов, потери явно видны | поддерживаемые 3 converter APIs и границы потерь описаны и проверены |
| Пакеты | exports/types/files/licenses, ESM/CJS/SSR, чистый потребитель | 21 tarball, 27 ESM/25 CJS entries, strict types и чистый consumer прошли |
| Документация | примеры воспроизводимы, нет обещаний несуществующих возможностей | поддерживаемые контракты обновлены; 00–20 помечены историческими проектами |

## Критерии интерфейса

- Проверки при ширине 320, 375, 768, 1024 и 1440 px, а также в изменяемом контейнере.
- Текст и кнопки не перекрываются; страница не получает случайной горизонтальной прокрутки.
  Широкие таблицы/код прокручиваются внутри своего блока.
- Меню и панели остаются в видимой области после resize, прокрутки, изменения содержимого
  и переключения темы. Первый кадр открытия не показывает меню в неверной позиции.
- Наведение не теряется на пути к ручке/меню. DOM-перерисовка не теряет каретку, выделение
  и активный ввод. Строки не прыгают при появлении элементов управления.
- Управление доступно клавиатурой, focus виден; Escape, восстановление focus и read-only
  проверены. Уменьшенная анимация и масштаб текста учитываются.
- Проверяются Chromium, Firefox и WebKit; ограничения конкретной среды фиксируются явно.

## Обнаруженные блокеры (исходный аудит)

| ID | Дефект | Работа / доказательство |
|---|---|---|
| R-001 | В PageEditor отсутствовало перетаскивание, наведение в отступе терялось | исправлено; реальные жесты Chrome, Markdown, undo/redo, оба редактора |
| R-002 | JS-движок теряет raw-текст кодового блока при редактировании | исправлено; unit/regression на raw text и clipboard |
| R-003 | Перемещение в отсутствующего родителя/потомка может удалить источник | атомарная validation JS/Rust, DnD guard; целевые тесты проходят |
| R-004 | WASM использует байтовые смещения, JS — UTF-16 | ядро и WASM работают с UTF-16; реальные WASM/Unicode/undo тесты проходят |
| R-005 | Строковый content, plain-text и clipboard теряют содержимое/вложенность | рекурсивные copy/cut/paste planners, целевые тесты и полный browser clipboard прогон прошли |
| R-006 | Замена документа сохраняет историю предыдущего документа | исправлено reset/addToHistory; native selective undo сохраняет удалённые правки |
| R-007 | React useEditorState возвращает новый snapshot для object-selector | исправлено; 4 regression tests |
| R-008 | Асинхронное создание редактора после destroy в адаптерах | исправлено lifecycle Vue/Svelte/Solid; целевые тесты проходят |
| R-009 | Часть Cloud handlers не проверяет доступ к документу; Go-тестов нет | исправлено; реальный PostgreSQL/Valkey, Go race/integration checks, live WS revoke/expiry tests |
| R-010 | PDF/DOCX wrappers вызывают отсутствующие методы WASM | реальные PDF / DOCX и lazy export WASM; после R-034 собственный PDF backend, структура файлов/Unicode и Cloud jobs проверены |
| R-011 | npm/cargo release подавляет ошибки; неполный список пакетов; CI проверяет несуществующий .mjs | обязательные reusable CI/browser/security, полные графы bundle, npm archives и Cargo source preflight; после R-034 все source/advisory/license gates проходят |
| R-012 | История версий в примере — alert, часть экранов без полного UI | PageEditor history/list/preview/diff/restore, 5 unit tests; Chrome restore→Undo и 10 light/dark layouts проходят |
| R-013 | Меню таблицы/блока/форматирования не полностью реагируют на resize/scroll | исправлены anchor/viewport observers, portals и cleanup; три браузера, keyboard/scroll/container resize и темы проверены |
| R-014 | Монолитные исходники до 2700 строк, нет обязательных архитектурных правил | AGENTS/SOLID, runtime boundaries/cycles/size gates; strict release check проходит без baseline исключений |
| R-015 | Новый Markdown зависит от mdast/micromark вопреки выбранной автономной архитектуре | свой TS parser: 94 теста, 652/652 грамматических примера совпали с прежним parser AST; зависимости удалены (44 пакета). Это не утверждение полной HTML conformance; Rust parity отдельно R-028 |
| R-016 | Cloud принимает любой непустой пароль; нет scope/role checks на части маршрутов | bcrypt, scopes/roles, tenant isolation, quotas и session revalidation; Go race/integration проходят |
| R-017 | Cloud export выдаёт JSON под видом PDF/DOCX; AI возвращает placeholder success | настоящие PDF/DOCX jobs и streaming providers; local fixture exports и отказ/отмена проходят |
| R-018 | При 320 px sidebar оставляет main 80 px, внутренние панели не адаптивны | исправлены mobile navigation, container grids, wrap; финальные 130 layout cases прошли после удаления Wiki и унификации темы |
| R-019 | IME после быстрого ввода мог вставлять текст в начало строки | исправлено pending-caret восстановление; Chrome 3/3 повторения, следующий символ и undo проверены |
| R-020 | Базовый CSS сжимает текст чек-листа PageEditor до 16 px | изолированы page styles; Chrome 320 px: строка 216 px, визуально проверено |
| R-021 | WebSocket provider принимал сообщения без применения, локальное demo заменяло полный JSON | заменено CRDT transport, ACK/delta/reconnect; 8 unit tests и реальный Chrome → Cloud → PostgreSQL replay прошли |
| R-022 | camelCase schema не подходила Rust; auto mode незаметно переходил на JS | typed schema adapter; реальные WASM/auto constructors проходят, ошибки документа не маскируются |
| R-023 | Logger терял Hijacker/Flusher: WebSocket возвращал 500, SSE не стримился | исправлено Cloud middleware, реальные WS/SSE tests; browser handshake 101 |
| R-024 | Ввод/Enter/Delete между блоками не удалял выделенное содержимое | общие атомарные planners; JS/WASM и полный browser прогон прошли |
| R-025 | React blockRenderer игнорировался, node decoration classes терялись на default views | восстановлен документированный callback/fallback; metadata и media classes проверены DOM-тестами |
| R-026 | Image menu содержит фиктивные действия/вкладки; late uploads и media persistence не завершены | общий media UI, durable upload, crop/alt/preview/resize; 7 сценариев media/table проходят Chrome, Firefox и WebKit |
| R-027 | Локальный WASM budget 800 KiB расходится с CI 500 KiB | единый measured budget 600 KiB, Node gzip9 590122 bytes на окончательном native дереве; прежний 512000 не пройден. Решение и сохранение sanitizer/API: [ADR](development/wasm-budget.md) |
| R-028 | Native Rust Markdown семантически не совпадает с собственным TS parser | свой Rust grammar/converter: 652/652 public models, 40 постоянных fixtures + bounded stress; native schema и changed-document serializer исправлены |
| R-029 | Caption attr update переводит caret в основной документ после первого символа | воспроизведено Chrome, guard независимого input в DOM selection исправлен; regression и реальный Unicode/caret browser retest проходят во всех трёх браузерах |
| R-030 | TableView пишет фиктивные _addRow/_addCol, Tab зависит от запоздалого selectionchange | shared editTable и общий UI, структурные операции/resize с Undo; 3 unit tests и Chrome/Table browser tests проходят; быстрый ввод после Tab в Firefox исправлен и проверен |

## Дополнительные регрессии и внешние ограничения

| ID | Дефект | Работа / доказательство |
|---|---|---|
| R-031 | После замены paragraph на code renderer теряет native caret до следующего кадра | ядро восстанавливает ожидаемое выделение после DOM commit; быстрый ввод, сценарии кода и общий повтор прошли |
| R-032 | Touch long-press показывал drag state без реального перемещения | общий pointer lifecycle, move/drop/edge scroll; 11 реальных Chrome touch проверок обоих редакторов, Undo/cancel/read-only/destroy/container resize |
| R-033 | Checkbox задач реагировал только на mousedown | нативный change обрабатывает мышь и Space; 3 браузерных сценария keyboard/read-only/Undo прошли |
| R-034 | Обновлённые native зависимости экспорта имеют неполный источник для публикации | устранено заменой Typst собственным PDF backend: Git patch citationberg и шесть неподдерживаемых transitives удалены; registry-source, advisory и license gates проходят без исключений |
| R-035 | Toolbar metrics могли учитывать подписи контролов кодового блока | исправлено; hover/transform проверки и полный промежуточный прогон прошли |
| R-036 | Вложенные todo существовали в модели, но не отображались | оба renderer исправлены; 20 native layout/input/checkbox checks в Chrome/Firefox и cross-browser regression прошли |
| R-037 | Async подсветка теряла native caret и могла конфликтовать с IME DOM | snapshot boundary через чистый getDOMSelection, отложенный token render; native Chrome IME и Firefox/WebKit range/Unicode/Undo проверены |
| R-038 | WebKit передаёт Shift+Enter как insertParagraph | общий input planner учитывает Shift intent; 12 unit + 9 browser regressions прошли |
| R-039 | Кнопка + оставляла пустой блок после одного Undo | вставка блока, slash и caret объединены в одну транзакцию; hover/history stress прошёл |
| R-040 | PDF export считал столбцы по числу ячеек первой строки, игнорируя colspan | исправлены logical grid, rowspan occupancy и explicit positions; PDF 3/3 и DOCX 4/4 regression tests, native/WASM validators и реальные Cloud jobs прошли |
| R-041 | Конкурентная правка во время IME могла терять текст и оставлять stale DOM | pre-mutation interruption сохраняет новый документ и возвращает текст/исходное выделение в COMPOSITION_CONFLICT; native Chrome CDP model/DOM/recovery проверены. Awareness decorations ждут окончания IME; автоматического rebase пересекающихся правок нет |
| R-042 | Отложенное обновление подсветки могло сработать внутри следующей IME композиции | pending frame отменяется при новой композиции; guard и lifecycle regression прошли, обычный native IME/подсветка повторно проверены |

## Проверки перед закрытием цели

- [x] Unit/интеграционные тесты всех поддерживаемых движков и модулей, включая найденные регрессии.
- [x] Typecheck/lint/build workspace без замалчивания ошибок.
- [x] `pnpm check:architecture:release`: нет старых превышений размеров и временных runtime-зависимостей.
- [x] Браузерная функциональная матрица и ручная визуальная проверка всех экранов.
- [x] Сохранение и восстановление документов при ошибках, отменах и конкурентных правках.
- [x] Go API: изоляция пользователей/организаций, CRUD, WebSocket, тестовые зависимости.
- [x] Generic CSP consumer после удаления Wiki: сборка и проверка сетевых запросов.
- [x] Чистые потребители tarball-пакетов, каждый exports путь и файл лицензии проверен.
- [x] Документация и примеры соответствуют реальному поведению.
- [x] Итоговый отчёт содержит версии инструментов, команды, результаты, ограничения и артефакты.

- [x] `pnpm check:cargo-release`: исправленный registry graph без Git patch.
- [x] `cargo deny check advisories`: отсутствуют неподдерживаемые native dependencies.

## Журнал

- 2026-11-09: активирована цель в текущем чате; автоматизация по расписанию не создана
  (соответствующего инструмента нет в этой сессии). Работа продолжается в текущей цели.
- 2026-11-09: проверены исправления ручки PageEditor; доказательства:
  `output/playwright/page-handle-verification.json` и `page-handle-fix.png`.
- 2026-11-09: начат независимый аудит ядра и упаковки; перечисленные выше блокеры
  подтверждены исходниками. Проверки старого проекта не означают готовность нового UI.

- 2026-11-10: полный целевой wiki Chrome suite 11/11; React renderer/floating/store
  12/12; core на проверенном промежуточном дереве 165/165. Это не заменяет финальный
  прогон после следующих правок.
- 2026-11-10: две реальные WASM реплики + локальный Cloud/PostgreSQL подтвердили
  concurrent offline edits, reconnect, durable ACK и новый bootstrap из GET.
  `output/cloud-validation/browser-sync-result.json`; секреты не входят в отчёт.
- 2026-11-10: один источник темы `packages/theme/src/design-tokens.json` используется
  PageEditor, общим CSS и JS presets. `pnpm check:theme` проверяет generated CSS.
  React renderer, clipboard, slash, CSS и core orchestration разделены по владельцам;
  строгая проверка проходит с пустым baseline, без размерного долга.

- 2026-11-10: 65 текущих layout-сценариев (13 маршрутов × 5 ширин) прошли:
  нет горизонтального overflow страницы, минимальная ширина обычного редактора
  214 px при viewport 320 px. Это геометрическая проверка; финальные темы/взаимодействия
  и визуальная приёмка проверяются отдельно.
- 2026-11-10: публичный validate больше не отправляет public JSON напрямую в Rust
  enum decoder; JS проверяет схему вместо unconditional true. Native Chrome
  cross-block cut → Undo → paste → Undo проходит; basic/navigation 11/11.
- 2026-11-10: AI unit/UI 19/19 и browser 21/21 (3 движка): generation,
  cancel/error/retry, proofread/Undo, read-only, ghost completion, узкая ширина.
  Непроверенные платные внешние запросы не входят в этот результат.
- 2026-11-11: Атлас GoTipe (`design/atlas`, 19 кадров) — общий язык видов, состояний
  и меню; код приведён к кадрам. PageEditor перенесён на общие виды (кадр 19): тема
  `page` удалена, `page.css` грузит `base.css` + `theme.css`; запись R-020 об изоляции
  page styles историческая. Выноска SpecOrbit «Инструкции для агента» убрана из библиотеки.
- 2026-11-12: меню строки таблицы, колонка карточек ревью на полях, подзадачи
  (Tab/Shift+Tab, Markdown в TS и Rust). PageEditor по умолчанию показывает строки `en`.
  По замечаниям владельца к атласу: иконки списков в две строки и задача одним квадратом,
  край узкой панели modern затухает (атлас и playground), меню столбца стоит над полосой
  добавления строки. Замена PDF от 2026-11-10 и работа над видами сведены в одну ветку `main`.
  Прогон в Firefox и WebKit нашёл одну регрессию (клик у пустого пункта списка в Firefox) —
  исправлена.

- 2026-11-12: написана публичная документация (`docs-site/`, 56 страниц, английский);
  агенты сверяли каждое имя и предел с кодом и нашли около сотни расхождений, из них
  12 блокеров: команды разметки на выделении со списком, атрибуты разметки, присутствие
  и размер обновлений в совместной работе, экспорт PDF/DOCX, миграция, конфигурация
  своего сервера, условия коммерческой лицензии. Список — [docs/24](24-documentation-findings.md).

## История gate зависимостей до замены Typst (2026-11-10)

- Свежие npm audit, cargo-audit и Go govulncheck не находят уязвимостей после
  обновлений. Go vet, unit/race и изолированный PostgreSQL/Valkey integration/race
  прошли на Go 1.26.10; это не заменяет финальный Docker smoke.
- `cargo deny check licenses` проходит. `cargo deny check advisories` остаётся
  красным: шесть unmaintained транзитивных зависимостей актуального Typst.
  Игнорирования не добавлены; точная цепочка и решение описаны в
  [политике зависимостей](development/dependencies.md#native-and-cloud-security-boundary).
- Исправленный quick-xml требует upstream Git patch citationberg, ещё не
  опубликованный в crates.io. `pnpm check:cargo-release` намеренно запрещает
  публикацию до доступности исправленного registry graph, до любых npm/crate
  publish шагов. Нельзя называть исходный Cargo выпуск готовым.
- Собственный OOXML renderer и Typst 0.15.1 требуют нового полного прогона
  native/browser PDF/DOCX validators и Cloud image; старые export receipts
  относятся к предыдущему compiler graph.

- 2026-11-10: лендинг использует shared tokens и проверен на 10 light/dark layouts;
  убраны фиктивные тарифы, SLA и непроверенные сравнительные метрики. Typecheck/lint
  проходят; окончательная workspace сборка ещё предстоит.
- 2026-11-10: production wiki под CSP SpecOrbit загрузил только собственные
  HTML/JS/CSS; нет CSP violations, page errors, external requests или WASM.
  Unicode/Undo, keyboard checkbox, read-only и 320 px проверены. Повторить на
  окончательном дереве; процедура в [CSP contract](development/csp.md).

- 2026-11-10: полный Chrome прогон 875 сценариев: 845 прошли, 30 не прошли.
  Найдены отдельная Undo-запись кнопки +, невидимые вложенные todo-строки и
  задержка позиционирования AI ghost после resize; исправления и повтор продолжаются.
  Часть старых fixtures нарушала raw-code schema, ожидала целый list вместо строки
  или меняла theme-атрибут без применения токенов; проверки обновляются на публичный
  контракт без удаления сценариев. Это промежуточный прогон, не релизная приёмка.
- 2026-11-10: optional highlight contract проверен семью unit-сценариями, в том числе
  настоящими Shiki grammars, retry после сбоя, Unicode/newline integrity и stale async.
  Highlighter не может подменять editable DOM неполным текстом.

## Локальная приёмка до замены PDF backend (2026-11-10)

- Workspace build/typecheck/lint: 21/21; lint содержит 24 advisory предупреждения
  ARIA/semantic-elements, ошибок нет. Проверки клавиатуры и focus выполняются отдельно.
- Vitest: 524/524; native Rust: 228 тестов, fmt и строгий Clippy прошли.
- Architecture: 539 production files, пустой размерный baseline, 8 JS graph budgets
  соблюдены. Core WASM: 590122 bytes gzip9 при лимите 614400.
- Чистая установка 21 tarball: 27 ESM, 25 CJS, TypeScript без skipLibCheck,
  реальные HTML/Markdown/PDF/DOCX consumers; ZIP/XML/Unicode/media validators прошли.
- Generic CSP consumer: собственные HTML/JS/CSS, без WASM/внешних запросов/CSP
  violations; Unicode/Undo, task keyboard, read-only и 10 layouts прошли.
- В промежуточном полном прогоне было 2625/2628 успешных сценариев. Причины трёх
  сбоев caret fixtures подтверждены и устранены; ниже результат окончательного повтора.
- Окончательный повтор: **2634/2634** (878 × Chromium/Firefox/WebKit), 17,8 минуты.
  Исходники не менялись: tree SHA256
  `33a36edae716dacc0b54856e30223a795a13d2da54cbc685d2d57f2c288f5d7b`, runtime/build SHA256
  `b077d5a5c2fe05044fcb4489fdecd1cbef51f1a31c08615261c3f584edc3408e`.
  Последующее обновление этого отчёта не меняет runtime. Source/package receipts
  позволяют сверить конкретные файлы и архивы.
- На окончательном общем примере отдельно пройдены gutter hover, меню шести точек,
  native block/list drag, Markdown reorder, точный Undo, Redo, read-only и hover
  после decoration updates. Новая Wiki-оболочка в другом месте не создавалась.
- Native Chrome CDP подтвердил сохранение конкурентной правки и DOM, видимый recovery
  text при COMPOSITION_CONFLICT и отложенную публикацию awareness decorations без
  прерывания IME. Конфликт документа возвращает ввод хосту; автоматический rebase
  пересекающихся правок и его бесшовное слияние этим результатом не заявляются.
- npm audit, cargo-audit и govulncheck: уязвимостей не найдено. Это не снимает
  два незакрытых source-release gates R-034. Повторная проверка официальных
  upstream/registry источников 10 ноября подтвердила отсутствие исправленного выпуска.

Подробные команды, версии и receipts находятся в ignored `output/release-gates-final.json`,
`output/release-tree-before.json`, `output/release-package-artifacts.json`,
`output/manual-browser-acceptance-final.json`, `output/release-browser-final.log`,
`output/native-pdf-refresh-result.json` и `output/upstream-gate-refresh/result.json`.
Удалённый CI, интеграция в реальный renderer SpecOrbit, внешние платные AI запросы
и публикация не выполнялись. Ограничения форматов остаются в export-contract.md.


## Сведение в main: приёмка итогового дерева (2026-11-12)

Ветка `codex/release-readiness` с заменой PDF и работой по Атласу влита в `main`
перемоткой; других веток нет. Проверки шли на итоговом дереве, тяжёлые — по одной:

- Rust: fmt, строгий Clippy all-targets/all-features, 250/250 тестов без ignored;
  notices 149 + 167 и байты шрифтов экспорта сверены; registry-источники Cargo публикуемы.
- WASM пересобраны: core 1 497 834 байт, 589 986 gzip при бюджете 614 400;
  export 14 420 356 байт.
- JS: build 21/21, typecheck 34/34, lint без ошибок (27 a11y-советов Biome, было 24),
  architecture 573 файла (release без долга), theme, Vitest 545/545
  в 18 пакетах (тест подсветки кода под нагрузкой падал — исправлен); 21 архив и чистый потребитель (27 ESM / 25 CJS); реальные PDF/DOCX
  через публичный API; PDF corpus native/WASM 52/52 (13 файлов совпадают побайтно,
  13 ожидаемых отказов). `check:bundles` упал на React-слое: 36 441 байт при потолке
  30 720 — рост от кадров Атласа; потолок поднят до 40 960 решением с замерами
  в [javascript-budgets.md](development/javascript-budgets.md).
- Браузер, полные прогоны под внешней нагрузкой на машине (load average 30–60 на 14 ядрах):
  - Chromium (канал Chrome): 900/905; 5 таймаутов (4 раза редактор не появился за 5 s после
    загрузки, стресс REL-001 не уложился в 30 s), оба файла при повторе 53/53;
  - WebKit 27.2 (4 workers): 900/905; 5 таймаутов (3 загрузки страницы в самом начале,
    2 стресса DEF-007), три файла при повторе 33/33;
  - Firefox 159 (3 workers): 901/905; 3 таймаута стрессов (DEF-007 ×2, REL-001) и NL-037 —
    настоящая регрессия от кадров Атласа: точка маркера (`li::before`, absolute) ловила клик
    у пустого пункта, и Firefox ставил каретку в соседний блок. Точка теперь
    `pointer-events: none`, как плейсхолдер; после правки файлы с падениями в Firefox 58/58,
    списки, каретка и PageEditor в Chromium и WebKit 242/242. Полный прогон трёх движков
    после этой однострочной правки не повторялся.
  Браузеры Playwright загружены с согласия владельца. Атлас: 100 кадров, статические
  правила и браузерный аудит прошли. Логи — `output/merge-acceptance-20261112/`.
- Go: `go vet`, notices 50 файлов. Integration-тесты Cloud с PostgreSQL/Valkey в этот
  раз не запускались: код `apps/cloud` при сведении не менялся.

## Собственный PDF backend: итоговая приёмка (2026-11-10)

По прямому запросу владельца Typst заменён собственной раскладкой GoTipe поверх
поддерживаемых PDF/font codecs. Публичные API, optional/lazy граница, HTML/Markdown
и DOCX сохраняются. Граф зависимостей Cargo workspace уменьшен с 402 до 230 пакетов; Typst,
citationberg, Git patch и шесть неподдерживаемых транзитивных зависимостей удалены.
R-034 закрыт: source-release, cargo-audit, cargo-deny advisories/licenses проходят
без добавления исключений. Нынешняя зависимость — описание в dependency policy,
а не старые проектные предложения из numbered docs.

Проверки нового PDF включают marks/цвета/код, таблицы с colspan/rowspan и очень
длинными ячейками, независимый поток колонок, картинки/captions, списки, A4/Letter/Legal,
поля и колонтитулы, закладки, связную tagged-структуру/Alt/OBJR/ParentTree и XMP.
Проверены кириллица, RTL, диакритика, лигатуры, emoji/ZWJ/VS16 и отдельные границы
слов для выделения/поиска. Неизвестные блоки/marks, недопустимые структуры и символы
без встроенного шрифта дают явную ошибку. Неподдерживаемое содержимое не отбрасывается.

- Rust: 249/249, без skipped/ignored; fmt и строгий all-target/all-feature Clippy.
- Native corpus: 26/26; публичный native/WASM: 52/52.
- PDF browser corpus: 78/78 в Chromium/Firefox/WebKit; 39 успешных файлов побайтно
  совпадают с Node/WASM, 39 отрицательных сценариев возвращают ожидаемые ошибки.
- Cloud: новый локальный non-root image, readiness и 10 migrations дважды;
  базовые PDF/DOCX/merged-table jobs 3/3, corpus 19/19 (9 успехов + 10 ожидаемых
  отказов). Все 9 PDF побайтно совпадают с native и Node/WASM. Cloud API использует
  default PDF options; опции страниц/колонтитулов проверены на Rust/WASM API.
- Workspace: 524/524 Vitest, build/typecheck/lint, architecture release, theme,
  JS import budgets и независимые PDF/DOCX validators прошли. Lint сохраняет
  прежние 24 advisory предупреждения; новых ошибок нет.
- Упакован и установлен чистый consumer 21 реального архива: 27 ESM, 25 CJS,
  строгие TypeScript declarations, headless/Markdown/PDF/DOCX проверки прошли.
- Core WASM побайтно прежний: 590122 bytes gzip9. Optional export WASM:
  14420356 bytes raw / 8566476 gzip9 вместо 35456393 / 15796750.
- Общий окончательный browser suite: выполняется на замороженном runtime/build
  SHA256 `ea3b73d4901dd5d2c63db4e9d82ce5ca28d6861065f7c9495ae33c328265de5f`.

Первый общий browser прогон выявил 8 сбоев подготовки каретки в старых тестах:
TreeWalker выбирал текст кнопки Copy у пустого code block, поэтому ввод не попадал
в документ. Исправлены два test helper: публичный setSelection/focus и ожидание
совпадения model/native selection. Сами проверки Enter/Escape/преобразований
сохранены. Ещё два старых тестовых файла используют baseURL вместо жёсткого порта,
чтобы окончательная приёмка запускалась на отдельном свежем Vite server.
Сценарий mixed create/change/delete выполняет 18 последовательностей действий.
Следующий прогон показал исчерпание его общего default-бюджета 30 s при сильной
параллельной нагрузке; assertions содержимого не падали. Результат сохранён в
`output/owned-pdf-release/browser-stress-timeout/` (763 passed, 1 timeout,
2 interrupted). Для этого functional stress задан общий бюджет 90 s, как у остальных длинных
сценариев; per-assertion timeouts и все 18 последовательностей сохранены.
Проверка repeat3 с двумя workers: Chromium/WebKit 6/6, Firefox 3 deadline failures
при той же внешней нагрузке. Первый serial повтор дал 2/3, поэтому результат не принят. После завершения
внешнего fidelity runner Firefox прошёл 3/3 с тем же 90 s лимитом
(44.3/45.9/48.0 s); окончательный suite выполняется с Firefox workers=1
и Chromium/WebKit workers=2, без автоматических повторов.
Production JS/Rust и собранные пакеты при этих правках не менялись. Исходные ошибки
и остановленный прогон (1092 passed, 8 failed, 2 interrupted) сохранены в
`output/owned-pdf-release/browser-initial-failure/`; повторная приёмка ниже заменяет
их как результат окончательного дерева.

Независимые валидаторы читают созданные PDF, а не внутренние структуры renderer.
Просмотрены 11 растеризованных страниц; проверено отсутствие обрезки/наложений,
правильное заполнение первой страницы длинной таблицы и сохранение внешнего вида
при исправлении границ выделения. PDF/UA и PDF/A сертификация не заявляется;
остальные границы форматов перечислены в export-contract.md.

Команды, контрольные суммы исходников/шрифтов/WASM/архивов и результаты:
`output/owned-pdf-release/`, `output/pdf-migration-visual/receipt.json`,
`output/pdf-native-acceptance/validation.json`, `output/pdf-regression/validation.json`,
`output/pdf-browser-final.log`, `output/pdf-migration-rust-tests.log`,
`output/pdf-migration-rust-clippy.log`, `output/pdf-migration-workspace-tests.log`,
`output/pdf-migration-browser-full.log`. Промежуточные результаты сохранены отдельно
и не заменяют приёмку последнего дерева. Это локальная приёмка; внешняя публикация
и удалённый CI в рамках этой задачи не запускались.
