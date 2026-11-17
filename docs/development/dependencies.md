# Политика зависимостей

Решение владельца от 2026-11-09: своё редакторное ядро, Markdown и небольшие
вспомогательные алгоритмы. Замена пакета завершается после regression/parity
проверок; возраст пакета сам по себе не определяет качество или безопасность.

| Категория | Решение |
|---|---|
| Runtime редактора/Markdown/utility | свои модули, никаких новых внешних dependencies |
| React/React DOM/Vue/Svelte/Solid | peers соответствующих adapters/UI |
| Shiki | существующий необязательный host adapter, отдельный lazy entry; не часть ядра |
| mdast/micromark | удалены; Markdown разбирает собственный parser GoTipe |
| Web APIs | DOMParser, URL, Intl.Segmenter, Web Crypto с validation границ |
| Rust/Go platform libraries | serde/WASM, TLS/crypto, DB/storage/network drivers; не писать свою криптографию |
| Build/test tooling | devDependencies, не runtime потребителя |

Новая зависимость объясняет задачу, почему платформа/свой код не подходят,
лицензию, влияние на bundle и владельца обновлений. Раздувание allowlist ради CI
запрещено. При удалении обновляй lockfile, проверяй чистую установку и entrypoints.

Runtime imports проверяет `pnpm check:architecture`. Release режим запрещает
временный Markdown-долг. Внешние системы остаются адаптерами: правила редактора
не зависят от конкретного приложения.

## Необязательные PDF и DOCX

Решение владельца от 2026-11-10: GoTipe владеет обходом документа, разметкой
страниц, переносами, таблицами, marks, колонтитулами и PDF/OOXML rendering.
Typst, typst-pdf, typst-assets как runtime dependencies и citationberg удалены.
Ни один полный document/layout compiler не входит в новый PDF backend.

Узкие библиотеки отвечают за специализированные форматы и международный текст:

| Библиотека | Задача и причина | Лицензия |
|---|---|---|
| pdf-writer 0.15 | корректная сериализация PDF objects/xref/streams; не layout | MIT/Apache-2.0 |
| harfrust 0.15 | OpenType shaping, ligatures, complex scripts; поддерживаемая реализация HarfBuzz | MIT |
| read-fonts 0.46 | проверенное чтение OpenType tables/metrics; общий parser с harfrust | MIT/Apache-2.0 |
| subsetter 0.2.6 | CFF/TrueType glyph subsetting и instancing variable Noto Emoji; font compiler не пишем заново | MIT/Apache-2.0 |
| unicode-bidi / unicode-segmentation | стандартные UAX #9/#29: порядок текста и границы grapheme clusters, не layout документа | MIT/Apache-2.0 |
| flate2 / zlib-rs и ZIP 9 | Deflate streams и контейнер OOXML; компрессию не переписываем | MIT/Apache-2.0, Zlib, MIT |
| image 0.25 | ограниченное декодирование PNG/JPEG/GIF/WebP; собственный raster codec не нужен | MIT/Apache-2.0 |
| image-webp 0.2 (feature `webp` у image) | WebP (VP8 и VP8L) — один из четырёх форматов, которые редактор принимает при загрузке (`IMAGE_MEDIA_TYPES`); без него PDF/DOCX отклоняли документ, который редактор показывает. Pure Rust без unsafe/C, ≈8,7 тыс. строк, тот же владелец image-rs и те же `Limits`; тянет только quick-error 2 (MIT/Apache-2.0), byteorder-lite уже в графе. Только export WASM и `gotipe-convert`, не ядро | MIT/Apache-2.0 |

Subsetting включает upstream variable-fonts feature, поэтому использует собственные
skrifa/write-fonts/kurbo. Прямой второй scaler skrifa не подключается: экспортёру
достаточно read-fonts, который уже нужен HarfRust. Optional ICU feature HarfRust
выключен. Точные transitive versions и оригинальные notices генерируются из lockfile.
Эти библиотеки разрешены только для отдельного PDF/DOCX exporter, не для ядра,
Markdown или небольших helpers. Владелец обновлений — модуль export.

В браузере PDF/DOCX входят в отдельный `@gotipe/export-wasm`; `@gotipe/export`
загружает его при первом запросе. Основной editor WASM не включает эти features.
Импорт wrapper не запускает загрузку/инициализацию. Cloud вызывает тот же native
`gotipe-convert`. Размер нового WASM измеряется после сборки, не выводится из
размера Cargo graph. Core bundle проверяется отдельно.

URL изображений загружает явный host `resolveImage`; native renderer не получает
доступ к сети или произвольным файлам. Raster codecs проверяют размер и бюджет
памяти и нормализуют изображения в PNG для OOXML.

Неизменённые fonts перенесены из опубликованного typst-assets 0.15.1 в
`crates/gotipe-export/assets`, вместе с исходными LICENSE/NOTICE. Это Libertinus
Serif, New Computer Modern и DejaVu Sans Mono; Noto Emoji сохранён под SIL OFL.
Имена, байты и лицензионные условия не изменены. `assets/inventory.json` фиксирует
исходный archive/revision и SHA-256. Collector проверяет fonts и помещает notices
в optional npm package и Cloud image. Шрифты не требуют установленного Typst.

Источники: [PDF writer](https://github.com/typst/pdf-writer),
[HarfRust](https://github.com/harfbuzz/harfrust),
[Fontations](https://github.com/googlefonts/fontations),
[Subsetter](https://github.com/typst/subsetter),
[Unicode bidi](https://github.com/servo/unicode-bidi),
[Unicode segmentation](https://github.com/unicode-rs/unicode-segmentation),
[ZIP codec](https://github.com/zip-rs/zip2),
[Noto Emoji / SIL OFL](https://github.com/google/fonts/tree/main/ofl/notoemoji).

Приёмка требует сохранённых baseline fixtures прежнего backend, PDF/OOXML
validators, Unicode extraction, glyph/font checks, geometry/pagination, tables,
marks, images, header/footer и одинакового поведения native/WASM/Cloud. Сборка
или чистый audit сами по себе не подтверждают визуальную совместимость.

## Native Markdown grammar

Rust import использует собственные lexer, block/inline AST, delimiter resolver,
reference handling и converter GoTipe. Существующий `regex` (MIT/Apache-2.0)
исполняет ограниченные грамматические шаблоны из того же контракта, что JS
RegExp в TS parser; сторонний Markdown parser не подключается. Это полноценный
компилятор регулярных выражений, а не замена небольшого helper. Включены только
std/perf, Unicode Perl classes и general categories для flanking punctuation.
Case-insensitive syntax patterns ограничены ASCII; Unicode case tables отключены.
Импорт ограничен глубиной 64 и бюджетом inline scanning; неподдержанный синтаксис
сохраняется raw. Владелец — Rust export. Проверка — differential public-model
fixtures против собственного TS parser и размер main WASM после linker.
Основной WASM вызывает Markdown serializer, native parser не экспортируется;
его regex matcher/data должны исключаться при link. Наличие build dependency
в Cargo tree само по себе не доказывает присутствия кода в конечном WASM.

### Named character reference data

The TS and Rust Markdown parsers embed the same 2,125 name-to-Unicode mappings.
They were verified against CPython v3.13.9 `html.entities.html5` with trailing
semicolons removed from keys; no Python parser implementation is imported.
`packages/markdown/THIRD_PARTY_NOTICES.md` records the pinned source and SHA-256.
Unmodified Python notices ship with the Markdown package, core WASM and native
converter source. The underlying names are defined by the WHATWG HTML standard.

### Cloud binary notices

`scripts/collect-cloud-licenses.py` derives the actually linked Go module graph
using `go list -deps`, copies original module-root license/notice files unchanged,
and records versions and hashes under `apps/cloud/licenses`. `--check` verifies
that inventory against the installed module cache. The Cloud image includes those
notices alongside the optional native export compiler/font notices and the
repository's original MIT/commercial license files; this does not change their
terms or grant an alternative license.

## Toolchain security maintenance (2026-11-10 audit)

The current registry audit required Vitest 4.1.12 (GHSA-5xrq-8626-4rwp,
GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8); the previous Vitest 2 branch had no
compatible complete fix. Runtime engine dependencies are unchanged. Framework
peers and existing development tools were updated within their declared ranges.
Vitest 4 accepts `--maxWorkers=2`; the removed `--minWorkers` flag must not remain
in CI commands.

Two narrowly scoped overrides are necessary while keeping the current major
versions: `next>postcss` uses PostCSS 8.5.23 or newer for source-map file disclosure
fixes (including GHSA-6g55-p6wh-862q and GHSA-r28c-9q8g-f849), and
`tsup>esbuild` uses esbuild 0.28.1 or newer for GHSA-g7r4-m6w7-qqqr. The latter is
an existing build compiler, not an editor runtime dependency; production ESM/CJS
and declaration builds must pass with it. Remove each override when the parent
dependency's supported range includes the fixed version.

The before/after audit and tool versions are local evidence in ignored `output/`.
The security workflow runs a fresh audit instead of treating a historic zero
finding count as a permanent guarantee.

## Native and Cloud security boundary

Cloud pins Go 1.26.11 through `apps/cloud/go.mod` (1.26.11 fixes GO-2026-6859 in
`net/http`, found by govulncheck on 2026-11-17); CI reads that file and the
Docker builder uses the same patch. The AWS S3, pgx, JWT, compression and x/*
modules include current advisory fixes. `x/crypto` pins the upstream OpenPGP
removal commit `2f1f834330b2`; GoTipe uses maintained crypto packages, not OpenPGP.
`govulncheck ./...` and `go mod verify` are mandatory and must be rerun after
module changes. Regenerate linked-module notices with the module graph.

The previous docx-rs release fixed its ZIP range below the available security
fix. GoTipe now owns OOXML rendering (paragraphs, marks, relationships, media,
tables, metadata), while the maintained ZIP 9 codec owns archive framing and
compression. Native and browser exports must pass independent XML/ZIP/PDF
validation, Unicode extraction and image checks after this migration.

The former Typst graph required a Git-only citationberg security fix and six
unmaintained dependencies. The owner-authorized PDF migration removes that
entire graph: citationberg, bincode, paste, rustybuzz, ttf-parser, unsafe-libyaml
and yaml-rust are absent from Cargo.lock. No advisory is suppressed and no
replacement is sourced from Git. `pnpm check:cargo-release` still rejects any
future Git dependency; `cargo deny check advisories` still rejects unmaintained
packages. The crates themselves are not published (owner decision, D-71: only npm),
but the release keeps the source check: the same graph is compiled into
`@gotipe/wasm`, `@gotipe/export-wasm` and the Cloud `gotipe-convert`, and a Git
checkout is mutable and outside registry yanking and advisories. Both checks passed for the new resolved graph on 2026-11-10; fresh
checks and runtime export acceptance remain mandatory for each release.

Original Cargo notices are regenerated for the exact current normal/build graph;
removed package notices are pruned rather than kept as a stale superset. Original
font notices remain separately under `licenses/fonts/` because the font assets
continue to ship after removal of the compiler dependency.
