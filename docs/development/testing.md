# Проверки разработки

До правки выбери поведение, риск и проверку. Перенос сохраняет exports, ошибки,
CSS order, keys/mount, subscriptions и форматы. Тест не повторяет реализацию.

| Изменение | Целевая проверка |
|---|---|
| Транзакции/схема/история | атомарность, неверные входы, raw/nested, undo/redo, Unicode |
| JS/WASM | одинаковые семантические сценарии обоих движков |
| Markdown/clipboard | структура/marks/байты, nested selection, safe cut, roundtrip |
| Adapters | StrictMode/late resolve/destroy, отказ создания без unhandled rejection, subscriptions, stable snapshot, SSR |
| UI/меню/DnD | реальные жесты, keyboard/focus/read-only, resize/scroll, light/dark |
| CRDT | 2–3 peers, разные порядки доставки, дубликаты/reconnect, convergence |
| Cloud/SDK | чужая роль/user/scope, malformed payload, storage failure, 204/errors |
| Экспорт | потребитель/валидатор формата, Unicode, отсутствие подмены формата |
| Пакеты | tarball/files/license/exports, ESM/CJS/types, чистый consumer |

## Команды

```sh
pnpm check:architecture
pnpm check:architecture:release
pnpm --filter @gotipe/react exec vitest run --maxWorkers 2
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm check:packages
pnpm check:consumer
pnpm check:bundles
pnpm check:theme
pnpm check:exports
pnpm check:pdf-regression
pnpm check:cargo-release
python3 scripts/collect-rust-licenses.py --check
python3 scripts/collect-cloud-licenses.py --check
cargo fmt --all -- --check
CARGO_BUILD_JOBS=2 cargo test --locked --workspace --all-features
cargo clippy --all-targets --all-features -- -D warnings
pnpm build:wasm
pnpm build:export-wasm
pnpm build:converter
pnpm exec playwright test
(cd apps/cloud && go test ./... -race)
```

Для промежуточного прогона выбирай workspace filter/файл. Полные проверки — на
окончательном дереве. Не обходи ошибки skip/timeout. Browser matrix: Chromium,
Firefox, WebKit; 320/375/768/1024/1440 и изменяемый контейнер. Проверяй не только
overflow страницы, но доступную ширину редактора и взаимодействия.

Отчёты/trace/screenshots — ignored `output/`. Записывай команду, инструменты,
дерево/commit, результат/ограничения. Старый CI не подтверждает текущий код.
Публикация не входит в локальную приёмку и не выполняется автоматически.

`check:consumer` упаковывает все публичные пакеты и устанавливает реальные tarball
в отдельный каталог с отключёнными workspace links и строгими peer dependencies.
Локальные overrides разрешают только внутренние ещё не опубликованные версии;
исходники не подменяют содержимое архивов. Проверяются все JS exports ESM/CJS,
декларации без `skipLibCheck`, headless SSR/Markdown, вызов PDF/DOCX и один
`GoTipeError` на все входы `@gotipe/core` в ESM и CJS (D-166).
Команда требует предварительной сборки JS, core WASM и optional export WASM.


Размер JavaScript проверяется по [полному графу импортов](javascript-budgets.md),
а не только по entry-файлу. Для локальной полной приёмки ограничивай Turbo
`--concurrency=2`, Vitest `--maxWorkers=2`; WASM-скрипты используют
не более двух Cargo/Binaryen workers по умолчанию.

Собранные WASM-модули (`packages/wasm/pkg`, `packages/export-wasm/pkg`) — входы задач
`@gotipe/wasm#build` и `@gotipe/export-wasm#build` в `turbo.json`. После `pnpm build:wasm`
или `build:export-wasm` Turbo один раз заново собирает и проверяет всё, что от них зависит,
и тесты движка не приходят из кэша, прогнанного на прежнем бинарнике.

`check:pdf-regression` сохраняет native PDF из фиксированного corpus и сравнивает
их с реальным public WASM export. Независимый validator использует Poppler
(`pdfinfo`, `pdftotext`, `pdftohtml`) и Python `pypdf`: Unicode, page geometry,
пагинация, marks, links, images, merged tables и явные ошибки. Эти инструменты
нужны локально; CI устанавливает `poppler-utils` и `python3-pypdf`.
Browser corpus находится в `e2e/pdf-export.spec.ts` и входит в общий suite.

## Геометрия интерфейса редактора

`e2e/editor-visual-audit.spec.ts` проходит редакторы playground — PageEditor (Page), BlockEditor
(Block) и BlockEditor с шапкой страницы и счётчиком (Views) — в видах notion, docs, modern и
minimal, светлой и тёмной теме, на ширинах 320, 375, 768, 1024 и 1440. Документ проверки
(`e2e/helpers/visual-audit/document.ts`) содержит каждый блок: заголовки, вложенные списки и
задачи, цитату, выноску, код, формулу, таблицу, картинку с подписью и пустую, файл, вставку,
переключатель, колонки, разделитель, абзац справа налево. Указатель встаёт на каждый блок, и
проверка требует:
- ручка не накрывает текст, флажок, маркер или номер, значок выноски, поле или картинку и
  стоит внутри редактора, экрана и всех обрезающих контейнеров;
- центр ручки — на первой строке блока (допуск 2,5 px): первой строке его редактируемого текста,
  верхнем ряду картинки, строке имени файла или адреса вставки, строке заголовка таблицы;
- в modern и minimal ручки нет; у ячейки — ручка строки или столбца в своём поле, не на тексте;
- колонки не выходят друг за друга и за свой блок, шапка и счётчик стоят в колонке текста;
- пузырь над словом в начале и в конце строки, «/» внизу экрана и из «+», меню ручки,
  «Превратить в» и подсказки ручки — на экране; страница не прокручивается вбок.

Полный перебор (120 конфигураций) идёт в Chrome, выборка из шести — в Firefox и WebKit; сеть
вне localhost отрезана. Нарушение оставляет снимок с рамками ручки (красная) и того, что она
задела (синяя), в `output/editor-visual-audit/<браузер>/<конфигурация>/`, а итог конфигурации —
в соседнем JSON:

```sh
GOTIPE_E2E_CHANNEL=chrome GOTIPE_E2E_PORT=5420 pnpm exec playwright test e2e/editor-visual-audit.spec.ts
```
