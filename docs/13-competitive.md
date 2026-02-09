# GoTipe — Конкурентный анализ

## Полная таблица сравнения

| Аспект | GoTipe | Tiptap | Lexical | Slate | Plate | BlockNote | CKEditor | TinyMCE |
|--------|--------|--------|---------|-------|-------|-----------|----------|---------|
| **Stars** | New | ~35K | ~22.9K | ~31.3K | ~15.5K | ~8.8K | Legacy | Legacy |
| **License** | MIT | MIT | MIT | MIT | MIT | MPL 2.0 | GPL-2 | GPL-2 |
| **Foundation** | Own (Rust/WASM) | ProseMirror | Own (Meta) | Own | Slate | ProseMirror+Tiptap | Own | Own |
| **Language** | Rust + TS | TypeScript | TypeScript | TypeScript | TypeScript | TypeScript | TypeScript | TypeScript |
| **WASM** | Core | Нет | Нет | Нет | Нет | Нет | Нет | Нет |
| **Block paradigm** | Block-first | Node tree | Node tree | Node tree | Slate blocks | Block-first | Node tree | Node tree |
| **Framework** | Agnostic | Agnostic | React-first | React-first | React-only | React-first | Agnostic | Agnostic |
| **React** | First-class | First-class | First-class | First-class | Only | First-class | Via adapter | Via adapter |
| **Vue** | First-class | First-class | Community | Community | Нет | Нет | Via adapter | Via adapter |
| **Svelte** | First-class | Community | Нет | Нет | Нет | Нет | Нет | Нет |
| **Solid** | First-class | Нет | Нет | Нет | Нет | Нет | Нет | Нет |
| **Collaboration** | CRDT (built-in) | Yjs (Hocuspocus) | Yjs (buggy) | Yjs | Hocuspocus | Yjs/Liveblocks | Proprietary | Proprietary |
| **CRDT type** | Loro-inspired Rust | Yjs (JS) | Yjs (JS) | Yjs (JS) | Yjs (JS) | Yjs (JS) | N/A (OT) | N/A (OT) |
| **Offline** | Full CRDT | Yjs CRDT | Limited | Yjs CRDT | Yjs CRDT | Yjs CRDT | Нет | Нет |
| **AI** | Built-in core | Content AI (paid) | DIY | DIY | DIY | Нет | AI plugin | AI Assistant |
| **Ghost text** | Built-in | Нет (Content AI) | Нет | Нет | Нет | Нет | Нет | Нет |
| **Slash commands** | Built-in | Extension | DIY | DIY | Built-in | Built-in | Нет | Нет |
| **DnD blocks** | Built-in | Extension | DIY | DIY | Built-in | Built-in | Нет | Нет |
| **Tables** | Built-in | TableKit (v3) | Built-in | Community | Built-in | Basic | Built-in | Built-in |
| **Export PDF** | Built-in (typst) | Paid Cloud | DIY | DIY | DIY | Нет | Paid | Нет |
| **Export DOCX** | Built-in (docx-rs) | Paid Cloud | DIY | DIY | DIY | Нет | Paid | Нет |
| **Server-side** | WASM (Node/Deno/Go) | Full Tiptap stack | Manual | Manual | Manual | Нет | Server-side | Нет |
| **NPM downloads** | New | 3M+/mo | 3M+/mo | 600K+/mo | 200K+/mo | 100K+/mo | 800K+/mo | 500K+/mo |
| **Company** | GoTipe | Tiptap GmbH | Meta | Community | Community | TypeCell | CKSource | Tiny Technologies |
| **Revenue** | $0 (pre-launch) | $2.3M (2024) | Meta-funded | $0 | Small | Grants | ~$11-15M | ~$10M |
| **Pricing** | Cloud $29+ | Cloud $49+ | Free | Free | Free+ | Free | $144+/mo | $25+/mo |

---

## Moat: уникальные преимущества GoTipe

### 1. Rust/WASM Core
Единственный RTE framework с ядром на Rust, скомпилированным в WASM. Это даёт:
- 2-5x скорость парсинга, валидации, CRDT operations vs JavaScript
- Memory safety без GC pauses на больших документах
- Один codebase для браузера и сервера (WASM + нативный Rust)
- Compact binary (~255KB gzip vs ProseMirror+Tiptap ~90KB, но GoTipe включает CRDT+export)

**Ни один конкурент не имеет Rust/WASM core.** Все основаны на чистом JavaScript.

### 2. Нативный CRDT
CRDT встроен в document model, а не добавлен как adapter поверх (как Yjs поверх ProseMirror в Tiptap). Это означает:
- Тighter integration: CRDT operations = document transforms (без mapping layer)
- History через CRDT (корректный undo в collaborative editing)
- MovableTree CRDT для drag-and-drop блоков (Yjs не имеет нативного tree CRDT)
- Binary sync protocol (компактнее, чем Yjs encoding на больших документах)

### 3. AI-first
AI integration (ghost text, commands, context builder) — часть core architecture, не addon:
- Provider-agnostic: OpenAI, Anthropic, Gemini, Ollama
- Ghost text rendering через decoration layer (не DOM hack)
- Context builder знает о document structure (не просто plaintext dump)
- Self-hosted AI (Ollama) — данные не покидают пользователя

Tiptap Content AI — платный addon. CKEditor AI — plugin. GoTipe AI — часть MIT core.

### 4. Честный Open-Source
**Все extensions MIT.** Нет "Pro tier", нет paywall на фичи. Единственное, за что платишь — managed infrastructure (Cloud).

| Feature | GoTipe | Tiptap (до июня 2025) | Tiptap (после) |
|---------|--------|----------------------|----------------|
| DragHandle | MIT | Pro ($150+/mo) | MIT |
| FileHandler | MIT | Pro | MIT |
| Collaboration | MIT | MIT (client), Hocuspocus MIT | Без изменений |
| AI | MIT | Content AI (Cloud paid) | Без изменений |
| Export PDF/DOCX | MIT (client) | Cloud paid | Без изменений |
| Comments | MIT | Cloud paid | Без изменений |

### 5. Multi-framework
Первоклассная поддержка React, Vue, Svelte, Solid + Vanilla JS. Не "React-first with community Vue adapter", а tested & documented adapters для каждого фреймворка.

### 6. Server-side without browser
WASM core работает в Node.js, Deno, Go, Rust нативно. Валидация, парсинг, рендеринг — без инстанцирования DOM. Для Tiptap нужен весь ProseMirror стек для server-side parsing.

### 7. Self-hosted everything
Collaboration server, AI proxy, export service — всё self-hosted через Docker. Нет vendor lock-in. GoTipe Cloud — удобство, не необходимость.

---

## GoTipe vs конкуренты: преимущества по областям

| Область | Конкурент | Подход конкурента | GoTipe |
|---------|-----------|-------------------|--------|
| **Extension API** | Tiptap | JS class inheritance, untyped | Typed Rust extensions, functional `defineExtension()`, built-in slash commands |
| **Block paradigm** | BlockNote | ProseMirror+Tiptap wrapper | Собственный Rust/WASM core, block-first document model |
| **Performance** | Lexical | Lightweight JS architecture | WASM core, 2-5x быстрее на больших документах |
| **Document model** | Slate | Untyped flexible tree | Typed schema, Rust-validated structure |
| **Block editor UX** | Notion | Проприетарный, закрытый | Open-source, полностью кастомизируемый |
| **CRDT** | Loro | Standalone Rust CRDT library | Tight integration с editor document model |
| **Collaboration UX** | Figma | C++/WASM multiplayer | Применено к text editing с awareness и cursors |
| **Enterprise** | CKEditor | GPL лицензия, SaaS-only collab | MIT, self-hosted, SOC 2 compliance |
| **AI integration** | Novel (Vercel) | Single provider, hosted only | Multi-provider, self-hosted Ollama support |

---

## Ценовое позиционирование

```
Price/month (для ~1000 collaborative documents):

$0       GoTipe Self-Hosted (MIT) ████████████████████████████  FREE
$25      TinyMCE Starter          ████████
$29      GoTipe Cloud Starter     █████████
$49      Tiptap Starter (500 docs)████████████████
$99      GoTipe Cloud Pro (10K)   ████████████████████████████████
$144     CKEditor Small            ████████████████████████████████████████████████
$149     Tiptap Growth (5K docs)  █████████████████████████████████████████████████
$299     GoTipe Business (100K)   ██████████████████████████████████████████████████████████████
$405     TinyMCE Professional     █████████████████████████████████████████████████████████████████████████
$999     Tiptap Scale (50K docs)  ███████████████████████████████████████████████████████████████████████████████████████
```

### Cost per 1000 Documents (Cloud collaboration)

| Editor | Cost per 1K docs/mo |
|--------|-------------------|
| GoTipe Self-Hosted | **$0** (+ your infra ~$60/mo) |
| GoTipe Cloud | **$29** |
| Tiptap Cloud | **$49-98** |
| Liveblocks | **$29** (per MAU, not docs) |
| CKEditor | **$144+** (per editor loads, not docs) |

---

## Ключевые дифференциаторы (summary)

| # | Дифференциатор | Конкурент | GoTipe Advantage |
|---|---------------|-----------|-----------------|
| 1 | **Rust/WASM core** | Все: чистый JS | 2-5x скорость, memory safety, server-side WASM |
| 2 | **Нативный CRDT** | Tiptap/BlockNote: Yjs adapter | Tighter integration, MovableTree, binary protocol |
| 3 | **AI-first** | Tiptap: платный addon | Ghost text в MIT core, provider-agnostic |
| 4 | **Все extensions MIT** | Tiptap: был Pro tier | Нет paywall, нет vendor lock-in |
| 5 | **Multi-framework** | Lexical/Slate/Plate: React-only | React, Vue, Svelte, Solid — first-class |
| 6 | **Server-side WASM** | Tiptap: нужен PM стек | Валидация без браузера, multi-language bindings |
| 7 | **Self-hosted** | CKEditor/TinyMCE: SaaS-only collab | Docker compose, single binary, zero lock-in |
| 8 | **Block editor из коробки** | Slate/Lexical: DIY | Notion-like UX по умолчанию |
| 9 | **Export built-in** | Tiptap: платный Cloud | PDF (typst), DOCX (docx-rs) в MIT |
| 10 | **Цена** | Tiptap: $49+ за 500 docs | $29 за 1000 docs, self-hosted = $0 |

---

## Рыночные тренды (2025-2030)

### 1. AI + Editor = Standard
- **42%** назвали "collaboration with AI" главной фичей на 5 лет
- Ghost text (inline autocomplete) становится table stakes
- Content AI (rewrite, expand, translate) — emerging differentiator
- **GoTipe position:** AI-first architecture, provider-agnostic, self-hosted option

### 2. Block Editors = New Default
- Notion установил стандарт UX для rich text
- Notion-like editors (BlockNote, Plate, Tiptap v3) растут быстрее классических
- Block paradigm лучше для структурированного контента
- **GoTipe position:** Block-first architecture, не ProseMirror node tree с block layer

### 3. Rust/WASM в Web
- Figma (C++/WASM), Google Sheets (WASM), Adobe (WASM) — тренд на performance-critical WASM
- Loro, Automerge, Diamond Types — CRDT в Rust
- typst, Dioxus, Leptos — Rust web ecosystem растёт
- **GoTipe position:** Первый RTE с Rust/WASM core

### 4. Local-First / Offline-First
- Figma, Linear, Notion — offline editing
- CRDTs enable true local-first architecture
- GDPR / data sovereignty → on-premise demand
- **GoTipe position:** CRDT native, offline by design, self-hosted

### 5. Open Source Sustainability
- Tiptap: $2.6M seed → VC pressure → pricing increases
- "VC захотят ROI — цены будут расти" (HN comment)
- HashiCorp, Redis, Terraform — license changes
- **GoTipe position:** MIT forever, revenue from Cloud services not features

### 6. Collaboration = Table Stakes
- **65%** считают real-time collaboration важным
- Collaboration больше не premium feature — ожидается по умолчанию
- Comments, presence, version history — базовый набор
- **GoTipe position:** Collaboration в MIT core, не Cloud-only addon

---

## Риски и Mitigation

| Риск | Вероятность | Impact | Mitigation |
|------|------------|--------|------------|
| **Tiptap open-sources всё** | Medium | High | GoTipe WASM core = structural advantage, не feature advantage |
| **Lexical улучшает collaboration** | Medium | Medium | Lexical привязан к React; GoTipe = multi-framework |
| **WASM binary size отпугивает** | Low | Medium | Lazy loading, JS fallback, tree-shaking |
| **Loro становится стандартом** | Medium | Positive | Можем переключиться на Loro dependency вместо custom CRDT |
| **Разработчики не хотят новый framework** | High | High | Yjs compatibility adapter, Tiptap migration guide, killer features |
| **Недостаточно контрибьюторов** | Medium | Medium | Good DX, Rust attracts quality contributors, well-documented |
| **Cloud не генерирует revenue** | Medium | High | Freemium → upsell, enterprise sales, partnership with hosting providers |

---

## Go-to-Market Strategy

### Launch: Developer Awareness
1. **HN / Reddit launch post:** "GoTipe: Rust-powered editor framework, MIT alternative to Tiptap"
2. **Show HN:** Playground demo with live collaboration
3. **Comparison blog posts:** "GoTipe vs Tiptap: benchmarks", "Why Rust for RTE"
4. **Discord community:** Early adopters, feedback, contributions

### Post-Launch: Ecosystem Growth
1. **Extension marketplace:** Community extensions, templates
2. **Framework-specific content:** "GoTipe + Next.js", "GoTipe + Nuxt", "GoTipe + SvelteKit"
3. **Integration guides:** Supabase, Firebase, Vercel, Railway
4. **Conference talks:** React Conf, VueConf, RustConf

### Scale: Enterprise
1. **Case studies:** Early adopter success stories
2. **Enterprise sales:** SOC 2, on-premise, SLA
3. **Partnerships:** Hosting providers, AI providers, CMS platforms
4. **Analyst coverage:** Gartner, G2, StackOverflow survey

---

## Связанные документы

- [00-overview.md](00-overview.md) — product positioning, market context
- [01-architecture.md](01-architecture.md) — technical architecture decisions
- [10-cloud.md](10-cloud.md) — pricing, cloud features
- [12-release-plan.md](12-release-plan.md) — план реализации и релиза
