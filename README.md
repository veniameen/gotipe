# GoTipe

Rust/WASM rich text editor framework с Notion-like UX. Headless core — три уровня интеграции.

Один движок (Rust → WASM) покрывает весь спектр задач:

- **Headless core** — `@gotipe/core` + адаптеры (React, Vue, Svelte, Solid), строишь UI сам
- **Block Editor** — `@gotipe/block-editor`, Notion-like интерфейс из коробки
- **GoTipe Cloud** — managed backend с realtime collaboration, AI и экспортом

## Стек

Rust + WASM (Core) · TypeScript + pnpm + Turborepo (Packages) · Go + Chi (Cloud API) · PostgreSQL · Valkey · Playwright (E2E)

## Документация

Подробные требования — в [docs/](docs/).
