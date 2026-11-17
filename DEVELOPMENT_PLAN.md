# GoTipe — Full Development Plan

## Context

GoTipe is a Rust/WASM rich text editor framework with Notion-like UX. The project has 20 complete design documents (docs/00-19) with detailed specifications, but **not a single line of source code**. The whole project has to be implemented from scratch: 8 Rust crates, 19 TypeScript packages, a Go Cloud server, infrastructure and CI/CD. All of it is full production-ready code, not MVP stubs.

---

## Implementation progress

> Mark `[x]` as each item is completed.

### Phase 1: Foundation — Rust Workspace + Root Config ✅
- [x] 1.1 Root-level configuration (`Cargo.toml`, `package.json`, `turbo.json`, `tsconfig.base.json`, `.rustfmt.toml`, `biome.json`, `.gitignore`, `pnpm-workspace.yaml`, `LICENSE-MIT`, `LICENSE-COMMERCIAL`)
- [x] 1.2 `crates/gotipe-schema/` — Schema DSL (NodeSpec, MarkSpec, AttrSpec, ContentRule, MarksRule, AttrType, AttrValue, validate, defaults)
- [x] 1.3 `crates/gotipe-core/` — Document model (Block, Document, TextSpan, Selection), EditorState, Transaction, Step (11 variants), Commands (~25), Extension trait (Plugin trait with decorations(), when-conditions: inTable/inCodeBlock/inList, extension storage persistence), clipboard (paste HTML/MD/plain)
- [x] 1.4 `crates/gotipe-crdt/` — CRDT engine (CrdtDocument, RichTextCrdt, MovableTreeCrdt, LwwMap, SyncProtocol, AwarenessProtocol, CrdtHistory, VersionVector)
- [x] 1.5 `crates/gotipe-comments/` — Comment CRDT (Comment, CommentThread, CommentAnchor, CommentMark, Reaction, CrdtMap integration), Suggestions/Track Changes (Suggestion, SuggestionMark, SuggestionType: Insert/Delete/Replace/Format/BlockChange, SuggestionStatus)
- [x] 1.6 `crates/gotipe-versioning/` — Version history (Version, VersionType: AutoSave/Named/Milestone/RestorePoint, IncrementalSnapshot, VersionDiff, state vector-based diff, zstd compressed deltas, full snapshot every 50 versions)
- [x] 1.7 `crates/gotipe-ai/` — AI context builder (AiProvider trait with fallback chain OpenAI→Anthropic→Gemini, ContextBuilder with token budget truncation, SuggestionState with request cancellation/AbortController, AiCommand, mode-specific defaults: temperature inline=0.1/command=0.3, streaming timeout 30s, PII detection: email/phone/credit card regex)
- [x] 1.8 `crates/gotipe-export/` — Document conversion (HTML, Markdown, JSON, Plaintext; feature-gated: PDF ~400KB, DOCX ~60KB, Notion ~15KB). ExportOptions (inline_styles, csp_nonce, base_url, highlight_code), ImportOptions (strict, sanitize, max_blocks, allowed_tags), ConvertError enum, ConverterRegistry (register_exporter/register_importer), NotionImporter (ZIP→MD→blocks), GoogleDocsImporter (HTML cleanup). HTML sanitizer with allowlist/blocklist (HtmlSanitizer::strict())
- [x] 1.9 `crates/gotipe-wasm/` — WASM bindings (WasmEditor, serde-wasm-bindgen, JS callbacks, comments/suggestions/versioning WASM exports)
- [x] 1.10 Phase 1 verification — `cargo test --workspace && cargo clippy -- -D warnings && cargo fmt --check && cargo test -p gotipe-crdt -- --ignored` (property tests)

### Phase 2: TypeScript Packages ✅
- [x] 2.1 `packages/wasm/` — WASM pkg wrapper (@gotipe/wasm)
- [x] 2.2 `packages/core/` — JS Editor API (~15KB gzip): createEditor, GoTipeEditor, ChainableCommands, extensions (18 node + 9 mark + behaviors), presets, virtual-renderer (threshold >500 blocks), Vanilla JS API (mount(element), setContent, getJSON/HTML/Markdown/Text, destroy), SSR API (renderToHtml, renderToMarkdown, renderToText), clipboard handler (paste HTML/MD/plain → Document, markdown paste auto-detection), a11y layer (BlockA11yConfig, FocusManager, A11yAnnouncer, EditorFocusController, WCAG 2.1 AA), Plugin system (decorations layer, extension storage persistence via localStorage/IndexedDB, when-conditions), security/sanitizer.ts (DOMPurify fallback), WASM graceful degradation (JS fallback when WASM unavailable), browser compat (Chrome 90+, Firefox 90+, Safari 15+, polyfills: ResizeObserver, structuredClone, Clipboard API)
- [x] 2.3 `packages/react/` — React adapter (~8KB): useEditor, useEditorState, EditorContent, BubbleMenu, FloatingMenu, BlockRenderer, TextRenderer, context, SSR support (Next.js)
- [x] 2.4 `packages/vue/` — Vue 3 adapter (~7KB): useEditor composable, EditorContent.vue, BubbleMenu.vue, FloatingMenu.vue, SSR support (Nuxt)
- [x] 2.5 `packages/svelte/` — Svelte 5 adapter (~6KB): createEditorState ($state/$derived), Editor.svelte, BubbleMenu.svelte, FloatingMenu.svelte, SSR support (SvelteKit)
- [x] 2.6 `packages/solid/` — Solid adapter (~5KB): createEditorSignal, Editor, BubbleMenu, FloatingMenu, SSR support (Solid Start)
- [x] 2.7 `packages/collaboration/` — CRDT sync client (~10KB): GoTipeProvider, WebRTCProvider, BroadcastProvider, IndexedDBProvider
- [x] 2.8 `packages/comments/` — Comment API (~6KB): CommentsExtension, CommentPlugin (addComment, addBlockComment, addDocumentComment, replyToComment, resolveComment, reopenComment, deleteComment, getComments, addReaction, removeReaction), CommentFilter, events (commentAdded/Resolved/Deleted/Updated)
- [x] 2.9 `packages/suggestions/` — Track Changes (~5KB): SuggestionsExtension, SuggestionsPlugin (setSuggestionMode, acceptSuggestion, rejectSuggestion, acceptAll, rejectAll, getSuggestions), diff rendering CSS
- [x] 2.10 `packages/versions/` — Version History UI (~5KB): VersionsExtension, VersionsPlugin (createVersion, listVersions, restoreVersion, compareVersions), VersionTimeline, DiffViewer
- [x] 2.11 `packages/ai/` — AI integration (~5KB): AIInline extension (GhostText dismiss on any keystroke, Tab accept, Escape dismiss), OpenAI/Anthropic/Gemini/Ollama providers, provider fallback chain, AbortController for stale request cancellation, streaming timeout (30s), mode-specific defaults (temperature inline=0.1/command=0.3)
- [x] 2.12 `packages/export/` — JS export API (~3KB): exportHtml/Markdown/Json/Plaintext (client + SSR via Node.js WASM), lazy PDF (~400KB)/DOCX (~60KB), importFromNotion (ZIP→blocks), importFromGoogleDocs (HTML cleanup), ExportOptions/ImportOptions types
- [x] 2.13 `packages/i18n/` — Internationalization (~4KB): LocaleEngine, ICU MessageFormat, pluralization, RTL/BiDi support, default locale = English, built-in locales (en, ru, de, fr, es, zh, ja, ko, ar), setLocale(), t() helper, translatable strings for all UI elements
- [x] 2.14 `packages/block-editor/` — Commercial Notion-like UI (~25KB): BlockEditor, SlashMenu (fuzzy search scoring, keyboard nav, grouped commands), BubbleMenu, BlockToolbar (drag handle + plus + "More" menu: duplicate, copy link, move to, turn into, delete), DragHandle (nested drop targets, keyboard Alt+Arrow), block views (ParagraphView, HeadingView, CodeBlockView with syntax highlighting + language selector + line numbers + copy, ImageView with resize handles + caption editor + upload progress, TableView with column resize + cell selection + merge/split cells + add/delete rows/cols, CalloutView, ToggleView (aria-expanded), ColumnsView, EmbedView with URL validation + preview + error states, FileView with upload progress + file type icons + download, DividerView, MathView with KaTeX preview + formula editor), document title (page title attribute), nested block indent guides, CollaborationCursors, CommentBubble, CommentSidebar, SuggestionHighlights
- [x] 2.15 `packages/theme/` — Design tokens (~12KB): CSS custom properties (--gt-*), light/dark themes (system preference detection), minimal/modern/notion/docs presets, defineTheme() API (token overrides + component overrides: slotBefore, bubbleMenu, slashMenu, blockHandle), defineIcons() API + SVG icon set (18x18, 1.5px stroke), animation tokens (duration: fast/normal/slow, easing curves: ease-out/ease-in/ease-spring), responsive breakpoints (sm=640/md=768/lg=1024/xl=1280), z-index scale (--gt-z-content=1, --gt-z-dropdown=10, --gt-z-sticky=20, --gt-z-overlay=30, --gt-z-modal=40, --gt-z-popover=50, --gt-z-toast=60, --gt-z-drag=100), collaboration cursor colors (--gt-cursor-1..8), AI tokens (--gt-ai-ghost/highlight/border), CSS architecture: base.css (MIT, structural) + theme.css (commercial, visual), print styles, reduced motion media query, mobile.css (<640px: toolbar→bottom sheet)
- [x] 2.16 `packages/block-editor-vue/` — Commercial Vue UI (~22KB)
- [x] 2.17 `packages/ai-ui/` — AI UI components (~8KB): GhostText, AiCommandPalette, AiToolbar
- [x] 2.18 `packages/sdk/` — GoTipe Cloud REST client SDK (~6KB): GoTipeClient, DocumentsAPI, VersionsAPI, CommentsAPI, ExportsAPI, AIApi, UsageAPI, OrganizationsAPI, WebhooksAPI, typed error handling
- [x] 2.19 `packages/migration/` — Migration utilities (~8KB): convertProseMirrorToGoTipe, convertSlateToGoTipe, convertLexicalToGoTipe, YjsAdapter (Hocuspocus compatibility layer), DualProvider (shadow mode — both CRDTs in parallel during migration), batch conversion scripts (PostgreSQL pagination, error handling, progress reporting)
- [x] 2.20 Phase 2 verification — `pnpm install && pnpm build && pnpm test && pnpm typecheck && pnpm lint`

### Phase 3: Go Cloud Server ✅
- [x] 3.1 `apps/cloud/` — REST API (Chi v5, JWT ES256, API keys, CRUD documents, exports, AI proxy with semantic cache (cosine >0.95) + provider fallback chain + rate limit retry-after, health checks)
- [x] 3.2 `apps/cloud/` — WebSocket Sync (gorilla/websocket, Room manager, binary CRDT protocol, persistence)
- [x] 3.3 `apps/cloud/` — Middleware (rate limiting Lua, idempotency Valkey, CORS, request ID, CSP headers)
- [x] 3.4 `apps/cloud/` — Background workers (cleanup, retry compensation, export, usage aggregation)
- [x] 3.5 `apps/cloud/` — Storage (PostgreSQL pgx, Valkey, R2/S3)
- [x] 3.6 `apps/cloud/` — Comments & Versions API: `POST/GET/DELETE /v1/documents/:id/comments`, `POST /v1/documents/:id/comments/:id/replies`, `POST /v1/documents/:id/comments/:id/resolve`, `GET/POST /v1/documents/:id/versions`, `POST /v1/documents/:id/versions/:id/restore`, `GET /v1/documents/:id/versions/diff`
- [x] 3.7 `apps/cloud/` — Organizations & Permissions: `internal/handler/organizations.go` (CRUD orgs, membership, roles), RBAC enforcement (Viewer/Commenter/Editor/Admin), `internal/handler/permissions.go`
- [x] 3.8 `apps/cloud/` — Stripe Billing: `internal/billing/stripe.go` (Stripe client), `internal/handler/billing.go` (create subscription, update, cancel, webhook handler — always return 200), `internal/handler/webhooks.go` (payment events, subscription lifecycle), usage-based billing aggregation, plan quota enforcement (starter=1K docs, pro=10K, business=100K), `internal/worker/billing.go` (daily/monthly usage aggregation)
- [x] 3.9 `apps/cloud/` — Audit logging: `internal/audit/logger.go` (structured audit events, write to PostgreSQL audit_log table)
- [x] 3.10 `apps/cloud/` — Migrations: `001_initial` (users, api_keys, documents, document_updates, document_snapshots, export_jobs, usage_logs), `002_comments_versions` (comments, comment_reactions, versions, version_diffs), `003_organizations` (organizations, org_members, document_permissions), `004_billing` (subscriptions, payment_methods, invoices, pending_webhooks), `005_audit` (audit_log)
- [x] 3.11 `apps/cloud/Dockerfile` — Multi-stage build (golang:1.23-alpine → alpine:3.20)
- [x] 3.12 Phase 3 verification — `go build ./cmd/...` (build passes, go vet passes)

### Phase 4: Infrastructure ✅
- [x] 4.1 `infra/docker-compose.yml` — Production (caddy, api, sync, export-worker, pgbouncer, postgres, valkey, prometheus, grafana)
- [x] 4.2 `infra/docker-compose.dev.yml` — Development (api, sync, postgres, valkey, minio)
- [x] 4.3 `infra/.env.example` + `infra/Caddyfile` (with CSP headers)
- [x] 4.4 `infra/postgres/postgresql.conf` + `infra/pgbouncer/pgbouncer.ini` + `infra/valkey/valkey.conf`
- [x] 4.5 `infra/prometheus.yml` + `infra/grafana/dashboards/` (gotipe-overview.json, gotipe-api.json, gotipe-sync.json, gotipe-ai.json)
- [x] 4.6 `infra/pgbackrest/pgbackrest.conf` — Backup config (R2 as repo, retention 14 days, PITR)
- [x] 4.7 `infra/scripts/` — setup-server.sh, deploy.sh (zero-downtime), restore.sh (DR), backup-cron, rate-limit.lua
- [x] 4.8 `scripts/` — build-wasm.sh, dev.sh

### Phase 5: CI/CD ✅
- [x] 5.1 `.github/workflows/ci.yml` — rust (fmt, clippy, test, property tests, bench compile) + wasm (build + artifact + size check ≤500KB gzip) + typescript (download wasm → install → lint → typecheck → build → test → bundle size check) + go (vet, test -race, build)
- [x] 5.2 `.github/workflows/release.yml` — npm publish (--provenance, dependency order) + GitHub Release + CHANGELOG.md generation. The cargo publish step was removed (D-71): crates are not published to crates.io, only npm is released
- [x] 5.3 `.github/workflows/deploy-cloud.yml` — test with services → Docker build+push GHCR → SSH deploy (Hetzner VDS)
- [x] 5.4 `.github/workflows/deploy-infra.yml` — push to main (paths: infra/**) → environment: production (requires approve) → ssh server "git pull && docker compose up -d"
- [x] 5.5 `.github/workflows/security.yml` — `cargo audit`, `cargo deny check`, `npm audit`, SBOM generation (CycloneDX), license compliance check
- [x] 5.6 `.github/workflows/e2e.yml` — Playwright (Chrome + Firefox + Safari), data-attr selectors (`[data-gotipe-*]`)
- [x] 5.7 `.github/workflows/benchmark.yml` — Criterion benchmark regression detection (fail on >10% regression), per-crate WASM size targets (core ~120KB, crdt ~80KB, export ~40KB, ai ~15KB), per-package gzip size tracking, size comparison on PRs. Performance targets: <1ms keystroke, <0.5ms CRDT op, >10K ops/sec, >50 clients/room
- [ ] 5.8 Vercel integration — connect `apps/landing/` as a Vercel project. Auto-deploy on push to main (paths: apps/landing/**, packages/**). Preview deployments on PRs. `turbo-ignore` skips the build if the landing page is not affected
- [ ] 5.9 Mintlify integration — connect `docs-site/` through the Mintlify GitHub App. Auto-deploy on push to main (paths: docs-site/**). OpenAPI spec from `apps/cloud/api/openapi.yaml`

**Deployment flow (like Publeto):**
```
git push to main
  │
  ├── apps/cloud/** → GitHub Actions (deploy-cloud.yml)
  │     1. go test → docker build → ghcr.io/gotipe/cloud-api:sha
  │     2. ssh server "bash infra/scripts/deploy.sh $SHA"
  │        → migrate up → zero-downtime deploy → health check
  │
  ├── apps/landing/** or packages/** → Vercel auto-deploy
  │     turbo-ignore skips the build if the app is not affected
  │     PR → preview deployment
  │
  ├── docs-site/** → Mintlify auto-deploy
  │
  ├── infra/** → GitHub Actions (deploy-infra.yml)
  │     environment: production (requires approval in the GitHub UI)
  │     ssh server "git pull && docker compose up -d"
  │
  ├── crates/** → GitHub Actions CI (rust + wasm jobs)
  │
  └── docs/** → Nothing (design docs, not deployed)
```

### Phase 6: Apps & Documentation ✅
- [x] 6.1 `apps/playground/` — Vite + React demo (basic, collaboration, comments, suggestions, version history, ai, custom extensions)
- [x] 6.2 `docs-site/` — Mintlify documentation site at docs.gotipe.com (Getting Started, API Reference from OpenAPI, Extensions Guide, React/Vue/Svelte/Solid, Collaboration, Comments & Track Changes, Version History, AI, Export, Self-Hosted, Cloud, i18n). Auto-deploy through the GitHub integration
- [x] 6.3 `docs-site/migration/` — Migration guides (from TipTap, ProseMirror, Lexical, Slate)
- [x] 6.4 `apps/cloud/api/openapi.yaml` — OpenAPI 3.1 spec for GoTipe Cloud REST API
- [x] 6.5 Root files: `SECURITY.md` (security disclosure policy), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`
- [x] 6.6 `@changesets/cli` setup — changeset workflow, automated CHANGELOG.md, versioning strategy
- [x] 6.7 `apps/landing/` — Marketing landing page (gotipe.com): Next.js + Tailwind, deployed on Vercel. Features, pricing, comparison table, getting started CTA

---

## Implementation order

Implementation follows the dependency graph strictly — each next layer depends on the previous ones.

### Phase 1: Foundation — Rust Workspace + Root Config

**1.1 Root-level configuration**

| File | Description |
|------|----------|
| `Cargo.toml` | Workspace root: resolver="2", members (8 crates), workspace.dependencies (serde, thiserror, uuid, chrono, wasm-bindgen, zstd, criterion, proptest), profile.release (opt-level="z", lto, codegen-units=1, strip) |
| `package.json` | Root: private=true, workspaces, scripts (dev, build, test, lint, typecheck, build:wasm, clean), devDeps (turbo, typescript, vitest, biome, tsup, @changesets/cli, playwright) |
| `pnpm-workspace.yaml` | packages: ['packages/*', 'apps/*'] |
| `turbo.json` | Tasks: build (dependsOn ^build, outputs dist/**), dev (cache false, persistent), test (dependsOn build), lint, typecheck, clean |
| `tsconfig.base.json` | Shared TS config: strict, ES2022, moduleResolution bundler, declaration, composite |
| `.rustfmt.toml` | edition="2021", max_width=100, tab_spaces=4 |
| `biome.json` | Linter rules, formatter (space indent, width 2, lineWidth 100), organizeImports |
| `.gitignore` | target/, node_modules/, dist/, pkg/, .env, *.wasm |
| `LICENSE-MIT` | MIT license for core packages |
| `LICENSE-COMMERCIAL` | Commercial license for block-editor packages |

**1.2 `crates/gotipe-schema/` — Schema DSL (the base of everything)**

Defines the types NodeSpec, MarkSpec, Schema, ContentRule, MarksRule, AttrSpec, AttrType, AttrValue. Document validation.

| File | Contents (full) |
|------|---------------------|
| `Cargo.toml` | name="gotipe-schema", deps: serde (+derive), serde_json, thiserror |
| `src/lib.rs` | Re-exports: mod node_spec, mark_spec, validate, defaults, attr. Pub use Schema, NodeSpec, MarkSpec, etc. |
| `src/attr.rs` | AttrValue enum (String, Number, Bool, Null), AttrSpec struct (attr_type, default, required), AttrType enum (String, Number, Bool, Enum(Vec<String>)) |
| `src/node_spec.rs` | NodeSpec struct: name, group, content (ContentRule), attrs, top_level, marks_allowed (MarksRule), leaf, allows_children, child_types. ContentRule enum: RichText, RawText, Empty. MarksRule enum: All, Only(Vec), None |
| `src/mark_spec.rs` | MarkSpec struct: name, exclusive_group, attrs, rank |
| `src/validate.rs` | Schema struct with HashMap<String, NodeSpec> + HashMap<String, MarkSpec>. Impl: validate(&Document) -> Result<(), Vec<ValidationError>>, validate_step(&Step, &Document) -> Result. ValidationError enum: UnknownBlockType, MissingAttribute, UnknownAttribute, InvalidContent, UnknownMark, MarkNotAllowed, ChildrenNotAllowed, InvalidChildType, BlockNotFound. Full validation implementation: 1) block type exists, 2) attrs valid, 3) content type matches, 4) marks allowed, 5) children valid |
| `src/defaults.rs` | Schema::default_block_editor() — 18 node types (paragraph, heading, bulletList, orderedList, listItem, codeBlock, image, blockquote, divider, callout, table, tableRow, tableCell, tableHeader, toggle, columns, column, embed, math, file) + 9 marks (bold, italic, underline, strikethrough, code, link, highlight, superscript, subscript) with full AttrSpec. Code in docs/03-editor-core.md |
| `src/tests.rs` | Unit tests: test_validate_valid_document, test_validate_unknown_block_type, test_validate_missing_required_attr, test_validate_marks_not_allowed, test_validate_children_not_allowed, test_default_schema_has_all_blocks |

**1.3 `crates/gotipe-core/` — Document Model, Transforms, Commands**

| File | Contents |
|------|-----------|
| `Cargo.toml` | deps: gotipe-schema (path), serde, serde_json, thiserror, uuid (v4) |
| `src/lib.rs` | Re-exports of all modules |
| `src/document.rs` | BlockId(String), Document {blocks, version}, Block {id, block_type, attrs, content, children}, BlockContent enum (RichText(Vec<TextSpan>), Empty, Raw(String)), TextSpan {text, marks}, Mark {mark_type, attrs}. Impl Document: from_json, to_json, find_block, find_block_mut, remove_block, flatten (iterator), parent_and_index. Impl Block: new (factory from schema), is_empty, text_length |
| `src/selection.rs` | Selection enum: Cursor {block_id, offset}, Text {block_id, from, to}, Block {block_id}, Multi {block_ids}. Impl: as_text, as_cursor, block_id, map_through(steps) |
| `src/state.rs` | EditorState {doc, selection, schema, plugins, last_steps}. Impl: new, apply(Transaction) -> Result<EditorState, TransformError> with the full pipeline: validate steps → apply to doc → map selection → run plugin hooks |
| `src/transaction.rs` | Transaction {steps, selection, metadata}. Step enum: InsertText, DeleteText, InsertBlock, DeleteBlock, MoveBlock, SetBlockAttrs, SetBlockType, AddMark, RemoveMark, SplitBlock, MergeBlocks — full apply() implementation for each variant. TransformError enum |
| `src/transform.rs` | Helper functions: insert_text_at, delete_text_range, add_mark_to_range, remove_mark_from_range, split_block_at, merge_blocks. Full implementation from docs/03 |
| `src/command.rs` | Command = fn(&EditorState) -> Option<Transaction>. The commands:: module with ~25 functions: toggle_bold/italic/underline/strikethrough/code/highlight, set_link, remove_link, set_block_type, insert_block_after/before, delete_block, move_block_up/down, duplicate_block, toggle_bullet_list/ordered_list/todo_list, indent, outdent, split_block, merge_with_previous, insert_hard_break, select_all, select_block, cut, copy, paste |
| `src/clipboard.rs` | Clipboard handling: parse_paste_html (HTML → Document with sanitization), parse_paste_markdown (MD → Document), parse_paste_plain (plain → paragraphs), serialize_copy (Selection → HTML + plain + internal JSON) |
| `src/extension.rs` | Extension trait: name, dependencies (circular dependency detection), nodes, marks, keybindings (conflict resolution: user-defined vs built-in priority), input_rules (execution order: markdown shortcuts first), paste_rules (MIME type matching for file uploads), on_create, on_update, on_destroy, plugin, slash_commands, default_config, accessibility (BlockA11yConfig), storage (persist extension state). InputRule (multiline matching for ``` detection), PasteRule, Keybinding (when-conditions: inTable, inCodeBlock, inList), SlashCommandDef structs. Plugin trait (decorations() method — render layer above/around blocks) |
| `src/error.rs` | GoTipeError with typed codes for pattern matching |
| `benches/transform.rs` | Criterion benchmarks: bench_insert_text, bench_parse_json (10K blocks), bench_validate (10K blocks), bench_apply_1000_inserts |
| `tests/` | Full unit tests for each Step variant, document operations, command execution, selection mapping |

**1.4 `crates/gotipe-crdt/` — CRDT Engine**

| File | Contents |
|------|-----------|
| `Cargo.toml` | deps: gotipe-core (path), serde, serde_json, thiserror, zstd, uuid |
| `src/lib.rs` | Re-exports |
| `src/doc.rs` | CrdtDocument: peer_id, tree (MovableTreeCrdt), texts (HashMap<BlockId, RichTextCrdt>), attrs (HashMap<BlockId, LwwMap>), comments (CrdtMap<CommentId, Comment>), suggestions (CrdtMap<SuggestionId, Suggestion>), version (VersionVector), history. Impl: new(peer_id, Document), apply_local(steps) -> Vec<CrdtOp>, apply_remote(bytes) -> Vec<Step>, encode_update_since, encode_snapshot. Full code from docs/02 |
| `src/text.rs` | RichTextCrdt: Fugue/RGA-based rich text CRDT. Operations: insert, delete with mark preservation. Convergence through unique operation IDs (lamport + peer_id) |
| `src/tree.rs` | MovableTreeCrdt: for block reordering/nesting. insert, move_node, delete with cycle detection. Conflict resolution: deterministic by peer_id |
| `src/sync.rs` | SyncProtocol: encode/decode binary frames. Message types 0x01-0x09. zstd compression for payloads >1KB. VarInt encoding. Full code from docs/02 |
| `src/awareness.rs` | AwarenessProtocol: AwarenessState {peer_id, user, cursor, selection, timestamp}, UserInfo, CursorPosition, SelectionRange. set_cursor, set_selection, apply_remote, cleanup stale peers (30s timeout) |
| `src/history.rs` | CrdtHistory: undo_stack, redo_stack, group_timeout_ms=500. record(ops), undo() -> (inverse_ops, selection), redo(). Operation grouping by time window |
| `src/version.rs` | VersionVector: HashMap<PeerId, u64>. tick, merge_remote, contains |
| `src/lww.rs` | LwwMap<K, V>: last-writer-wins register for block attributes. set, get, merge |
| `src/map.rs` | CrdtMap<K, V>: generic CRDT map for comments/suggestions. insert, update, delete, merge, iter |
| `src/ops.rs` | CrdtOp enum: Text(BlockId, TextOp), Tree(TreeOp), Attrs(BlockId, HashMap), Comment(CommentOp), Suggestion(SuggestionOp). encode/decode for the binary protocol |
| `tests/convergence.rs` | Property tests (proptest): concurrent operations converge to same state, no cycles in tree, marks consistent after merge, comments merge correctly |

**1.5 `crates/gotipe-comments/` — Comments & Suggestions**

| File | Contents |
|------|-----------|
| `Cargo.toml` | deps: gotipe-core (path), gotipe-crdt (path), serde, serde_json, thiserror, chrono, uuid |
| `src/lib.rs` | Re-exports: Comment, CommentThread, CommentAnchor, CommentMark, Suggestion, SuggestionMark |
| `src/comment.rs` | CommentId(String), CommentAnchor enum (Inline {block_id, from: CrdtPosition, to: CrdtPosition}, Block {block_id}, Document), Comment struct {id, anchor, author, content, created_at, updated_at, resolved_at, resolved_by, parent_id, reactions, metadata}, Reaction struct, CommentThread struct {root, replies, is_resolved} |
| `src/mark.rs` | CommentMarkExtension impl Extension: mark "comment" with attrs (commentId, resolved), excludes="", spanning=true, inclusive=false |
| `src/suggestion.rs` | SuggestionId(String), SuggestionType enum (Insert, Delete, Replace, Format {old_marks, new_marks}, BlockChange {old/new block_type, old/new attrs}), Suggestion struct {id, suggestion_type, author, created_at, anchor, comment_thread, status}, SuggestionStatus enum (Pending, Accepted, Rejected) |
| `src/suggestion_mark.rs` | SuggestionMarkExtension impl Extension: mark "suggestion" with attrs (suggestionId, type, authorId) |
| `src/ops.rs` | CommentOp, SuggestionOp — CRDT operations for comments/suggestions |
| `tests/` | Unit tests: comment CRDT merge, concurrent comments, suggestion accept/reject, overlapping comments |

**1.6 `crates/gotipe-versioning/` — Version History**

| File | Contents |
|------|-----------|
| `Cargo.toml` | deps: gotipe-core (path), gotipe-crdt (path), serde, serde_json, thiserror, chrono, zstd |
| `src/lib.rs` | Re-exports: Version, VersionType, IncrementalSnapshot, VersionDiff |
| `src/version.rs` | VersionId(String), Version struct {id, document_id, name, version_type, state_vector, created_by, created_at, description, metadata, snapshot_size}, VersionType enum (AutoSave, Named, Milestone {milestone_type}, RestorePoint {restored_from}) |
| `src/snapshot.rs` | IncrementalSnapshot struct {base_state_vector, ops, compressed_data}. encode_snapshot(), decode_snapshot(). Full snapshot every 50 versions |
| `src/diff.rs` | VersionDiff: compute diff between two state vectors, block-level changes (added, removed, modified), text-level diff (inserted, deleted spans), attribution (who changed what) |
| `src/manager.rs` | VersionManager: create_version, list_versions, restore_version, compare_versions, auto_save_interval(Duration) |
| `tests/` | Unit tests: version create/restore, incremental snapshot encoding, diff computation |

**1.7 `crates/gotipe-ai/` — AI Context Builder**

| File | Contents |
|------|-----------|
| `Cargo.toml` | deps: gotipe-core, serde, serde_json, thiserror, regex |
| `src/lib.rs` | Re-exports |
| `src/provider.rs` | AiProvider trait: complete(context, cursor) -> Stream<String>, command(context, command, prompt) -> Stream<String>. AiCommand enum: Rewrite, Expand, Summarize, Translate, FixGrammar, ChangeTone. Provider fallback chain: OpenAI → Anthropic → Gemini (on failure). Mode-specific defaults: temperature inline=0.1, command=0.3, maxTokens inline=128, command=2048 |
| `src/context.rs` | ContextBuilder: from EditorState, builds LLM context with blocks_before, blocks_after, selection, document_title. Token budget truncation algorithm (greedy block selection, chars/4 + padding estimation). Smart truncation to fit token limits |
| `src/suggestion.rs` | SuggestionState: ghost_text, position, status (pending/streaming/done/dismissed), request_id (for cancellation). GhostText {text, block_id, offset}. Auto-dismiss on any keystroke (not just Tab/Escape). AbortController for stale request cancellation |
| `src/commands.rs` | AI command definitions: input/output types for each AiCommand variant. Parameter interpolation ({language}, {tone} placeholders) |
| `src/streaming.rs` | StreamingConfig: timeout 30s max per request, retry-after header parsing, exponential backoff |
| `src/pii.rs` | PiiDetector: detect_email, detect_phone, detect_credit_card (regex-based), redact_pii, PiiType enum. Used by AI proxy to filter sensitive data before sending to LLM |

**1.8 `crates/gotipe-export/` — Document Conversion**

| File | Contents |
|------|-----------|
| `Cargo.toml` | deps: gotipe-core, serde, thiserror, ammonia. Features: html (default), markdown (default, comrak), plaintext (default), pdf (typst, ~400KB), docx (docx-rs, ~60KB), notion (~15KB). Default features = ["html", "markdown", "plaintext"] |
| `src/lib.rs` | Pub functions: to_html, to_markdown, to_json, to_plaintext. Feature-gated: to_pdf, to_docx. Trait ExportProvider, ImportProvider. ExportOptions struct (inline_styles, csp_nonce, base_url, css_classes, highlight_code, include_metadata), ImportOptions struct (strict, sanitize, allowed_tags, max_blocks, image_base_url). ConvertError enum (UnsupportedBlockType, UnsupportedMark, Encoding, FontNotFound, ImageError). ConverterRegistry (register_exporter/register_importer, export, import) |
| `src/html.rs` | to_html(&Document) -> Result<String>. Block→HTML mapping: paragraph→<p>, heading→<h1-h6>, bulletList→<ul>, etc. Mark→inline HTML: bold→<strong>, italic→<em>, link→<a>. from_html(html: &str, schema: &Schema) -> Result<Document> — parser with whitelist |
| `src/html/sanitizer.rs` | HtmlSanitizer struct: allowed_elements, allowed_attrs, allowed_css_props, allowed_uri_schemes. HtmlSanitizer::strict() with a full allowlist. sanitize(&str) -> Result<String>, validate_uri(&str) -> bool. Blocks javascript:, data: URIs |
| `src/markdown.rs` | to_markdown(&Document) -> String. Block→MD: heading→#, list→-, code→\`\`\`. from_markdown(md: &str, schema: &Schema) -> Result<Document> via comrak (CommonMark + GFM) |
| `src/json.rs` | to_json / from_json — direct serde serialization |
| `src/plaintext.rs` | to_plaintext(&Document) -> String — strip all marks, flatten blocks |
| `src/notion.rs` | #[cfg(feature = "notion")] NotionImporter: from_notion_zip(bytes) -> Result<Document> — ZIP → extract Markdown files → parse → GoTipe blocks. Handle Notion-specific markup (callouts, toggles, databases) |
| `src/gdocs.rs` | #[cfg(feature = "gdocs")] GoogleDocsImporter: from_google_docs_html(html) -> Result<Document> — clean Google-specific markup (spans with inline styles), map to GoTipe blocks |
| `src/pdf.rs` | #[cfg(feature = "pdf")] to_pdf(&Document, config: PdfConfig) -> Result<Vec<u8>> via typst. Font subsetting, layout, images |
| `src/docx.rs` | #[cfg(feature = "docx")] to_docx(&Document) -> Result<Vec<u8>> via docx-rs. Style mapping, colspan/rowspan |
| `tests/` | Roundtrip tests: doc→html→doc, doc→md→doc, doc→json→doc. Sanitization tests, XSS prevention tests |

**1.9 `crates/gotipe-wasm/` — WASM Bindings**

| File | Contents |
|------|-----------|
| `Cargo.toml` | crate-type=["cdylib", "rlib"]. deps: all 7 crates, wasm-bindgen, serde-wasm-bindgen, js-sys, web-sys (console). Profile release: opt-level="z", lto=true, codegen-units=1, strip=true |
| `src/lib.rs` | #[wasm_bindgen] struct WasmEditor. Impl: constructor (schema_json, doc_json), apply(transaction_json) -> String, validate(doc_json) -> bool, enable_collaboration(peer_id), receive_update(binary) -> String, get_update() -> Vec<u8>, export_html/markdown/json, sanitize_html(html) -> String, add_comment/resolve_comment/get_comments, set_suggestion_mode/accept_suggestion/reject_suggestion, create_version/list_versions/restore_version/compare_versions, detect_pii(text) -> PiiResult. Full code from docs/01 |
| `src/types.rs` | JsValue conversions: Block↔JsValue, TextSpan↔JsValue, Comment↔JsValue, Version↔JsValue via serde-wasm-bindgen |
| `src/callbacks.rs` | JS callback bridges for event handlers |

### Phase 2: TypeScript Packages

**2.1 `packages/wasm/` — WASM Wrapper**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/wasm, ESM only, exports: "./pkg/gotipe_wasm.js". sideEffects: false |
| `src/index.ts` | Re-export wasm-bindgen generated types + init function |
| `pkg/` | Generated by wasm-pack (build artifact, not committed) |

**2.2 `packages/core/` — JS Editor API (~15KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/core, peerDeps: @gotipe/wasm. Exports: ".", "./extensions", "./presets", "./a11y". Build: tsup ESM+CJS. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json, local overrides |
| `tsup.config.ts` | entry: src/index.ts, format: esm+cjs, dts, sourcemap, external: @gotipe/wasm, treeshake |
| `src/index.ts` | Exports: createEditor, GoTipeEditor, types, defineExtension |
| `src/editor.ts` | createEditor(options) factory. GoTipeEditor class: state access, dispatch(transaction), chain() for chainable commands, event emitter (on/off/emit), destroy(). WASM initialization, schema build from extensions, ViewState generation |
| `src/wasm-bridge.ts` | initGoTipe() — WASM load with graceful degradation (JS fallback when WASM unavailable for basic operations). WasmBridge class: wraps WasmEditor, handles init/apply/validate |
| `src/vanilla.ts` | Vanilla JS API: mount(element), setContent, getJSON, getHTML, getMarkdown, getText, chain() command builder, on() event subscription, destroy(). createBubbleMenu(element), createFloatingMenu(element) for framework-agnostic usage |
| `src/ssr.ts` | Server-side rendering API: renderToHtml(document, options), renderToMarkdown(document), renderToText(document) — for React RSC, Nuxt, SvelteKit, Solid Start. Node.js WASM integration |
| `src/polyfills.ts` | Browser compatibility: Chrome 90+, Firefox 90+, Safari 15+. Polyfills: ResizeObserver, structuredClone, Clipboard API fallbacks |
| `src/chain.ts` | ChainableCommands: toggleBold/Italic/Underline/Strikethrough/Code/Highlight, setLink, removeLink, setBlockType, insertBlockAfter/Before, deleteBlock, moveBlockUp/Down, duplicateBlock, toggleBulletList/OrderedList/TodoList, indent, outdent, splitBlock (Enter), mergeWithPrevious (Backspace), insertHardBreak, selectAll, selectBlock, undo, redo, insertText, insertTable, goToNextCell, goToPrevCell. run() → dispatch |
| `src/types/block.ts` | TS types: AttrValue, Mark, TextSpan, Block, BlockContent, Document |
| `src/types/state.ts` | EditorState, Transaction, Step, Selection types |
| `src/types/extension.ts` | ExtensionConfig interface (includes accessibility: BlockA11yConfig, storage: ExtensionStorage), defineExtension(), Extension interface with .configure(). NodeSpec, MarkSpec, Keybinding (when-conditions: inTable/inCodeBlock/inList, conflict resolution), InputRule (execution order, multiline matching), PasteRule (MIME type matching), SlashCommandDef, PluginFactory types, Plugin interface (decorations() method), ExtensionStorage interface (get/set/remove, localStorage/IndexedDB persistence) |
| `src/types/events.ts` | EditorEvents: update, selectionChange, focus, blur, create, destroy, commentAdded, commentResolved, commentDeleted, commentUpdated |
| `src/types/view.ts` | ViewState: blocks (BlockView[]), decorations, selection (SelectionView), toolbar state |
| `src/a11y/perceivable.ts` | BlockA11yConfig interface (role, label, description, landmark), defaultA11yConfigs for all 18 block types |
| `src/a11y/focus-manager.ts` | FocusManager class: register regions (skip-nav, toolbar, editor, slash-menu, bubble-menu, link-dialog, footer), focusRegion, restoreFocus, trapFocusIn |
| `src/a11y/announcer.ts` | A11yAnnouncer class: aria-live regions (polite/assertive), announce(message), logCollabEvent, screen reader support |
| `src/a11y/editor-focus.ts` | EditorFocusController: EditorFocusState, onFocus/onBlur, onBlockChange (announce block type), getBlockLabel |
| `src/security/sanitizer.ts` | sanitizeHtml: WASM primary + DOMPurify fallback. SANITIZER_CONFIG with allowlists |
| `src/clipboard/handler.ts` | ClipboardHandler: onPaste (HTML/MD/plain → parse → insertBlocks, markdown paste auto-detection: `*text*` → italic, `**text**` → bold), onCopy/onCut (selection → HTML + plain + internal JSON) |
| `src/extensions/paragraph.ts` | Paragraph extension |
| `src/extensions/heading.ts` | Heading extension with levels config, input rules (# → h1, ## → h2...), slash commands |
| `src/extensions/bullet-list.ts` | BulletList + ListItem extensions, input rules (- → list), Tab/Shift-Tab keybindings |
| `src/extensions/ordered-list.ts` | OrderedList extension |
| `src/extensions/code-block.ts` | CodeBlock extension with language config, input rules (\`\`\`lang) |
| `src/extensions/image.ts` | Image extension with upload handler, paste rules for images |
| `src/extensions/table.ts` | Table + TableRow + TableCell + TableHeader extensions, Tab navigation |
| `src/extensions/blockquote.ts` | Blockquote extension |
| `src/extensions/callout.ts` | Callout extension with emoji attr |
| `src/extensions/divider.ts` | Divider extension, input rule (---) |
| `src/extensions/toggle.ts` | Toggle extension with open/closed state |
| `src/extensions/columns.ts` | Columns + Column extensions |
| `src/extensions/embed.ts` | Embed extension (youtube, vimeo, etc) |
| `src/extensions/math.ts` | Math extension (LaTeX) |
| `src/extensions/file.ts` | File attachment extension |
| `src/extensions/marks.ts` | Bold, Italic, Underline, Strikethrough, InlineCode, Link, Highlight, Superscript, Subscript — all with keybindings + input rules |
| `src/extensions/behaviors.ts` | History (Mod-Z/Mod-Shift-Z), Placeholder, DragAndDrop, SlashCommands |
| `src/presets.ts` | MinimalPreset, DefaultPreset, FullPreset |
| `src/virtual-renderer.ts` | computeVisibleRange for documents >500 blocks (activation threshold): windowed rendering, scroll position preservation |
| `src/error.ts` | GoTipeError class with typed code for pattern matching |
| `vitest.config.ts` | Vitest config |
| `tests/` | Unit tests: editor creation, command execution, extension loading, ViewState generation, event handling, clipboard roundtrip, a11y announcements |

**2.3 `packages/react/` — React Adapter (~8KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/react, peerDeps: @gotipe/core + react >=18. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | Exports: useEditor, useEditorState, Editor, EditorContent, BubbleMenu, FloatingMenu |
| `src/use-editor.ts` | useEditor(options) hook: creates the editor, cleanup on unmount. Returns GoTipeEditor instance. SSR-safe (no WASM on server) |
| `src/use-editor-state.ts` | useEditorState(editor, selector) hook: useSyncExternalStore for reactive state access |
| `src/editor.tsx` | <Editor> component: renders EditorContent, passes editor via context |
| `src/editor-content.tsx` | <EditorContent> component: renders blocks from ViewState, handles DOM events → dispatch. ARIA: role="textbox" aria-multiline="true" aria-label="Document content" |
| `src/block-renderer.tsx` | BlockRenderer: renders single block by type, supports custom renderers via extension. ARIA roles per block type |
| `src/text-renderer.tsx` | TextRenderer: renders TextSpan[] with marks → HTML elements |
| `src/bubble-menu.tsx` | <BubbleMenu> — floating toolbar on text selection. role="toolbar", roving tabindex, Escape → restore focus |
| `src/floating-menu.tsx` | <FloatingMenu> — menu that appears on empty blocks |
| `src/context.ts` | EditorContext for React context |

**2.4 `packages/vue/` — Vue 3 Adapter (~7KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/vue, peerDeps: @gotipe/core + vue >=3.3. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | Exports: useEditor, EditorContent, BubbleMenu, FloatingMenu |
| `src/use-editor.ts` | useEditor composable: shallowRef + triggerRef for reactivity. SSR-safe |
| `src/EditorContent.vue` | Vue component: renders blocks, handles events, ARIA attributes |
| `src/BubbleMenu.vue` | BubbleMenu Vue component: role="toolbar", keyboard navigation |
| `src/FloatingMenu.vue` | FloatingMenu Vue component |

**2.5 `packages/svelte/` — Svelte 5 Adapter (~6KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/svelte, peerDeps: @gotipe/core + svelte >=5. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | Exports: createEditorState (Runes: $state, $derived), Editor.svelte, BubbleMenu.svelte, FloatingMenu.svelte |
| `src/editor.svelte` | Svelte 5 component. SSR-safe |
| `src/BubbleMenu.svelte` | BubbleMenu Svelte component |
| `src/FloatingMenu.svelte` | FloatingMenu Svelte component |

**2.6 `packages/solid/` — Solid Adapter (~5KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/solid, peerDeps: @gotipe/core + solid-js. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | Exports: createEditorSignal (createSignal), Editor, BubbleMenu, FloatingMenu |
| `src/Editor.tsx` | Editor Solid component. SSR-safe |
| `src/BubbleMenu.tsx` | BubbleMenu Solid component |
| `src/FloatingMenu.tsx` | FloatingMenu Solid component |

**2.7 `packages/collaboration/` — CRDT Sync Client (~10KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/collaboration, peerDeps: @gotipe/core. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | Exports: Collaboration extension, GoTipeProvider, WebRTCProvider, BroadcastProvider, IndexedDBProvider |
| `src/collaboration.ts` | Collaboration extension: defineExtension, wraps CRDT WASM, lifecycle hooks for sync |
| `src/provider.ts` | CollaborationProvider interface: connect, disconnect, sendUpdate, sendAwareness, onUpdate, onAwareness, onStatus, destroy |
| `src/gotipe-provider.ts` | GoTipeProvider: WebSocket connection, binary protocol, exponential backoff reconnect, offline queue (pendingUpdates), IndexedDB persistence for crash recovery. Full code from docs/02 |
| `src/webrtc-provider.ts` | WebRTCProvider: P2P sync via STUN/TURN |
| `src/broadcast-provider.ts` | BroadcastProvider: BroadcastChannel for sync between tabs |
| `src/indexeddb-provider.ts` | IndexedDBProvider: local persistence for offline |
| `src/awareness.ts` | Awareness API: useCollaborationAwareness hook, user presence, cursor positions |
| `src/types.ts` | AwarenessState, UserInfo, CursorPosition, ConnectionStatus types |

**2.8 `packages/comments/` — Comment System (~6KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/comments, peerDeps: @gotipe/core. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | Exports: CommentsExtension, CommentPlugin, CommentBubble, CommentSidebar, CommentThread, useComments, useCurrentComment |
| `src/extension.ts` | CommentsExtension: defineExtension, wraps gotipe-comments WASM, configure({getUser, showResolved}) |
| `src/plugin.ts` | CommentPlugin interface: addComment, addBlockComment, addDocumentComment, replyToComment, resolveComment, reopenComment, deleteComment, getComments, getBlockComments, addReaction, removeReaction, scrollToComment |
| `src/types.ts` | Comment, CommentThread, CommentAnchor, CommentFilter, Reaction TS types |
| `src/events.ts` | Comment events: commentAdded, commentResolved, commentDeleted, commentUpdated |
| `src/styles.css` | Comment highlight CSS: .gotipe-comment-highlight (active, resolved, hover, overlapping depth) |

**2.9 `packages/suggestions/` — Track Changes (~5KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/suggestions, peerDeps: @gotipe/core. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | Exports: SuggestionsExtension, SuggestionsPlugin, useSuggestions |
| `src/extension.ts` | SuggestionsExtension: defineExtension, wraps gotipe-comments/suggestion WASM |
| `src/plugin.ts` | SuggestionsPlugin: setSuggestionMode, acceptSuggestion, rejectSuggestion, acceptAllSuggestions, rejectAllSuggestions, getSuggestions(filter) |
| `src/types.ts` | Suggestion, SuggestionType, SuggestionStatus, SuggestionFilter TS types |
| `src/styles.css` | Diff rendering CSS: .gotipe-suggestion-insert (green underline), .gotipe-suggestion-delete (red strikethrough), .gotipe-suggestion-format (purple dotted border) |

**2.10 `packages/versions/` — Version History (~5KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/versions, peerDeps: @gotipe/core. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | Exports: VersionsExtension, VersionsPlugin, useVersions |
| `src/extension.ts` | VersionsExtension: defineExtension, wraps gotipe-versioning WASM, auto-save timer |
| `src/plugin.ts` | VersionsPlugin: createVersion(name, description), listVersions, restoreVersion(versionId), compareVersions(fromId, toId), setAutoSaveInterval(ms) |
| `src/types.ts` | Version, VersionType, VersionDiff, BlockDiff TS types |

**2.11 `packages/ai/` — AI Integration (~5KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/ai, peerDeps: @gotipe/core. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | Exports: AIInline extension, AiProvider interface, built-in providers |
| `src/ai-inline.ts` | AIInline extension: ghost text rendering, Tab to accept, Escape to dismiss, auto-dismiss on any keystroke. AbortController for stale request cancellation (requestId tracking) |
| `src/providers/openai.ts` | OpenAI provider: complete(), command() via SSE. Streaming timeout (30s) |
| `src/providers/anthropic.ts` | Anthropic provider |
| `src/providers/gemini.ts` | Google Gemini provider |
| `src/providers/ollama.ts` | Ollama provider (self-hosted, NDJSON) |
| `src/providers/fallback.ts` | Provider fallback chain: configure primary → secondary → tertiary. Auto-switch on error/timeout. Mode-specific defaults: temperature inline=0.1/command=0.3, maxTokens inline=128/command=2048 |
| `src/context-builder.ts` | TS wrapper for WASM ContextBuilder. Token budget estimation (chars/4 + padding) |

**2.12 `packages/export/` — JS Export API (~3KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/export, peerDeps: @gotipe/core. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | exportHtml, exportMarkdown, exportJson, exportPlaintext (client-side + SSR via Node.js WASM). exportPdf (~400KB lazy), exportDocx (~60KB lazy). importFromNotion (ZIP→blocks, ~15KB lazy), importFromGoogleDocs (HTML cleanup). ExportOptions, ImportOptions TS types. downloadDocument(format, filename) helper |

**2.13 `packages/i18n/` — Internationalization (~4KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/i18n, peerDeps: @gotipe/core. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | Exports: I18nExtension, LocaleEngine, setLocale, t, defineLocale, getLocale |
| `src/engine.ts` | LocaleEngine: ICU MessageFormat support, pluralization rules, setLocale(locale), t(key, params?) → string, getLocale() → string, onLocaleChange callback |
| `src/extension.ts` | I18nExtension: defineExtension, injects LocaleEngine into editor, provides translated labels for all UI elements |
| `src/locales/en.ts` | English locale (default): all UI strings — toolbar labels, slash menu items, error messages, a11y announcements, collaboration events |
| `src/locales/ru.ts` | Russian locale |
| `src/locales/de.ts` | German locale |
| `src/locales/fr.ts` | French locale |
| `src/locales/es.ts` | Spanish locale |
| `src/locales/zh.ts` | Chinese locale |
| `src/locales/ja.ts` | Japanese locale |
| `src/locales/ko.ts` | Korean locale |
| `src/locales/ar.ts` | Arabic locale (RTL) |
| `src/bidi.ts` | BiDi support: detect text direction, RTL layout adjustments, mixed LTR/RTL content handling |
| `src/types.ts` | LocaleMessages interface, LocaleConfig, SupportedLocale type |

**2.14 `packages/block-editor/` — Commercial Notion-like UI (~25KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/block-editor, peerDeps: @gotipe/react, @gotipe/theme. LICENSE: Commercial. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | Exports: BlockEditor, SlashMenu, BubbleMenu, BlockToolbar, DragHandle, CommentBubble, CommentSidebar, SuggestionHighlights |
| `src/editor.tsx` | <BlockEditor> main component: wraps @gotipe/react Editor with Notion-like UI |
| `src/license.ts` | JWT license verification (offline, ES256). Validates license key, shows watermark if invalid |
| `src/components/slash-menu.tsx` | SlashMenu: fuzzy search scoring algorithm (relevance ranking), keyboard navigation (Arrow keys, Enter, Escape), grouped commands (Basic, Media, Advanced, Embeds), scroll position preservation on filter. role="listbox", aria-activedescendant, focus trap, max width 320px |
| `src/components/bubble-menu.tsx` | BubbleMenu: bold/italic/underline/strikethrough/code/link toolbar on selection. role="toolbar", roving tabindex |
| `src/components/block-toolbar.tsx` | BlockToolbar: drag handle (⋮⋮) + plus (+) button + "More" menu (⋯): duplicate, copy link, move to, turn into (change block type), delete. role="toolbar" |
| `src/components/drag-handle.tsx` | DragHandle: drag-and-drop blocks with visual feedback, nested drop targets, nested block indent guides. Keyboard alternative: Alt+Arrow Up/Down |
| `src/components/document-title.tsx` | DocumentTitle: editable page title (document.title attribute), placeholder text, auto-focus on empty document |
| `src/components/block-views/` | Custom renderers for each block type: ParagraphView, HeadingView, CodeBlockView (syntax highlighting, language selector, line numbers, copy button), ImageView (resize handles, caption editor separate from src, upload progress, error states), TableView (column resize, cell selection, merge/split cells, toolbar for add/delete rows/cols), CalloutView, ToggleView (aria-expanded), ColumnsView, EmbedView (URL validation, preview loading, error states), FileView (upload progress, file type icons, download buttons), DividerView, MathView (KaTeX preview, formula editor) |
| `src/components/comments/` | CommentBubble (floating bubble on click), CommentSidebar (all threads, filter open/resolved), CommentThread (root + replies + reply input), CommentCard (avatar, name, time, content, reactions) |
| `src/components/suggestions/` | SuggestionHighlights: inline diff rendering, accept/reject buttons per suggestion |
| `src/components/collaboration/` | CollaborationCursors: colored cursors (--gt-cursor-1..8) + names, selection highlights |

**2.15 `packages/theme/` — Design Tokens (~12KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/theme. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | Exports: CSS import, theme presets, defineTheme, defineIcons |
| `src/tokens.css` | CSS custom properties (--gt-*): colors (light + dark, system preference detection via prefers-color-scheme), typography (--gt-text-xs..3xl, --gt-font-body/mono/heading), spacing (--gt-space-1..16), shadows, borders, z-index scale (--gt-z-content=1, --gt-z-dropdown=10, --gt-z-sticky=20, --gt-z-overlay=30, --gt-z-modal=40, --gt-z-popover=50, --gt-z-toast=60, --gt-z-drag=100), collaboration cursors (--gt-cursor-1..8), AI tokens (--gt-ai-ghost, --gt-ai-highlight, --gt-ai-border), animation duration (--gt-duration-fast=100ms, --gt-duration-normal=150ms, --gt-duration-slow=200ms), easing curves (--gt-ease-out, --gt-ease-in, --gt-ease-spring), responsive breakpoints (--gt-breakpoint-sm=640px, md=768px, lg=1024px, xl=1280px), semantic colors (--gt-bg, --gt-text, --gt-border, --gt-accent, --gt-success/warning/error/info). Full specification from docs/18-design-system.md |
| `src/themes/minimal.css` | Minimal theme |
| `src/themes/modern.css` | Modern theme |
| `src/themes/notion.css` | Notion-like theme |
| `src/themes/docs.css` | Google Docs-like theme |
| `src/base.css` | MIT structural styles: editor layout, block structure, selection highlighting. Separates MIT (structural) from commercial (visual) |
| `src/define-theme.ts` | defineTheme() API for custom themes: token overrides, component-level overrides (slotBefore, bubbleMenu, slashMenu, blockHandle), headless mode (theme: false) |
| `src/icons.ts` | defineIcons() API + default SVG icon set (18x18, 1.5px stroke). Icon categories: formatting, blocks, lists, insert, actions, alignment, AI, collaboration |
| `src/print.css` | Print styles: hide UI elements, URL display for links, page break rules |
| `src/reduced-motion.css` | @media (prefers-reduced-motion: reduce) — disable all animations |
| `src/mobile.css` | Mobile adaptations (<640px): toolbar → bottom sheet, full-width slash menu |

**2.19 `packages/migration/` — Migration Utilities (~8KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/migration, peerDeps: @gotipe/core. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | Exports: convertProseMirrorToGoTipe, convertSlateToGoTipe, convertLexicalToGoTipe, YjsAdapter, DualProvider, batchConvert |
| `src/prosemirror.ts` | convertProseMirrorToGoTipe(pmDoc): ProseMirror JSON → GoTipe Document. Node mapping (paragraph, heading, bulletList, etc.), mark mapping, nested list handling |
| `src/slate.ts` | convertSlateToGoTipe(slateDoc): Slate document JSON → GoTipe Document. Element mapping, leaf/text normalization |
| `src/lexical.ts` | convertLexicalToGoTipe(lexicalState): Lexical editor state → GoTipe Document. Node type mapping, decorator handling |
| `src/yjs-adapter.ts` | YjsAdapter: compatibility layer for Hocuspocus. Wraps GoTipe CRDT as Yjs-compatible provider. Allows gradual migration from Tiptap/Yjs without data loss |
| `src/dual-provider.ts` | DualProvider: shadow mode — both CRDTs (Yjs + GoTipe) run in parallel. Compare outputs for verification. Migration confidence scoring |
| `src/batch.ts` | batchConvert(options): PostgreSQL pagination (cursor-based), error handling with skip/retry, progress callback, dry-run mode, conversion report (success/fail/skip counts) |
| `src/types.ts` | MigrationOptions, ConversionResult, MigrationReport, ProgressCallback types |

**2.16 `packages/block-editor-vue/` — Commercial Vue UI (~22KB gzip)**

The Vue 3 counterpart of block-editor. The same components: BlockEditor, SlashMenu, BubbleMenu, BlockToolbar, DragHandle, CommentBubble, CommentSidebar, SuggestionHighlights — as Vue components.

**2.17 `packages/ai-ui/` — AI UI Components (~8KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/ai-ui, peerDeps: @gotipe/react, @gotipe/ai. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | GhostText component, AiCommandPalette, AiToolbar |
| `src/ghost-text.tsx` | Renders inline ghost text suggestion, Tab to accept, opacity fade transition (--gt-ai-ghost) |
| `src/command-palette.tsx` | AI command palette: rewrite, expand, summarize, translate, fix grammar, change tone |

**2.18 `packages/sdk/` — GoTipe Cloud REST Client SDK (~6KB gzip)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/sdk. "types" FIRST in exports |
| `tsconfig.json` | Extends tsconfig.base.json |
| `src/index.ts` | Exports: GoTipeClient, all API modules, types |
| `src/client.ts` | GoTipeClient class: constructor({apiKey, baseUrl}), configurable fetch, error handling, typed responses |
| `src/documents.ts` | DocumentsAPI: create, get, list, update, delete documents |
| `src/comments.ts` | CommentsAPI: create, list, reply, resolve, delete comments |
| `src/versions.ts` | VersionsAPI: create, list, restore, compare versions |
| `src/exports.ts` | ExportsAPI: create export job, get export status, download |
| `src/ai.ts` | AIAPI: complete, command — SSE streaming support |
| `src/organizations.ts` | OrganizationsAPI: create, list, update org, manage members, roles |
| `src/usage.ts` | UsageAPI: get usage stats, billing summary |
| `src/webhooks.ts` | WebhooksAPI: create, list, update, delete webhook endpoints |
| `src/types.ts` | All API types: Document, Comment, Version, ExportJob, Organization, Usage, Webhook, APIError |
| `src/error.ts` | GoTipeAPIError: typed error codes, message, details |

### Phase 3: Go Cloud Server

**3.1-3.11 `apps/cloud/` — REST API + WebSocket Sync + Billing + Comments/Versions**

| File | Contents |
|------|-----------|
| `go.mod` | module github.com/gotipe/cloud, go 1.23. Deps: gorilla/websocket, jackc/pgx/v5, valkey-io/valkey-go, aws-sdk-go-v2, golang-jwt/jwt/v5, prometheus/client_golang, stripe/stripe-go/v81 |
| `cmd/api/main.go` | REST API entrypoint: setup logger, connect DB/Valkey/R2/Stripe, register routes (Chi v5), middleware chain (auth → rate limit → idempotency), graceful shutdown (6 phases). Health/Readyz endpoints. Full code from docs/10 |
| `cmd/sync/main.go` | WebSocket sync server entrypoint |
| `internal/auth/jwt.go` | JWT ES256 generation and validation. Claims: sub, iss, aud, iat, exp, scopes, document_ids, plan |
| `internal/auth/apikey.go` | API key validation: SHA-256 hash lookup in DB. Format: gt_live_sk_<32hex> |
| `internal/auth/middleware.go` | AuthMiddleware: Bearer token → API key path or JWT path. Context injection: user_id, plan, scopes, org_id |
| `internal/handler/documents.go` | CRUD: CreateDocument (plan limit check → R2 upload → DB insert → log usage), GetDocument, ListDocuments (pagination, sort), DeleteDocument |
| `internal/handler/comments.go` | Comment endpoints: POST /v1/documents/:id/comments, GET /v1/documents/:id/comments, POST /v1/documents/:id/comments/:commentId/replies, POST /v1/documents/:id/comments/:commentId/resolve, DELETE /v1/documents/:id/comments/:commentId |
| `internal/handler/versions.go` | Version endpoints: GET /v1/documents/:id/versions, POST /v1/documents/:id/versions (create named version), POST /v1/documents/:id/versions/:versionId/restore, GET /v1/documents/:id/versions/diff?from=&to= |
| `internal/handler/organizations.go` | Org endpoints: POST/GET/PUT/DELETE /v1/organizations, POST/DELETE /v1/organizations/:id/members, PUT /v1/organizations/:id/members/:userId/role |
| `internal/handler/permissions.go` | RBAC: check_permission(user, document, action), roles: Viewer, Commenter, Editor, Admin |
| `internal/handler/users.go` | GetCurrentUser with usage stats |
| `internal/handler/apikeys.go` | CreateAPIKey (generate, hash, store), ListAPIKeys, DeleteAPIKey |
| `internal/handler/exports.go` | CreateExport (queue to DB), GetExport (status check → R2 redirect) |
| `internal/handler/ai.go` | AIComplete: route to provider, SSE streaming relay, response cache, cost tracking, PII filtering |
| `internal/handler/auth.go` | CreateToken: generate JWT for client-side use |
| `internal/handler/health.go` | Healthz (liveness), Readyz (full dependency check: postgres + valkey + R2) |
| `internal/handler/metrics.go` | Prometheus metrics endpoint |
| `internal/handler/billing.go` | Billing: create_subscription, update_subscription, cancel_subscription, get_usage, get_invoices |
| `internal/handler/webhooks.go` | Stripe webhook handler: payment_intent.succeeded, customer.subscription.updated/deleted, invoice.payment_failed. ALWAYS return 200. Retry via pending_webhooks table |
| `internal/billing/stripe.go` | Stripe client wrapper: create_customer, create_subscription, update_subscription, cancel_subscription, create_checkout_session. NOT inside DB transactions |
| `internal/billing/plans.go` | Plan definitions: starter (1K docs, 100 AI req/day), pro (10K docs, 1000 AI req/day), business (100K docs, unlimited AI), enterprise (custom). Quota enforcement |
| `internal/sync/server.go` | SyncServer: rooms map, WebSocket upgrader. HandleWebSocket: auth → get/create room → send state → read/write pump. Full code from docs/02 |
| `internal/sync/room.go` | Room: clients, crdtState, awareness, mutex. addClient, removeClient, broadcast, scheduleSave (debounce 2s) |
| `internal/sync/persistence.go` | PersistenceStore interface: LoadDocument, SaveDocument, SaveUpdate, GetHistory, GetVersion |
| `internal/storage/postgres.go` | PostgreSQL storage: pgx pool, query helpers, transaction support |
| `internal/storage/r2.go` | R2Client: Put, Get, Delete, HeadBucket. S3-compatible via aws-sdk-go-v2 |
| `internal/storage/valkey.go` | Valkey client: session cache, rate limit state, AI cache, JWT blocklist (DB 1, noeviction, AOF) |
| `internal/middleware/ratelimit.go` | RateLimiter: sliding window via Lua script (ZRANGEBYSCORE). AllowLua with graceful degradation |
| `internal/middleware/idempotency.go` | IdempotencyMiddleware: Valkey cache (24h TTL), capture response, return cached. Full code from docs/10 |
| `internal/middleware/cors.go` | CORS middleware |
| `internal/middleware/csp.go` | CSP headers middleware: script-src 'self' 'wasm-unsafe-eval', connect-src wss://, frame-src 'none' |
| `internal/middleware/requestid.go` | Request ID propagation (X-Request-ID header) |
| `internal/worker/cleanup.go` | CleanupWorker: hourly — clean orphan exports (7d), compact document updates (>200 → snapshot), clean expired tokens, aggregate usage |
| `internal/worker/retry.go` | RetryWorker: 30s — retry pending webhooks/notifications with exponential backoff (10s, 60s, 300s, 1800s, 10800s) |
| `internal/worker/export.go` | ExportWorker: poll pending export_jobs, run Rust export binary, upload to R2, update status |
| `internal/worker/billing.go` | BillingWorker: daily — aggregate usage per customer, monthly — generate billing summary, track token usage for AI |
| `internal/audit/logger.go` | AuditLogger: log(user_id, action, resource, details). Write to audit_log table. Actions: document.create, document.delete, comment.add, version.restore, permission.change, billing.subscribe |
| `internal/ai/proxy.go` | AI proxy: route requests to provider with fallback chain (OpenAI → Anthropic → Gemini on failure), SSE streaming, streaming timeout (30s max), rate limit per key/user/provider, retry-after header parsing, PII detection before send |
| `internal/ai/cache.go` | Semantic cache: cosine similarity threshold >0.95 for cache hit, Valkey storage, TTL 1h, cache invalidation on document changes |
| `internal/ai/providers.go` | OpenAI, Anthropic, Gemini provider implementations. Mode-specific defaults: temperature, maxTokens |
| `internal/apierror/codes.go` | APIError struct + predefined errors: INVALID_JSON, VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, QUOTA_EXCEEDED, RATE_LIMITED, INTERNAL_ERROR |
| `internal/logger/setup.go` | slog setup: JSON (prod) / text (dev), log levels |
| `migrations/001_initial.up.sql` | CREATE TABLE: users (with stripe_customer_id, oauth_provider/id), api_keys, documents (with collaborators JSONB), document_updates, document_snapshots, export_jobs, usage_logs (partition by range). All indexes. Full schema from docs/10 |
| `migrations/001_initial.down.sql` | DROP TABLE in reverse order |
| `migrations/002_comments_versions.up.sql` | CREATE TABLE: comments (id, document_id, anchor_type, anchor_data JSONB, author_id, content, parent_id, resolved_at, resolved_by, created_at, updated_at), comment_reactions (comment_id, user_id, emoji, created_at), versions (id, document_id, name, version_type, state_vector BYTEA, created_by, created_at, description, r2_key, snapshot_size), version_diffs (from_version, to_version, diff_summary JSONB) |
| `migrations/002_comments_versions.down.sql` | DROP TABLE |
| `migrations/003_organizations.up.sql` | CREATE TABLE: organizations (id, name, owner_id, plan, stripe_customer_id, created_at), org_members (org_id, user_id, role, joined_at), document_permissions (document_id, user_id, role, granted_by, granted_at). Role enum: viewer, commenter, editor, admin |
| `migrations/003_organizations.down.sql` | DROP TABLE |
| `migrations/004_billing.up.sql` | CREATE TABLE: subscriptions (id, user_id/org_id, stripe_subscription_id, plan, status, current_period_start/end, created_at), pending_webhooks (id, event_type, payload JSONB, attempts, next_retry_at, created_at) |
| `migrations/004_billing.down.sql` | DROP TABLE |
| `migrations/005_audit.up.sql` | CREATE TABLE: audit_log (id BIGSERIAL, user_id, action, resource_type, resource_id, details JSONB, ip_address, created_at). Index on (user_id, created_at), (resource_type, resource_id) |
| `migrations/005_audit.down.sql` | DROP TABLE |
| `Dockerfile` | Multi-stage: golang:1.23-alpine builder → alpine:3.20 runner. CGO_ENABLED=0, ldflags="-s -w". Healthcheck |

### Phase 4: Infrastructure

| File | Contents |
|------|-----------|
| `infra/docker-compose.yml` | Production: caddy, api, sync, export-worker, pgbouncer, postgres, valkey, prometheus (profile), grafana (profile). Full specification from docs/10 |
| `infra/docker-compose.dev.yml` | Development: api, sync, postgres, valkey, minio, minio-init. Full specification from docs/10 |
| `infra/.env.example` | All env vars: server, postgres, valkey, R2, auth, AI, export, rate limiting, monitoring, Stripe keys. From docs/10 |
| `infra/Caddyfile` | api.gotipe.com → api:8080, sync.gotipe.com → sync:8081. CSP headers |
| `infra/postgres/postgresql.conf` | Tuned: shared_buffers=2GB, work_mem=64MB, effective_cache_size=6GB, max_connections=200 |
| `infra/pgbouncer/pgbouncer.ini` | Transaction mode, max_client_conn=200, default_pool_size=20, min_pool_size=5 |
| `infra/valkey/valkey.conf` | maxmemory 1gb, maxmemory-policy allkeys-lru. DB 1: noeviction (JWT blocklist). AOF enabled |
| `infra/pgbackrest/pgbackrest.conf` | repo1-type=s3, repo1-s3-endpoint (R2), repo1-retention-full=14, archive-async, compress-type=zst |
| `infra/prometheus.yml` | Scrape configs: gotipe-api, gotipe-sync, postgres-exporter, valkey-exporter |
| `infra/grafana/dashboards/gotipe-overview.json` | Overview dashboard: total docs, active connections, API latency, error rate |
| `infra/grafana/dashboards/gotipe-api.json` | API dashboard: request rate by endpoint, latency percentiles, error breakdown |
| `infra/grafana/dashboards/gotipe-sync.json` | Sync dashboard: WebSocket connections, messages/sec, room count, CRDT merge latency |
| `infra/grafana/dashboards/gotipe-ai.json` | AI dashboard: requests by provider/model, token usage, cache hit rate, latency |
| `infra/scripts/setup-server.sh` | Full provisioning Hetzner VDS (Go Cloud only — landing on Vercel, docs on Mintlify): apt install docker, firewall, deploy user, SSH key, GitHub auth, clone repo, .env, docker compose up, backup cron. Full code from docs/10 |
| `infra/scripts/deploy.sh` | Zero-downtime Go Cloud deploy: pull → migrate (directly to Postgres, not via pgBouncer) → scale api=2 → health check → remove old → update sync/export. Full code from docs/10 |
| `infra/scripts/restore.sh` | DR: stop services → postgres up → pgbackrest restore (R2) → PITR optional → restart all. Full code from docs/10 |
| `infra/scripts/backup-cron` | Cron: daily incremental 03:00 UTC, weekly full Sunday 04:00 UTC |
| `infra/scripts/rate-limit.lua` | Sliding window Lua script for Valkey. Full code from docs/10 |
| `scripts/build-wasm.sh` | wasm-pack build → wasm-opt -Oz → size check (500KB budget). Full code from docs/11 |
| `scripts/dev.sh` | WASM rebuild if outdated → turbo dev → go sync server |

### Phase 5: CI/CD

| File | Contents |
|------|-----------|
| `.github/workflows/ci.yml` | Jobs: rust (fmt, clippy, test, property tests `--ignored`, bench compile), wasm (build + artifact + gzip size check ≤500KB), typescript (download wasm → install → lint → typecheck → build → test → per-package bundle size check), go (vet, test -race, build). Full specification from docs/11 |
| `.github/workflows/release.yml` | On tag v*: build wasm → build TS → npm publish --provenance (dependency order) → GitHub Release. CHANGELOG.md via changesets. Crates are not published to crates.io (D-71) |
| `.github/workflows/deploy-cloud.yml` | On push main (apps/cloud/**): test with services (postgres, valkey) → docker build+push GHCR → SSH deploy Hetzner VDS |
| `.github/workflows/deploy-infra.yml` | On push main (infra/**): environment: production (requires approve) → ssh server "git pull && docker compose up -d" |
| `.github/workflows/security.yml` | Weekly + on PR: `cargo audit`, `cargo deny check licenses`, `npm audit --audit-level=high`, SBOM generation (CycloneDX: `cargo cyclonedx` + `npx @cyclonedx/cyclonedx-npm`), license compliance check |
| `.github/workflows/e2e.yml` | On PR + main: Playwright tests (Chrome + Firefox + Safari), data-attr selectors (`[data-gotipe-*]`), screenshots on failure |
| `.github/workflows/benchmark.yml` | On PR: Criterion benchmark (compare vs main, fail on >10% regression), per-crate WASM size targets (core ~120KB, crdt ~80KB, export ~40KB, ai ~15KB, total ≤500KB gzip), per-package gzip size tracking (report in PR comment). Performance targets validation: <1ms keystroke processing, <0.5ms CRDT op generation, <0.1ms binary encoding, >10K ops/sec throughput, >50 concurrent clients/room, 1M ops before compaction threshold |
| **Vercel (auto-deploy)** | `apps/landing/` is connected as a Vercel project. Push to main → Vercel auto-deploy (turbo-ignore skips the build if the app is not affected). PR → Vercel preview deployment. Domain: gotipe.com |
| **Mintlify (auto-deploy)** | `docs-site/` is connected via the Mintlify GitHub App. Push to main (docs-site/**) → Mintlify auto-deploy. OpenAPI spec from apps/cloud/api/openapi.yaml. Domain: docs.gotipe.com |

### Phase 6: Apps & Documentation

**6.1 `apps/playground/` — Vite + React Demo**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/playground, deps: @gotipe/core, @gotipe/react, @gotipe/collaboration, @gotipe/comments, @gotipe/suggestions, @gotipe/versions, @gotipe/ai, @gotipe/i18n, @gotipe/theme, react 19. devDeps: vite, @vitejs/plugin-react |
| `vite.config.ts` | React plugin, WASM support |
| `index.html` | Entry HTML |
| `src/main.tsx` | React root render |
| `src/App.tsx` | Main app: editor demo with feature toggles |
| `src/examples/basic.tsx` | Minimal editor example |
| `src/examples/collaboration.tsx` | Real-time collab demo (2 editors, same document, colored cursors) |
| `src/examples/comments.tsx` | Comments demo: inline, block, document comments, threads, reactions |
| `src/examples/suggestions.tsx` | Track changes demo: suggestion mode, accept/reject |
| `src/examples/versions.tsx` | Version history demo: timeline, diff view, restore |
| `src/examples/ai.tsx` | AI features demo: ghost text, command palette |
| `src/examples/custom.tsx` | Custom extensions demo |
| `src/examples/i18n.tsx` | Internationalization demo: locale switcher, RTL |

**6.2 `docs-site/` — Mintlify Documentation Site (docs.gotipe.com)**

Hosted on Mintlify. The repo holds MDX content + the `mint.json` config. Auto-deploy via the GitHub integration. The API Reference is auto-generated from `apps/cloud/api/openapi.yaml`.

| File | Contents |
|------|-----------|
| `mint.json` | Mintlify config: name, logo, favicon, colors (--gt-accent), navigation sidebar, topbar links (GitHub, Playground), tabs (Guides, API Reference, SDKs), anchors, footerSocials, api.baseUrl, openapi path, analytics |
| `introduction.mdx` | Overview, quickstart snippet, feature highlights |
| `quickstart.mdx` | Getting Started: install, create editor, add extensions |
| `guides/` | Extensions, React, Vue, Svelte, Solid, Collaboration, Comments & Track Changes, Version History, AI, Export, i18n & Accessibility, Theming, Self-Hosted, Cloud, Security |
| `api-reference/` | Auto-generated from OpenAPI spec — documents, comments, versions, organizations, billing, exports, AI, auth |
| `migration/` | Migration guides: from-tiptap.mdx, from-prosemirror.mdx, from-lexical.mdx, from-slate.mdx |

**6.3 `apps/cloud/api/openapi.yaml` — OpenAPI Spec**

OpenAPI 3.1 spec covering all REST API endpoints: documents CRUD, comments, versions, organizations, billing, exports, AI, auth, health. Enables SDK code generation and Mintlify auto-generated API Reference.

**6.4 Root Files**

| File | Contents |
|------|-----------|
| `SECURITY.md` | Security disclosure policy: security@gotipe.com, response timeline (24h acknowledge, 72h assessment, 7d fix), scope, PGP key |
| `CONTRIBUTING.md` | Contribution guide: setup, development workflow, PR process, coding standards, testing requirements |
| `CODE_OF_CONDUCT.md` | Contributor Covenant Code of Conduct |
| `.changeset/config.json` | Changesets config: linked packages, commit format, changelog generation |

**6.7 `apps/landing/` — Marketing Landing Page (gotipe.com, Next.js → Vercel)**

| File | Contents |
|------|-----------|
| `package.json` | @gotipe/landing, deps: next, react, tailwindcss |
| `next.config.ts` | Next.js config, image optimization, redirects |
| `app/page.tsx` | Hero section (headline, demo embed, CTA), Features grid (Rust/WASM speed, Block-first, CRDT collaboration, AI-first, multi-framework, export), Comparison table (vs Tiptap, Lexical, Slate, CKEditor), Pricing section (MIT / Block Editor $149/yr / Cloud Starter $29/mo / Pro $79/mo / Business $199/mo), Getting Started code snippet, Footer |
| `app/pricing/page.tsx` | Detailed pricing with feature comparison matrix |
| `components/` | Hero.tsx, FeatureCard.tsx, ComparisonTable.tsx, PricingCard.tsx, CodeSnippet.tsx, Footer.tsx |
| `vercel.json` | Vercel deploy config (domain: gotipe.com) |

---

## Key files to modify

All files are created from scratch. No existing file is modified (except docs/ if corrections are needed).

## Existing utilities to reuse

There is no existing code — all the code in the design docs (docs/00-19) contains full reference implementations to use as a basis:

- **docs/01-architecture.md** → WasmEditor WASM bindings, Document model Rust types
- **docs/02-collaboration.md** → CrdtDocument, SyncProtocol, AwarenessProtocol, GoTipeProvider
- **docs/03-editor-core.md** → Schema, NodeSpec, MarkSpec, EditorState, Transaction, Step, Commands, benchmarks
- **docs/05-extensions.md** → Extension trait/interface, all built-in extensions (18 nodes + 9 marks + behaviors)
- **docs/10-cloud.md** → Go API server, middleware, handlers, Docker Compose, deploy scripts, backup/DR
- **docs/04-block-editor.md** → SlashMenu, BubbleMenu, BlockToolbar, DragHandle, block views, document title
- **docs/06-framework-adapters.md** → React/Vue/Svelte/Solid adapters, Vanilla JS API, SSR API, headless rendering
- **docs/07-ai.md** → AiProvider fallback, ContextBuilder token budget, streaming timeout, semantic cache, PII
- **docs/08-export-import.md** → ExportOptions/ImportOptions, ConverterRegistry, NotionImporter, GoogleDocsImporter
- **docs/11-monorepo.md** → Cargo.toml, package.json, turbo.json, CI/CD workflows, Dockerfile
- **docs/12-release-plan.md** → v1.0 deliverables, pricing, Definition of Done criteria
- **docs/13-competitive.md** → Comparison table, pricing positioning, differentiators
- **docs/14-security-privacy.md** → HTML sanitizer, CSP headers, PII detection, threat model
- **docs/15-accessibility-i18n.md** → A11y layer (ARIA, focus management, announcer, keyboard nav), i18n (locale engine, ICU, RTL/BiDi)
- **docs/16-comments-versioning.md** → Comments CRDT, CommentMark, SuggestionMark, Version history, diff, permissions (RBAC)
- **docs/17-migration-guide.md** → ProseMirror/Slate/Lexical converters, YjsAdapter, DualProvider, batch conversion
- **docs/18-design-system.md** → CSS tokens, z-index scale, animation system, responsive breakpoints, icon system, print styles, CSS architecture (base.css/theme.css), defineTheme/defineIcons API

## Verification

### After each phase:

1. **Phase 1 (Rust):** `cargo test --workspace && cargo clippy --workspace -- -D warnings && cargo fmt --check`
2. **Phase 1 (Property tests):** `cargo test -p gotipe-crdt -- --ignored` (proptest convergence, CRDT merge)
3. **Phase 1.9 (WASM):** `bash scripts/build-wasm.sh` → check size <500KB gzip
4. **Phase 2 (TS):** `pnpm install && pnpm build && pnpm test && pnpm typecheck && pnpm lint`
5. **Phase 3 (Go):** `cd apps/cloud && go test ./... -race && go build ./cmd/...`
6. **Phase 3 (Go integration):** `cd apps/cloud && go test -tags=integration ./...` (testcontainers: Postgres + Valkey)
7. **Phase 4 (Infra):** `docker compose -f infra/docker-compose.dev.yml up -d` → `curl localhost:8080/healthz`
8. **Phase 5 (CI):** Push to branch → GitHub Actions green (all workflows)
9. **Phase 5 (Vercel):** `apps/landing/` is connected to Vercel → the preview deployment on PRs works
10. **Phase 5 (Mintlify):** `docs-site/` is connected via the Mintlify GitHub App → docs.gotipe.com updates on push
11. **Phase 5 (Security):** `cargo audit && cargo deny check && npm audit --audit-level=high`
12. **Phase 6 (E2E):** `pnpm exec playwright test` → Chrome + Firefox + Safari green

### End-to-end:

1. Start dev infra: `docker compose -f infra/docker-compose.dev.yml up -d`
2. Build WASM: `pnpm build:wasm`
3. Build all TS: `pnpm build`
4. Start playground: `pnpm --filter @gotipe/playground dev`
5. Open browser → editor works, can type, format, create blocks
6. Test a11y: keyboard-only navigation (Tab → toolbar → editor → slash menu → Escape)
7. Test i18n: switch locale to Russian/Arabic, verify translations + RTL layout
8. Add inline comment → comment bubble appears, reply, resolve
9. Enable suggestion mode → edits show as diffs, accept/reject
10. Create named version → view timeline, compare versions, restore
11. Start Go server: `cd apps/cloud && go run ./cmd/api`
12. Enable collaboration → two tabs sync in real-time, colored cursors
13. Test Stripe: create subscription → verify quota enforcement
14. Verify landing: `cd apps/landing && pnpm dev` → gotipe.com layout, pricing, features
15. Verify docs: open docs.gotipe.com → Mintlify site live, API Reference from OpenAPI
