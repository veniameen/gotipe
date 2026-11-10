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

`gotipe-export` использует Typst 0.15.1 / typst-pdf (Apache-2.0) для типографики,
переносов, shaping и Unicode PDF; собственный OOXML renderer — для DOCX. ZIP 9 (MIT) обеспечивает проверенный
контейнер и Deflate; собственная компрессия в этот контракт не входит.
Это самостоятельные форматы и компилятор, а не замена редакторного ядра или
Markdown. В браузере они входят только в отдельный `@gotipe/export-wasm`, который
`@gotipe/export` загружает при первом PDF/DOCX запросе. Основной editor WASM не
включает эти features. Cloud использует тот же native `gotipe-convert`.

Raster codecs из `image 0.25` (MIT/Apache-2.0, уже зависимость Typst) подключены
только к PDF/DOCX features. Они проверяют и декодируют PNG/JPEG/GIF с лимитами
размера и памяти и нормализуют их в PNG для OOXML. Реализация собственного
сжатия/декодера контейнеров не относится к helper-политике. URL загружает явный
host `resolveImage`; компилятор не получает доступ к сети или произвольным файлам.

Отдельный export WASM занимает около 35.5 MB до HTTP compression, включая fonts.
Импорт `@gotipe/export` не запускает его загрузку/инициализацию; первый вызов
PDF/DOCX выполняет dynamic import. Headless editor и обычный HTML/Markdown export
не должны включать этот asset в собственный initial bundle.

Typst получает только сгенерированный из дерева документа исходник. Текст и
атрибуты экранируются; world запрещает внешние файлы, сеть и пакеты. Unicode fonts
из typst-assets и Noto Emoji обеспечивают кириллицу и emoji без системных fonts.
Лицензии шрифтов и notices поставляются с отдельным npm package.

Источники контрактов: [Typst](https://github.com/typst/typst/tree/v0.15.1),
[ZIP codec](https://github.com/zip-rs/zip2),
[Noto Emoji / SIL OFL](https://github.com/google/fonts/tree/main/ofl/notoemoji).
Владелец обновлений — модуль export; проверка требует валидатора PDF/OOXML,
извлечения Unicode текста, таблиц/marks и проверки независимости core bundle.

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

Cloud pins Go 1.26.10 through `apps/cloud/go.mod`; CI reads that file and the
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

Typst 0.15.1 still depends on citationberg 0.7.0, whose published package requires
vulnerable quick-xml 0.38. The workspace pins the unmodified upstream security
commit [06a591e](https://github.com/typst/citationberg/commit/06a591e2f237d25e1dfdedac3f3d1494c496c52d),
which upgrades to quick-xml 0.41. This removes the vulnerability without ignoring
the advisory. **Crates.io publication remains blocked until that upstream fix
is published and the patch can be removed**: workspace patches do not propagate
to downstream Cargo consumers. Local builds, Docker and bundled npm WASM use
the locked fixed commit. Do not publish a source archive that resolves the old
vulnerable graph.

The fresh cargo-audit vulnerability count is zero, but cargo-deny advisories
still rejects six unmaintained Typst transitive dependencies: bincode, paste,
rustybuzz, ttf-parser, unsafe-libyaml and yaml-rust. This is an explicit release
gate, not a waived finding. The compiler must adopt maintained replacements
before the complete source-release security gate can pass. Original licenses
and the resolved Git source are retained in generated notices.
