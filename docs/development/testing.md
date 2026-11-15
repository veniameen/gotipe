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
декларации без `skipLibCheck`, headless SSR/Markdown и вызов PDF/DOCX.
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
