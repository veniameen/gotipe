# GoTipe — Обзор продукта

> **GoTipe** — Rust-powered editor framework: headless core + block editor + real-time collaboration + AI — всё open-source, облако опционально.

**Домен:** [gotipe.com](https://gotipe.com)
**Лицензия:** MIT
**Репозиторий:** github.com/gotipe/gotipe

---

## Что такое GoTipe

GoTipe — headless, framework-agnostic rich text editor framework с Notion-like UX из коробки. Ядро написано на Rust и компилируется в WebAssembly, обеспечивая 2-5x прирост производительности по сравнению с чисто JS-решениями. Real-time collaboration на базе CRDT работает без облака. AI-интеграция встроена в core, а не добавлена как платный addon.

```
┌─────────────────────────────────────────────────────────┐
│                    GoTipe Framework                      │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │  React   │ │  Vue 3   │ │ Svelte 5 │ │  Solid   │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
│       └──────┬─────┴──────┬─────┴─────────────┘         │
│              ▼            ▼                              │
│  ┌──────────────────────────────────────────────┐       │
│  │          @gotipe/core (JS Bindings)           │       │
│  └──────────────────┬───────────────────────────┘       │
│                     ▼                                    │
│  ┌──────────────────────────────────────────────┐       │
│  │         gotipe-wasm (Rust/WASM Core)          │       │
│  │  ┌─────────┐ ┌──────┐ ┌──────┐ ┌──────────┐ │       │
│  │  │ Schema  │ │ CRDT │ │  AI  │ │ Export   │ │       │
│  │  │ Engine  │ │Engine│ │Layer │ │ Engine   │ │       │
│  │  └─────────┘ └──────┘ └──────┘ └──────────┘ │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

---

## Чем GoTipe НЕ является

| Заблуждение | Реальность |
|-------------|-----------|
| Обёртка над ProseMirror | Свой Rust-движок, своя document model, свой transform layer |
| SaaS-only продукт | Полностью работает оффлайн, self-hosted, zero vendor lock-in |
| Generic CMS-компонент | Фокус на developer experience: headless API, typed schema, extensible |
| React-only библиотека | Framework-agnostic core. Первоклассная поддержка React, Vue, Svelte, Solid |
| Freemium с paywall на extensions | Headless core MIT. Block Editor UI (Notion-like) — коммерческая лицензия. Cloud — managed инфраструктура |
| Только для браузера | WASM core работает в Node.js, Deno, Go, Rust — server-side validation и rendering без браузера |
| Исследовательский проект | Продукт с коммерческой моделью (GoTipe Cloud) и roadmap до v2.0 |

---

## Целевая аудитория

| Persona | Потребность | Что даёт GoTipe |
|---------|-------------|-----------------|
| **Frontend-разработчик** в стартапе | Быстро встроить Notion-like editor в SaaS | Block Editor — 1 строчка кода, готовый Notion-like UI (лицензия) |
| **Backend-инженер** | Валидировать и обрабатывать rich text на сервере | WASM core в Node.js/Go/Rust — парсинг без браузера (MIT) |
| **Tech Lead** | Выбрать editor framework, который не станет vendor lock-in | MIT headless core, self-hosted collaboration, можно построить свой UI |
| **Product Manager** | Добавить collaborative editing без Tiptap Cloud pricing | CRDT из коробки, self-hosted WebSocket server (MIT) |
| **AI-продукт** | Интегрировать LLM в текстовый редактор | Ghost text, AI commands, multi-provider — в headless core (MIT) |
| **Enterprise-архитектор** | On-premise editor с SOC 2, GDPR compliance | Self-hosted всё, audit log, GoTipe Enterprise |
| **Open-source контрибьютор** | Работать с понятным, typed Rust-кодом | Rust workspace с чёткой модульностью, документированное API |
| **Indie-разработчик** | Бесплатный headless editor без ограничений | Headless core MIT, включая collaboration и AI layer |

---

## Ценностное предложение

### 1. Rust/WASM Core — производительность
Парсинг, валидация, CRDT, трансформации — всё в Rust, скомпилированном в WASM. На документах >10K блоков GoTipe в 2-5x быстрее ProseMirror-based решений. См. [01-architecture.md#performance](01-architecture.md#performance).

### 2. Нативный CRDT — collaboration без облака
Collaboration на базе CRDT (Loro-inspired) встроена в core. Работает peer-to-peer, через self-hosted сервер, или через GoTipe Cloud. Не нужно платить за синхронизацию — это часть open-source ядра. См. [02-collaboration.md](02-collaboration.md).

### 3. Два уровня: MIT headless + коммерческий Block Editor
Headless core (все extensions, CRDT, AI layer, export) — MIT. Разработчик может построить **любой** UI бесплатно. Для тех, кто хочет **готовый Notion-like UI** из коробки — `@gotipe/block-editor` с коммерческой лицензией. Как у Tiptap: core бесплатный, premium UI — платный. См. [05-extensions.md](05-extensions.md).

### 4. Block Editor — Notion-like UX одной строчкой
`@gotipe/block-editor` — коммерческий пакет с готовым Notion-like UI: slash commands, drag and drop, nested blocks, floating toolbar, темы. Одна строчка `<BlockEditor />` = готовый редактор. Headless API позволяет построить свой UI бесплатно. См. [04-block-editor.md](04-block-editor.md).

### 5. AI-first — LLM в core архитектуры
Ghost text (inline suggestions), AI commands (rewrite, expand, translate), streaming generation — встроены в ядро, не addon. Provider-agnostic: OpenAI, Anthropic, Gemini, Ollama. См. [07-ai.md](07-ai.md).

### 6. Server-side rendering и validation
WASM core работает везде: Node.js, Deno, Go, Rust. Парсить, валидировать, рендерить документы на сервере без инстанцирования браузерного DOM. См. [03-editor-core.md#server-side](03-editor-core.md#server-side).

### 7. Framework-agnostic — React, Vue, Svelte, Solid
Тонкий adapter layer для каждого фреймворка. Core ничего не знает о React/Vue. Переключение фреймворка — замена одного пакета. См. [06-framework-adapters.md](06-framework-adapters.md).

### 8. Multi-backend bindings
WASM bindings для Go, Python, Ruby. Backend-разработчики работают с теми же types и schema, что и фронтенд. Один source of truth. См. [09-sdk-and-api.md](09-sdk-and-api.md).

---

## Рыночный контекст

- **Рынок WYSIWYG-редакторов:** $211M (2025) → $350M+ (2033)
- **71%** респондентов считают RTE критичным для платформ
- **60%** организаций покупают RTE вместо build-your-own
- **42%** назвали "collaboration with AI" главной фичей на 5 лет

GoTipe входит на рынок с дифференцированным предложением: Rust/WASM performance + нативный CRDT + AI-first + честный open-source. Подробный анализ в [13-competitive.md](13-competitive.md).

---

## Монетизация

### 3 продукта

```
┌──────────────────────────────────────────────────────────┐
│  @gotipe/block-editor (COMMERCIAL)                        │
│  Notion-like UI: SlashMenu, DragHandle, BubbleMenu,      │
│  BlockToolbar, темы, AI UI — готовый редактор              │
│  Коммерческая лицензия по ключу                           │
├──────────────────────────────────────────────────────────┤
│  GoTipe Cloud (SUBSCRIPTION)                              │
│  Managed sync, AI proxy, export, analytics                │
│  Block Editor лицензия включена в подписку                │
├──────────────────────────────────────────────────────────┤
│  GoTipe Core (MIT, FREE)                                  │
│  Headless: Rust/WASM engine, extensions, CRDT, AI layer,  │
│  export, framework adapters, self-hosted server            │
└──────────────────────────────────────────────────────────┘
```

### Тарифы

| Tier | Что входит | Цена |
|------|-----------|------|
| **Headless Core (MIT)** | Editor engine, все extensions, CRDT, AI layer, export, framework adapters, self-hosted server | **$0** |
| **Block Editor** | Notion-like UI компоненты, темы, slash commands, DnD, toolbars. Лицензия на 1 production domain | **$149/app/год** |
| **Block Editor Business** | Block Editor + до 10 domains, приоритетная поддержка | **$499/app/год** |
| **GoTipe Cloud Starter** | Managed sync (1K docs), AI (10K req/mo), Export (1K/mo) + **Block Editor включён** | **$29/mo** |
| **GoTipe Cloud Pro** | 10K docs, 100K AI req, unlimited export, analytics + **Block Editor включён** | **$99/mo** |
| **GoTipe Cloud Business** | 100K docs, 1M AI req, SSO, priority support + **Block Editor включён** | **$299/mo** |
| **GoTipe Enterprise** | On-premise, SLA, dedicated support, SOC 2, audit log + **Block Editor включён** | **Custom** |

> **Принцип:** Headless core = MIT, всегда бесплатный. Block Editor UI = коммерческая лицензия (как Tiptap Editor). Cloud = managed инфраструктура + Block Editor лицензия в комплекте.

Детали ценообразования и сравнение с конкурентами в [10-cloud.md#pricing](10-cloud.md#pricing) и [12-release-plan.md#pricing](12-release-plan.md#pricing).

---

## Индекс документации

| # | Документ | Описание |
|---|---------|----------|
| 00 | [00-overview.md](00-overview.md) | Обзор продукта *(этот файл)* |
| 01 | [01-architecture.md](01-architecture.md) | Архитектура системы, Rust/WASM core, document model |
| 02 | [02-collaboration.md](02-collaboration.md) | Real-time collaboration, CRDT, sync protocol |
| 03 | [03-editor-core.md](03-editor-core.md) | Editor core (Rust/WASM): schema, transforms, commands |
| 04 | [04-block-editor.md](04-block-editor.md) | Block editor: Notion-like UX, slash commands, drag-n-drop |
| 05 | [05-extensions.md](05-extensions.md) | Extension system: API, built-in extensions, custom extensions |
| 06 | [06-framework-adapters.md](06-framework-adapters.md) | Framework integration: React, Vue, Svelte, Solid |
| 07 | [07-ai.md](07-ai.md) | AI integration: ghost text, commands, providers |
| 08 | [08-export-import.md](08-export-import.md) | Document conversion: PDF, DOCX, Markdown, HTML |
| 09 | [09-sdk-and-api.md](09-sdk-and-api.md) | SDK и API: пакеты, types, примеры |
| 10 | [10-cloud.md](10-cloud.md) | GoTipe Cloud: architecture, API, pricing |
| 11 | [11-monorepo.md](11-monorepo.md) | Структура репозитория, tooling, CI/CD |
| 12 | [12-release-plan.md](12-release-plan.md) | План реализации и релиза |
| 13 | [13-competitive.md](13-competitive.md) | Конкурентный анализ |
| 14 | [14-security-privacy.md](14-security-privacy.md) | Безопасность и приватность |
| 15 | [15-accessibility-i18n.md](15-accessibility-i18n.md) | Доступность, i18n, RTL, IME, мобильные устройства |
| 16 | [16-comments-versioning.md](16-comments-versioning.md) | Комментарии, версионирование, права доступа |
| 17 | [17-migration-guide.md](17-migration-guide.md) | Миграция с Tiptap, ProseMirror, Lexical, Slate |
| 18 | [18-design-system.md](18-design-system.md) | Design system: UI компоненты, темы, CSS tokens, анимации |
| 19 | [19-testing.md](19-testing.md) | Стратегия тестирования: Rust, TS, Go, E2E, coverage |
