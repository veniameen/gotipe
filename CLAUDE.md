# GoTipe — CLAUDE.md

GoTipe — Rust/WASM rich text editor framework с Notion-like UX. Headless core (MIT) + коммерческий Block Editor UI + GoTipe Cloud (managed backend). Три стека: Rust crates, TypeScript packages (pnpm + Turborepo), Go Cloud server.

## Стек

| Слой | Язык | Tooling | Деплой |
|------|------|---------|--------|
| `crates/` (6 crates) | Rust → WASM | Cargo, wasm-pack, criterion, proptest | npm (WASM), crates.io |
| `packages/` (12+ пакетов) | TypeScript | pnpm, Turborepo, tsup, Vitest, Biome | npm registry |
| `apps/cloud/` | Go 1.23 | Chi v5, pgx, gorilla/websocket, testcontainers | Docker → Hetzner VDS |

## Структура репозитория

```
crates/                        # Rust workspace
  gotipe-schema/               # Schema DSL, NodeSpec, MarkSpec, validation
  gotipe-core/                 # Document model, EditorState, Transaction, Steps, Commands
  gotipe-crdt/                 # CRDT engine (Loro-inspired), sync protocol, awareness
  gotipe-ai/                   # AiProvider trait, ContextBuilder, SuggestionState
  gotipe-export/               # HTML, Markdown, PDF (typst), DOCX (docx-rs)
  gotipe-wasm/                 # wasm-bindgen exports (WasmEditor)
packages/                      # TypeScript workspace
  core/                        # @gotipe/core — JS editor API, extensions, presets
  wasm/                        # @gotipe/wasm — WASM pkg wrapper
  react/ vue/ svelte/ solid/   # Framework adapters (MIT)
  collaboration/ ai/ export/   # Feature packages (MIT)
  block-editor/                # @gotipe/block-editor — Notion-like UI (COMMERCIAL)
  block-editor-vue/ ai-ui/ theme/  # Commercial packages
apps/
  cloud/                       # Go API + WebSocket sync server
  playground/                  # Vite + React demo
  docs/                        # Mintlify documentation site (docs.gotipe.com)
infra/                         # Docker Compose, Caddy, pgBouncer, scripts
docs/                          # Design documents (00-19), Russian
```

## Команды разработки

```bash
# WASM
wasm-pack build crates/gotipe-wasm --release --target web   # Core WASM (~255KB gzip)
pnpm build:wasm                                              # Build WASM + optimize + copy

# Rust
cargo test --workspace                     # Все unit tests
cargo test -p gotipe-crdt -- --ignored     # Property tests (slow)
cargo bench -p gotipe-core                 # Criterion benchmarks
cargo clippy --workspace -- -D warnings    # Lint
cargo fmt --check                          # Format check

# TypeScript
pnpm install && pnpm build                 # Install + build all
pnpm dev                                   # Watch mode (Turborepo)
pnpm test                                  # Vitest
pnpm typecheck                             # tsc --noEmit
pnpm lint                                  # Biome

# Go Cloud
cd apps/cloud && go run ./cmd/api          # Run API server
cd apps/cloud && go test ./... -race       # Tests + race detector
cd apps/cloud && go test -tags=integration ./...  # Integration (testcontainers)

# E2E
pnpm exec playwright test                  # Playwright (Chrome + Firefox + Safari)

# Инфраструктура
docker compose -f infra/docker-compose.dev.yml up -d  # Postgres + Valkey + MinIO
```

## Архитектурные правила

- **Block-first model:** Document → Block[] (НЕ ProseMirror node tree). Block = `{id: UUID v7, type, attrs, content: RichText|Raw|Empty, children}`
- **WASM owns state:** EditorState живёт в Rust/WASM. JS получает ViewState (plain objects). Изменения ТОЛЬКО через `dispatch(Transaction)` — никогда не мутировать state из JS
- **Extension = всё:** Каждый block type, mark, behavior — extension. API: `defineExtension()` (TS), `Extension` trait (Rust). Не создавать блоки/marks вне extension system
- **CRDT sync = binary protocol:** Message types 0x01-0x09, zstd compression. НЕ JSON WebSocket
- **HTML sanitization triple:** Rust ammonia → JS DOMPurify → URL whitelist (http/https/mailto). Никогда `dangerouslySetInnerHTML` без DOMPurify
- **Lazy WASM loading:** Core ~255KB eager. PDF ~400KB и DOCX ~60KB — lazy `import()`. Не бандлить PDF/DOCX в core
- **Conditional exports:** `"types"` ВСЕГДА первым в package.json exports → `import` → `require`
- **CSS tokens:** Переменные `--gt-*` (НЕ `--gotipe-*`). Классы `.gotipe-*`. Semantic tokens, не hardcoded colors
- **Feature flags (Cargo):** `gotipe-export` features контролируют WASM bundle size. Default = `["html","markdown","plaintext"]`
- **pgBouncer transaction mode:** НЕ session-level features (SET LOCAL, prepared statements). Миграции напрямую к Postgres
- **Rate limiting:** Sliding window counter через Valkey Lua script. НЕ fixed window
- **JWT:** ES256. Blocklist в Valkey DB 1 (noeviction, AOF). Commercial license: JWT ES256, offline verification

## Паттерны кода

### Rust
- Публичные типы: `#[derive(Debug, Clone, Serialize, Deserialize)]`. Ошибки через `thiserror`
- WASM exports: `#[wasm_bindgen]` на `WasmEditor`. Serialization через `serde-wasm-bindgen`
- Property tests: `proptest!` для CRDT convergence, JSON roundtrip, schema validation
- Benchmarks: `criterion` для CRDT apply, export, schema validation
- WASM optimization: `opt-level = "z"`, `lto = true`, `codegen-units = 1`
- Feature gates: `#[cfg(feature = "pdf")]` для optional modules

### TypeScript
- Factory: `createEditor(options)` (НЕ `new Editor()`). Chainable: `editor.chain().toggleBold().run()`
- Extensions: `defineExtension({ name, schema, commands, keybindings, inputRules })`
- Presets: `MinimalPreset`, `DefaultPreset`, `FullPreset`
- Adapters: React = `useSyncExternalStore`, Vue = `shallowRef + triggerRef`, Svelte 5 = `$state`, Solid = `createSignal`
- Build: tsup (ESM + CJS), `"sideEffects": false`, entry = `src/index.ts`
- Ошибки: `GoTipeError` с typed `code` для pattern matching

### Go Cloud
- Router: Chi v5, middleware chain (порядок критичен)
- WebSocket: gorilla/websocket, Room manager per document, binary CRDT messages
- Graceful shutdown 6-phase: drain HTTP → stop WebSocket → stop workers → close DB/Valkey
- Logging: `slog` (JSON prod, text dev)
- Background workers: goroutine + context + ticker. Cleanup 24h, retry compensation
- Idempotency: Valkey с TTL, header `Idempotency-Key`
- Error format: `{"error": {"code": "...", "message": "...", "details": {}}}`

## Naming conventions

| Сущность | Формат | Пример |
|----------|--------|--------|
| Rust crate | `gotipe-*` (kebab) | `gotipe-crdt` |
| Rust module/file | `snake_case` | `sync_protocol.rs` |
| Rust type | `PascalCase` | `EditorState` |
| TS package | `@gotipe/*` | `@gotipe/react` |
| TS module file | `kebab-case.ts` | `editor-manager.ts` |
| React component | `PascalCase.tsx` | `BubbleMenu.tsx` |
| CSS variable | `--gt-*` | `--gt-text-base` |
| CSS class | `.gotipe-*` | `.gotipe-editor` |
| Block/mark type | `camelCase` | `codeBlock`, `bulletList` |
| Go package | `snake_case` | `internal/auth` |
| API endpoint | `/v1/...` | `/v1/documents` |
| Env var | `SCREAMING_SNAKE` | `DATABASE_URL` |
| WASM export | `snake_case` | `export_html` |

## Тестирование

| Уровень | Инструмент | Паттерн |
|---------|-----------|---------|
| Rust unit | `cargo test` | `#[cfg(test)] mod tests`, naming: `test_<action>_<result>` |
| Rust property | proptest | CRDT convergence, JSON roundtrip, schema soundness. `#[ignore]` |
| Rust bench | criterion | Parse, insert, CRDT merge, export |
| TS unit | Vitest | `describe/it`, mock WASM через `vi.mock` |
| Go unit | `go test` | Table-driven tests, testify assert/require |
| Go integration | testcontainers | Postgres + Valkey в Docker |
| E2E | Playwright | Chrome + Firefox + Safari, data-attr selectors (`[data-gotipe-*]`) |

Coverage: Rust ≥80%, TS ≥75%, Go ≥70%.

## Частые ошибки — НЕ ДЕЛАЙ

- НЕ мутировать EditorState из JS — только `dispatch(Transaction)` через WASM
- НЕ использовать ProseMirror-style node tree — GoTipe = Block-first
- НЕ бандлить PDF/DOCX WASM в core bundle — только lazy `import()`
- НЕ использовать JSON для WebSocket sync — binary protocol + zstd
- НЕ забывать `#[wasm_bindgen]` при добавлении public API в `gotipe-wasm`
- НЕ использовать `dangerouslySetInnerHTML` без DOMPurify
- НЕ создавать block types вне extension system
- НЕ хардкодить цвета — использовать `--gt-*` semantic tokens
- НЕ ставить `"require"` перед `"types"` в package.json exports
- НЕ добавлять runtime deps в MIT packages, если нужны только для commercial block-editor
- НЕ использовать session-level features с pgBouncer
- НЕ делать Stripe вызовы внутри DB транзакций
- НЕ возвращать 5xx из Stripe webhook handler (всегда 200)
- НЕ использовать Yjs API — GoTipe имеет собственный CRDT
- НЕ добавлять default features в `gotipe-export` без необходимости (растёт WASM binary)

## Где искать

| Что | Где |
|-----|-----|
| Document model, Block, TextSpan | `crates/gotipe-core/src/document.rs` |
| Schema validation | `crates/gotipe-schema/src/validate.rs` |
| Transaction, Step types | `crates/gotipe-core/src/transform.rs` |
| CRDT engine | `crates/gotipe-crdt/src/` |
| WASM bindings | `crates/gotipe-wasm/src/lib.rs` |
| JS editor API | `packages/core/src/editor.ts` |
| Extension API | `packages/core/src/types/extension.ts` |
| React adapter | `packages/react/src/` |
| Block Editor UI | `packages/block-editor/src/components/` |
| Go API handlers | `apps/cloud/internal/` |
| Go WebSocket sync | `apps/cloud/internal/sync/` |
| DB migrations | `apps/cloud/migrations/` |
| CI workflows | `.github/workflows/` |
| Infra (Docker, Caddy) | `infra/` |
| Design docs | `docs/00-19` (Russian) |
