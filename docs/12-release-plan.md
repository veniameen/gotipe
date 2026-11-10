# GoTipe — План реализации и релиза

> **Историческая спецификация, не руководство по текущему API.** Примеры, сроки,
> сравнения производительности, коммерческие условия и обещания ниже не подтверждают
> реализацию или доступность сервиса. Актуально: [контракты](development/editor-contracts.md),
> [карта кода](development/code-map.md), [проверки](development/testing.md),
> [план выпуска](22-release-readiness.md). Лицензии определяются `LICENSE` и manifest
> каждого пакета, а не этим документом.

## Цель

Полноценный production-ready rich text editor framework с Notion-like UX, multi-framework адаптерами, CRDT collaboration, AI integration, document export и GoTipe Cloud. Не итеративный MVP — а завершённый продукт, готовый к публичному релизу.

**Критерии готовности v1.0:**
- Editor рендерит и редактирует документы любой сложности
- 19+ block types (paragraph, heading 1-6, bulletList, orderedList, listItem, codeBlock, image, blockquote, divider, callout, table, tableRow, tableCell, tableHeader, toggle, columns, column, embed, math, file)
- Inline marks: bold, italic, underline, strikethrough, code, link, highlight, superscript, subscript
- Slash commands с fuzzy search и keyboard navigation
- Input rules (Markdown shortcuts: `# `, `- `, `**bold**`, `` ``` ``, `> `, etc.)
- Drag-and-drop блоков с nesting
- Real-time collaboration (N пользователей, CRDT, remote cursors, presence)
- Offline editing с автоматической синхронизацией при reconnect
- AI ghost text (inline suggestions), AI commands (rewrite, expand, translate)
- Export: HTML, Markdown, PDF (typst), DOCX (docx-rs)
- Import: HTML, Markdown, Notion export, Google Docs paste
- React, Vue 3, Svelte 5, Solid адаптеры — все first-class
- Vanilla JS API для framework-agnostic использования
- Server-side WASM (Node.js, Deno) + нативный Rust
- GoTipe Cloud: managed sync, AI proxy, export service, REST API
- Documentation site (docs.gotipe.com)
- Interactive playground (playground.gotipe.com)
- Landing page (gotipe.com)

---

## Архитектура разработки

### Модули и зависимости

```
gotipe-schema ──────────────────────────────┐
     │                                       │
     ▼                                       │
gotipe-core ─────────────────────────┐      │
     │              │                 │      │
     ▼              ▼                 ▼      ▼
gotipe-crdt    gotipe-ai    gotipe-export   gotipe-wasm
     │              │                 │         │
     └──────┬───────┴────────┬───────┘         │
            ▼                ▼                  ▼
    @gotipe/collaboration  @gotipe/ai    @gotipe/core (JS)
                                               │
                    ┌──────────┬──────────┬─────┤
                    ▼          ▼          ▼     ▼
             @gotipe/react @gotipe/vue @gotipe/svelte @gotipe/solid
```

### Параллелизация

Критический путь: `gotipe-schema` → `gotipe-core` → `gotipe-wasm` → `@gotipe/core` → framework adapters.

После готовности `gotipe-core` остальные crates (`gotipe-crdt`, `gotipe-ai`, `gotipe-export`) разрабатываются **параллельно**.

---

## Трудозатраты

### По компонентам

| Компонент | Person-months | Зависимости | Критический путь |
|-----------|:------------:|-------------|:----------------:|
| **gotipe-schema** (NodeSpec, MarkSpec, validation) | 1.5 | — | Да |
| **gotipe-core** (Document, EditorState, Transaction, Steps, Commands) | 3 | gotipe-schema | Да |
| **gotipe-crdt** (RichText CRDT, MovableTree, Sync, Awareness, History) | 3 | gotipe-core | Нет |
| **gotipe-ai** (context builder, ghost text engine, provider interface) | 1.5 | gotipe-core | Нет |
| **gotipe-export** (HTML, Markdown, PDF via typst, DOCX via docx-rs) | 2 | gotipe-core | Нет |
| **gotipe-wasm** (wasm-bindgen, WasmEditor, JS interop) | 1.5 | gotipe-core | Да |
| **@gotipe/core** (JS wrapper, createEditor, event system, extensions) | 2 | gotipe-wasm | Да |
| **@gotipe/react** (hooks, components, block renderers, toolbars) | 2 | @gotipe/core | Да |
| **@gotipe/vue** (composables, components, provide/inject) | 1.5 | @gotipe/core | Нет |
| **@gotipe/svelte** (runes, components, stores) | 1.5 | @gotipe/core | Нет |
| **@gotipe/solid** (signals, components) | 1 | @gotipe/core | Нет |
| **@gotipe/collaboration** (GoTipeProvider, WebSocket client) | 1 | gotipe-crdt, @gotipe/core | Нет |
| **@gotipe/ai** (AIInline extension, AI commands, providers) | 1.5 | gotipe-ai, @gotipe/core | Нет |
| **@gotipe/export** (client-side JS API) | 1 | gotipe-export, @gotipe/core | Нет |
| **Block editor UX** (slash commands, DnD, toolbars, block types) — **COMMERCIAL** | 3 | @gotipe/react | Да |
| **Block Editor license system** (JWT verification, watermark, domain check) | 0.5 | @gotipe/core | Нет |
| **Go sync server** (WebSocket, REST API, PostgreSQL, auth) | 2 | gotipe-crdt | Нет |
| **Go Cloud API** (documents CRUD, API keys, billing, AI proxy) | 2 | Go sync server | Нет |
| **Infrastructure** (Docker, CI/CD, monitoring, deployment) | 1.5 | — | Нет |
| **Documentation site** (Mintlify, API reference из OpenAPI, guides, examples) | 1.5 | Все пакеты | Нет |
| **Playground** (interactive demo, collaboration, AI) | 1 | Документация | Нет |
| **Landing page** (gotipe.com, marketing) | 0.5 | — | Нет |
| **Testing & QA** (unit, integration, e2e, browser matrix, accessibility) | 2 | Все | Нет |
| **Total** | **~36 person-months** | | |

### С учётом параллелизации

| Команда | Срок | Критический путь |
|---------|:----:|:----------------:|
| **3 инженера** | ~12 месяцев | schema → core → wasm → JS → React → UX |
| **5 инженеров** | ~8 месяцев | Та же цепочка, больше параллелизации |
| **7 инженеров** | ~6 месяцев | Максимальная параллелизация |

---

## Работы по модулям

### 1. Rust Core (gotipe-schema + gotipe-core)

| Задача | Описание |
|--------|----------|
| NodeSpec, MarkSpec, AttrSpec | Typed schema DSL: content rules, marks rules, attribute validators |
| Schema validation engine | Валидация документов, проверка типов блоков и marks |
| Document model | Block, TextSpan, Mark, nested children, block metadata |
| EditorState | Immutable state: document + selection + schema + extensions |
| Transaction & Steps | InsertText, DeleteText, AddMark, RemoveMark, InsertBlock, DeleteBlock, MoveBlock, SetBlockAttrs, MergeBlocks, SplitBlock |
| Commands | toggleMark, wrapInBlock, liftBlock, splitBlock, joinBlocks, selectAll, insertBlock |
| InputRules | Markdown shortcuts: `# ` → heading, `- ` → list, `**text**` → bold, `` ``` `` → code block |
| Schema presets | MinimalPreset (paragraph + bold/italic), DefaultPreset (все блоки + marks), FullPreset (+ AI + collaboration) |
| Property-based tests | Fuzzing с proptest, convergence tests, roundtrip serialization |

### 2. CRDT Engine (gotipe-crdt)

| Задача | Описание |
|--------|----------|
| RichTextCrdt | Fugue-based text CRDT с marks (bold/italic ranges) |
| MovableTreeCrdt | Tree CRDT для block hierarchy, drag-and-drop, nesting |
| CrdtDocument | Объединение RichText + Tree, snapshot/update encoding |
| SyncProtocol | Binary sync protocol: state vectors, incremental updates |
| AwarenessProtocol | Cursor positions, selection ranges, user presence (name, color) |
| CrdtHistory | Undo/redo через CRDT: per-user undo stacks, корректный collaborative undo |
| Offline queue | Операции в IndexedDB, автоматический sync при reconnect |
| Yjs compatibility | Adapter для миграции с Yjs-based решений |

### 3. AI Engine (gotipe-ai)

| Задача | Описание |
|--------|----------|
| Context builder | Извлечение контекста из document structure (не plaintext dump) |
| Provider interface | Trait `AiProvider`: complete(), stream(), embed() |
| Ghost text engine | Debounce, context window, caching, accept/reject logic |
| OpenAI provider | GPT-4o, streaming, function calling |
| Anthropic provider | Claude, streaming |
| Ollama provider | Local LLM, zero data leakage |
| AI commands | Rewrite, expand, summarize, translate, fix grammar, change tone |
| Streaming | Server-Sent Events, incremental rendering |

### 4. Export/Import Engine (gotipe-export)

| Задача | Описание |
|--------|----------|
| HTML exporter | Semantic HTML5, XSS-safe, custom element mapping |
| HTML importer | Sanitized parsing, table/list reconstruction |
| Markdown exporter | CommonMark + GFM (tables, task lists, strikethrough) |
| Markdown importer | Pulldown-cmark parser, block type mapping |
| PDF exporter | typst-based rendering: headers, footers, page numbers, TOC |
| DOCX exporter | docx-rs: styles, tables, images, headers, bookmarks |
| Notion importer | Notion export ZIP → GoTipe blocks |
| Clipboard handler | Google Docs paste, Word paste, HTML paste |

### 5. WASM Bridge (gotipe-wasm)

| Задача | Описание |
|--------|----------|
| wasm-bindgen exports | WasmEditor class, все public methods |
| Serialization | serde-wasm-bindgen для JSON ↔ Rust structs |
| Event system | Callback registration, transaction events, state change events |
| Lazy loading | Core WASM (~150KB gzip), CRDT module (+50KB), Export module (+55KB) |
| Error handling | Rust panics → JS errors, typed error codes |
| Memory management | Document lifecycle, cleanup, WeakRef tracking |

### 6. JavaScript SDK (@gotipe/core)

| Задача | Описание |
|--------|----------|
| createEditor() | Factory с options: extensions, content, schema, plugins |
| Extension registration | defineExtension(), extension lifecycle, priority ordering |
| Event emitter | on/off/emit: transaction, update, focus, blur, selectionChange |
| Commands API | editor.commands.toggleBold(), chain().toggleBold().focus().run() |
| Plugin system | InputRule plugins, paste handlers, key bindings |
| Schema utilities | nodeSpec(), markSpec(), createSchema() |
| Storage | getJSON(), getHTML(), getMarkdown(), load() |
| TypeScript types | Полная типизация всех публичных API |

### 7. Framework Adapters

**React (@gotipe/react)**
| Задача | Описание |
|--------|----------|
| useEditor hook | Create/manage editor instance с React lifecycle |
| useEditorState hook | Реактивный доступ к state с selector pattern |
| Editor component | Rendering container, DOM mount/unmount |
| Block components | ParagraphBlock, HeadingBlock, CodeBlock, ImageBlock, etc. |
| BubbleMenu | Floating toolbar: bold, italic, link, code, highlight |
| BlockToolbar | Drag handle + plus menu + block type menu |
| SlashMenu | Fuzzy search, keyboard navigation, categories |
| NodeViewRenderer | Custom React components для block types |

**Vue 3 (@gotipe/vue)**
| Задача | Описание |
|--------|----------|
| useEditor composable | Reactive editor instance |
| useEditorState composable | Reactive state access с computed |
| EditorContent component | Rendering, provide/inject |
| Все block components | Аналогично React, с Vue template syntax |

**Svelte 5 (@gotipe/svelte)**
| Задача | Описание |
|--------|----------|
| createEditor (runes) | $state-based editor management |
| Editor component | Svelte 5 component с snippet-based rendering |
| Block components | Все block types как Svelte 5 components |

**Solid (@gotipe/solid)**
| Задача | Описание |
|--------|----------|
| createEditor (signal) | Signal-based editor management |
| Editor component | Solid JSX rendering |
| Block components | Все block types как Solid components |

### 8. Block Editor UX (Commercial — `@gotipe/block-editor`)

| Задача | Описание |
|--------|----------|
| 19 block types | Все типы из [04-block-editor.md](04-block-editor.md) |
| Slash commands | `/` menu, fuzzy search, keyboard nav, categories, custom commands |
| Input rules | Все Markdown shortcuts из [03-editor-core.md](03-editor-core.md) |
| Drag and drop | Block reordering, nesting, visual drop indicator, touch support |
| BubbleMenu | Floating toolbar, smart positioning, inline formatting |
| BlockToolbar | Drag handle, plus button, block type switcher |
| Placeholder | Per-block placeholders, first block hint |
| Selection | Block selection, multi-block selection, keyboard shortcuts |
| Clipboard | Copy/paste блоков, cross-editor paste, rich paste from external sources |
| Keyboard shortcuts | Полный набор из [04-block-editor.md#keyboard-shortcuts](04-block-editor.md#keyboard-shortcuts) |

### 9. GoTipe Cloud (Go)

| Задача | Описание |
|--------|----------|
| REST API | Documents CRUD, API keys, auth (JWT), organization management |
| WebSocket server | Real-time sync, document rooms, connection management |
| Persistence | PostgreSQL (metadata, auth), Cloudflare R2 (CRDT snapshots, assets) |
| AI proxy | OpenAI/Anthropic proxy, rate limiting, usage tracking |
| Export service | Async PDF/DOCX generation queue, R2 upload |
| Auth | API keys + JWT, organization scoping, RBAC |
| Billing | Stripe integration, usage metering, plan limits |
| Monitoring | Prometheus metrics, health checks, structured logging |
| Docker | docker-compose для self-hosted, Kubernetes manifests |

### 10. Documentation & Launch

| Задача | Описание |
|--------|----------|
| Documentation site | Mintlify-hosted (docs.gotipe.com), quickstart, API reference (auto-generated из OpenAPI), extension guides, examples |
| Playground | Interactive editor: collaboration demo, AI demo, export demo |
| Landing page | Next.js → Vercel (gotipe.com), value proposition, pricing, comparison |
| Migration guides | From Tiptap, from ProseMirror, from Lexical, from Slate |
| npm packages | Publish @gotipe/* packages to npm registry |
| GitHub | README, CONTRIBUTING, issue templates, PR templates |
| Community | Discord server, discussion templates, code of conduct |

---

## Team Allocation

| Роль | Количество | Фокус |
|------|:----------:|-------|
| **Rust engineer** | 2 | gotipe-schema, gotipe-core, gotipe-crdt, gotipe-ai, gotipe-export, gotipe-wasm |
| **Frontend engineer** | 2 | @gotipe/core, @gotipe/react, block editor UX, другие framework adapters |
| **Full-stack engineer** | 1 | Go cloud, infrastructure, CI/CD, documentation |
| **Total** | **5** | |

### Распределение по времени (5 человек, ~8 месяцев)

```
Month   1     2     3     4     5     6     7     8
        │     │     │     │     │     │     │     │
Rust-1  ████████████████████████████████░░░░░░░░░░░░
        schema ──► core ──► wasm   testing & fixes

Rust-2  ░░░░░░████████████████████████████░░░░░░░░░░
              crdt ──► ai ──► export   testing

Front-1 ░░░░░░░░░░░░████████████████████████████████
                    @gotipe/core ──► react ──► UX

Front-2 ░░░░░░░░░░░░░░░░░░████████████████████████░░
                          vue ──► svelte ──► solid

Full-St ░░░░░░░░░░░░░░░░░░░░░░████████████████████████
                              cloud ──► docs ──► launch
```

**Легенда:** `████` = активная разработка, `░░░░` = поддержка / ожидание зависимости

---

## Pricing (v1.0 Launch)

### 3 продукта

| Продукт | Модель | Описание |
|---------|--------|----------|
| **GoTipe Core** | MIT (бесплатно) | Headless editor engine, все extensions, CRDT, AI layer, export, framework adapters |
| **GoTipe Block Editor** | Коммерческая лицензия | Notion-like UI: SlashMenu, BubbleMenu, DragHandle, BlockToolbar, темы, AI UI |
| **GoTipe Cloud** | Подписка | Managed sync, AI proxy, export service, analytics + Block Editor лицензия включена |

### Block Editor (лицензия без Cloud)

| Tier | Домены | Цена |
|------|--------|------|
| **Indie** | 1 production domain | **$149/app/год** |
| **Business** | До 10 production domains + приоритетная поддержка | **$499/app/год** |
| **Enterprise** | Unlimited domains + SLA + исходный код | **Custom** |

### GoTipe Cloud (Block Editor включён)

| | Free (self-hosted) | Starter | Pro | Business | Enterprise |
|---|---|---|---|---|---|
| **Цена** | $0 | $29/mo | $99/mo | $299/mo | Custom |
| **Block Editor** | — (headless only) | ✓ Включён | ✓ Включён | ✓ Включён | ✓ Включён |
| **Documents** | Unlimited | 1,000 | 10,000 | 100,000 | Unlimited |
| **Collaboration** | Self-hosted | Cloud sync | Cloud sync | Cloud sync | On-premise |
| **AI requests** | Self-hosted | 10K/mo | 100K/mo | 1M/mo | Unlimited |
| **Export (PDF/DOCX)** | Self-hosted | 1K/mo | Unlimited | Unlimited | Unlimited |
| **Analytics** | — | Basic | Full | Full | Custom |
| **SSO** | — | — | — | SAML/OIDC | SAML/OIDC |
| **Support** | Community | Email | Priority email | Dedicated | Dedicated + SLA |
| **Audit log** | — | — | — | Yes | Yes |
| **Compliance** | — | — | — | SOC 2, GDPR | SOC 2, HIPAA, GDPR |

> **Принцип:** Headless core = MIT (бесплатно навсегда). Block Editor UI = коммерческая лицензия. Cloud = managed инфраструктура + Block Editor лицензия в комплекте.

### Сравнение с Tiptap Cloud

| Metric | GoTipe | Tiptap |
|--------|--------|--------|
| **Block Editor license** | $149/app/год | $149/app/мес |
| **Cloud entry price** | $29/mo (1K docs) + Block Editor incl. | $49/mo (500 docs) + Editor отдельно |
| **Cost per 1K docs** | $29 | $49-$98 |
| **Cost per 10K docs** | $99 | $149 |
| **Cost per 50K docs** | $299 | $999 |
| **AI included** | Yes (10K-1M req) | Separate (Content AI addon) |
| **Export included** | Yes (PDF/DOCX) | Separate (Document Conversion addon) |
| **Self-hosted** | Full-featured, MIT headless | Limited (Hocuspocus, no Comments/AI) |

---

## Success Metrics

### Launch (v1.0)

| Metric | Target | Stretch |
|--------|--------|---------|
| GitHub stars | 2,000 | 5,000 |
| npm downloads/week | 1,000 | 5,000 |
| Discord members | 200 | 1,000 |
| Cloud signups | 100 | 500 |
| Paid customers | 10 | 50 |
| Contributors | 10 | 30 |

### 6 месяцев после запуска (v1.x)

| Metric | Target |
|--------|--------|
| GitHub stars | 5,000 |
| npm downloads/week | 10,000 |
| Cloud MRR | $5,000 |
| Enterprise customers | 3 |
| Contributors | 30 |
| Framework adapters coverage | 100% parity |

---

## Roadmap после v1.0

### v1.x — Post-Launch (Month 9-14)

| Feature | Описание |
|---------|----------|
| Advanced tables | Merge cells, split cells, resize columns, header rows/columns |
| Comments & Annotations | Inline comments, resolved/unresolved states, thread replies |
| Version history | Time travel UI, diff view, named versions, restore |
| Permissions model | Read-only, comment-only, edit, admin per-document |
| Performance optimization | Virtual rendering для 10K+ блоков, lazy block loading |
| Mobile-friendly editing | Touch DnD, responsive toolbar, gesture support |
| Additional AI providers | Gemini, Mistral, Cohere, custom endpoints |
| WebRTC provider | Peer-to-peer collaboration без центрального сервера |

### v2.0 — Platform (Month 15-20)

| Feature | Описание |
|---------|----------|
| Multi-document linking | Wiki-style `[[page]]` references, backlinks |
| Embedded databases | Notion-like databases: table, board, calendar, timeline views |
| Custom views | Kanban boards, calendar view, gallery view |
| Version branching | Git-like branching & merging для документов |
| Real-time voice/video | Embedded Livekit/Daily.co для voice/video в editor |
| Plugin marketplace | Community extensions, verified plugins, monetization for authors |
| White-label solution | Полностью кастомизируемый branding для enterprise |
| Offline-first PWA | Reference PWA app с полным offline support |

---

## Риски и Mitigation

| Риск | Вероятность | Impact | Mitigation |
|------|:----------:|:------:|------------|
| WASM binary size отпугивает | Low | Medium | Lazy loading модулей, code splitting (~150KB core gzip) |
| wasm-bindgen serialization overhead | Medium | Medium | Benchmark early, shared memory, batch operations |
| CRDT convergence bugs | Medium | High | Property-based testing (proptest), formal verification |
| DOM ↔ WASM state sync complexity | Medium | High | Unidirectional data flow, WASM owns state |
| Tiptap open-sources всё | Medium | High | WASM core = structural advantage, не feature advantage |
| Разработчики не хотят новый framework | High | High | Yjs compatibility, Tiptap migration guide, killer features |
| Недостаточно контрибьюторов | Medium | Medium | Good DX, Rust привлекает quality contributors |
| Revenue ниже ожиданий | Medium | High | Два источника: Block Editor licenses + Cloud subscriptions, enterprise sales |

---

## Definition of Done (v1.0)

### Функциональность
- [ ] Все 19 block types работают корректно
- [ ] Все 11 inline marks работают корректно
- [ ] Slash commands с fuzzy search
- [ ] Input rules (Markdown shortcuts)
- [ ] Drag-and-drop с nesting
- [ ] Real-time collaboration (remote cursors, presence, conflict resolution)
- [ ] Offline editing с sync при reconnect
- [ ] AI ghost text (accept/reject, streaming)
- [ ] AI commands (rewrite, expand, translate)
- [ ] Export: HTML, Markdown, PDF, DOCX
- [ ] Import: HTML, Markdown, Notion, clipboard

### Framework Adapters
- [ ] React: полный feature set, hooks, components, toolbars
- [ ] Vue 3: полный feature set, composables, components
- [ ] Svelte 5: полный feature set, runes, components
- [ ] Solid: полный feature set, signals, components
- [ ] Vanilla JS: createEditor API без framework dependency

### Server-Side
- [ ] WASM работает в Node.js (validation, parsing, rendering)
- [ ] WASM работает в Deno
- [ ] Go sync server с WebSocket и REST API
- [ ] PostgreSQL + Cloudflare R2 persistence
- [ ] Docker compose для self-hosted deployment

### Quality
- [ ] Unit tests: >80% coverage на Rust crates
- [ ] Integration tests: все extensions + collaboration
- [ ] E2E tests: Playwright, Chrome/Firefox/Safari
- [ ] Browser compatibility: Chrome 90+, Firefox 90+, Safari 15+, Edge 90+
- [ ] WCAG 2.1 AA accessibility (keyboard navigation, screen reader, ARIA)
- [ ] Performance: <200ms first render, <50ms keystroke latency на 10K блоков
- [ ] WASM binary: <200KB gzip (core), <300KB gzip (full)
- [ ] No known security vulnerabilities (XSS, injection)

### Documentation
- [ ] docs.gotipe.com: quickstart, API reference, extension guides
- [ ] playground.gotipe.com: interactive demo
- [ ] Migration guides: Tiptap, ProseMirror, Lexical, Slate
- [ ] Self-hosted deployment guide
- [ ] CONTRIBUTING.md, code of conduct

### Launch
- [ ] npm: все @gotipe/* packages опубликованы
- [ ] crates.io: все gotipe-* crates опубликованы
- [ ] GitHub: README, templates, labels, milestones
- [ ] GoTipe Cloud: регистрация, API keys, working sync
- [ ] Мониторинг: Prometheus, alerts, health checks

---

## Связанные документы

- [00-overview.md](00-overview.md) — product overview, positioning
- [01-architecture.md](01-architecture.md) — system architecture, cost analysis
- [10-cloud.md](10-cloud.md) — cloud architecture, deployment
- [11-monorepo.md](11-monorepo.md) — repo structure, CI/CD
- [13-competitive.md](13-competitive.md) — competitive analysis, pricing
