# GoTipe — Промт для реализации Фазы 1

## Контекст

Ты реализуешь GoTipe — Rust/WASM rich text editor framework с Notion-like UX. Проект имеет 20 дизайн-документов в `docs/` с полными reference-реализациями. Сейчас в репозитории **ноль строк кода** — всё пишется с нуля.

Фаза 1 = Rust workspace: 8 crates + root config. Каждый файл должен быть **полностью рабочим** — компилироваться, проходить тесты, содержать полные типы и реализации. Не заглушки, не TODO, не "implement later".

## Обязательные правила

1. **Block-first model:** Document → Block[] (НЕ ProseMirror node tree). Block = {id: UUID v7, type, attrs, content: RichText|Raw|Empty, children}
2. **Все изменения через Transaction:** EditorState immutable, apply(Transaction) → new EditorState
3. **Extension = всё:** Каждый block type, mark, behavior — extension. Extension trait в Rust
4. **CRDT sync = binary protocol:** Message types 0x01-0x09, zstd compression, НЕ JSON
5. **HTML sanitization:** Rust ammonia с allowlist. HtmlSanitizer::strict()
6. **Feature gates:** `gotipe-export` features контролируют WASM bundle. Default = ["html","markdown","plaintext"]
7. **Naming:** crate = `gotipe-*` (kebab), modules = `snake_case`, types = `PascalCase`
8. **Ошибки:** `thiserror` для всех error types
9. **Публичные типы:** `#[derive(Debug, Clone, Serialize, Deserialize)]`
10. **Tests:** `#[cfg(test)] mod tests`, naming: `test_<action>_<result>`
11. **WASM optimization:** `opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip = true`
12. **НЕ использовать Yjs** — GoTipe имеет собственный CRDT

## Порядок реализации

Строго по dependency graph:
```
1.1 Root config → 1.2 gotipe-schema → 1.3 gotipe-core → 1.4 gotipe-crdt → 1.5 gotipe-comments → 1.6 gotipe-versioning → 1.7 gotipe-ai → 1.8 gotipe-export → 1.9 gotipe-wasm → 1.10 Verify
```

---

## 1.1 Root-level конфигурация

### `Cargo.toml` (workspace root)

```toml
[workspace]
resolver = "2"
members = [
    "crates/gotipe-schema",
    "crates/gotipe-core",
    "crates/gotipe-crdt",
    "crates/gotipe-comments",
    "crates/gotipe-versioning",
    "crates/gotipe-ai",
    "crates/gotipe-export",
    "crates/gotipe-wasm",
]

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "MIT"
repository = "https://github.com/gotipe/gotipe"

[workspace.dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
thiserror = "2.0"
wasm-bindgen = "0.2"
uuid = { version = "1.0", features = ["v4", "v7"] }
chrono = { version = "0.4", features = ["serde"] }
zstd = "0.13"
regex = "1.11"

# Export
typst = "0.12"
docx-rs = "0.4"
comrak = { version = "0.31", default-features = false }
ammonia = "4.0"

# Testing
criterion = "0.5"
proptest = "1.5"

[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
strip = true

[profile.bench]
opt-level = 3
lto = true
```

### `package.json` (root)

```json
{
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "build:wasm": "bash scripts/build-wasm.sh",
    "clean": "turbo run clean && cargo clean"
  },
  "devDependencies": {
    "turbo": "^2.3",
    "typescript": "^5.7",
    "vitest": "^2.1",
    "@biomejs/biome": "^1.9",
    "tsup": "^8.3",
    "@changesets/cli": "^2.27",
    "@playwright/test": "^1.49"
  }
}
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "composite": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### `.rustfmt.toml`

```toml
edition = "2021"
max_width = 100
tab_spaces = 4
use_field_init_shorthand = true
use_try_shorthand = true
```

### `biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  }
}
```

### `.gitignore`

```
target/
node_modules/
dist/
pkg/
.env
*.wasm
.turbo/
```

### `LICENSE-MIT` — стандартный MIT license text

### `LICENSE-COMMERCIAL` — Commercial license for block-editor packages

---

## 1.2 `crates/gotipe-schema/` — Schema DSL

**Полная reference-реализация из docs/03-editor-core.md. Копируй 1:1, не сокращай.**

### `crates/gotipe-schema/Cargo.toml`

```toml
[package]
name = "gotipe-schema"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
```

### `crates/gotipe-schema/src/lib.rs`

```rust
pub mod attr;
pub mod node_spec;
pub mod mark_spec;
pub mod validate;
pub mod defaults;

pub use attr::{AttrValue, AttrSpec, AttrType};
pub use node_spec::{NodeSpec, ContentRule, MarksRule};
pub use mark_spec::MarkSpec;
pub use validate::{Schema, ValidationError};
```

### `crates/gotipe-schema/src/attr.rs`

```rust
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AttrValue {
    String(String),
    Number(f64),
    Bool(bool),
    Null,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttrSpec {
    pub attr_type: AttrType,
    pub default: Option<AttrValue>,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AttrType {
    String,
    Number,
    Bool,
    Enum(Vec<String>),
}
```

### `crates/gotipe-schema/src/node_spec.rs`

```rust
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use crate::attr::AttrSpec;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeSpec {
    pub name: String,
    pub group: Vec<String>,
    pub content: ContentRule,
    pub attrs: HashMap<String, AttrSpec>,
    pub top_level: bool,
    pub marks_allowed: MarksRule,
    pub leaf: bool,
    pub allows_children: bool,
    pub child_types: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ContentRule {
    RichText,
    RawText,
    Empty,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MarksRule {
    All,
    Only(Vec<String>),
    None,
}
```

### `crates/gotipe-schema/src/mark_spec.rs`

```rust
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use crate::attr::AttrSpec;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarkSpec {
    pub name: String,
    pub exclusive_group: Option<String>,
    pub attrs: HashMap<String, AttrSpec>,
    pub rank: u32,
}
```

### `crates/gotipe-schema/src/validate.rs`

Полная реализация — **скопируй из docs/03-editor-core.md секция "Schema Validation", строки 644-819. Включая:**
- `Schema` struct с `HashMap<String, NodeSpec>` + `HashMap<String, MarkSpec>`
- `validate(&Document) -> Result<(), Vec<ValidationError>>` — полные 5 проверок: block type exists, attrs valid, content type matches, marks allowed, children valid
- `validate_step(&Step, &Document) -> Result<(), ValidationError>`
- `ValidationError` enum с 9 вариантами: UnknownBlockType, MissingAttribute, UnknownAttribute, InvalidContent, UnknownMark, MarkNotAllowed, ChildrenNotAllowed, InvalidChildType, BlockNotFound

**ВАЖНО:** validate.rs зависит от `Document`, `Block`, `BlockContent`, `BlockId`, `Step` из `gotipe-core`. Поскольку schema НЕ зависит от core (core зависит от schema), нужно определить минимальные типы документа здесь или использовать trait bounds. **Решение:** определить типы Document/Block в gotipe-schema (они shared), а gotipe-core re-exports их.

**Альтернативное решение (рекомендуемое):** Schema::validate принимает generic типы через trait. Но проще: перенести Document model в gotipe-schema как базовые типы, а gotipe-core добавляет EditorState/Transaction/Commands поверх.

### `crates/gotipe-schema/src/defaults.rs`

Полная реализация `Schema::default_block_editor()` — **скопируй из docs/03-editor-core.md строки 187-639. Все 20 node types + 9 marks с полными AttrSpec:**

Nodes (20): paragraph, heading, bulletList, orderedList, listItem, codeBlock, image, blockquote, divider, callout, table, tableRow, tableCell, tableHeader, toggle, columns, column, embed, math, file

Marks (9): bold (rank 10), italic (rank 20), underline (rank 30), strikethrough (rank 40), code (rank 50, exclusive_group: "code"), link (rank 60, attrs: href+target), highlight (rank 5, attrs: color), superscript (rank 70, exclusive_group: "script"), subscript (rank 80, exclusive_group: "script")

### Tests для gotipe-schema

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_schema_has_all_blocks() {
        let schema = Schema::default_block_editor();
        assert_eq!(schema.nodes.len(), 20);
        assert_eq!(schema.marks.len(), 9);
        assert!(schema.nodes.contains_key("paragraph"));
        assert!(schema.nodes.contains_key("heading"));
        assert!(schema.nodes.contains_key("table"));
        assert!(schema.marks.contains_key("bold"));
        assert!(schema.marks.contains_key("link"));
    }

    #[test]
    fn test_validate_valid_document() { /* ... */ }

    #[test]
    fn test_validate_unknown_block_type() { /* ... */ }

    #[test]
    fn test_validate_missing_required_attr() { /* ... */ }

    #[test]
    fn test_validate_marks_not_allowed() { /* ... */ }

    #[test]
    fn test_validate_children_not_allowed() { /* ... */ }

    #[test]
    fn test_validate_step_add_mark_to_no_marks_block() { /* ... */ }
}
```

---

## 1.3 `crates/gotipe-core/` — Document Model, Transforms, Commands

### `crates/gotipe-core/Cargo.toml`

```toml
[package]
name = "gotipe-core"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
gotipe-schema = { path = "../gotipe-schema" }
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
uuid = { workspace = true }

[dev-dependencies]
criterion = { workspace = true }

[[bench]]
name = "transform"
harness = false
```

### `crates/gotipe-core/src/document.rs`

Полная реализация из docs/01-architecture.md строки 270-330:

```rust
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use gotipe_schema::AttrValue;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct BlockId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub blocks: Vec<Block>,
    pub version: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub id: BlockId,
    pub block_type: String,
    pub attrs: HashMap<String, AttrValue>,
    pub content: BlockContent,
    pub children: Vec<Block>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum BlockContent {
    RichText(Vec<TextSpan>),
    Empty,
    Raw(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextSpan {
    pub text: String,
    pub marks: Vec<Mark>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Mark {
    pub mark_type: String,
    pub attrs: HashMap<String, AttrValue>,
}
```

**Impl блоки для Document:** `from_json`, `to_json`, `find_block(&BlockId) -> Option<&Block>`, `find_block_mut(&BlockId) -> Option<&mut Block>`, `remove_block(&BlockId) -> Option<Block>`, `flatten() -> impl Iterator<Item=&Block>` (рекурсивный обход), `parent_and_index(&BlockId) -> Option<(Option<BlockId>, usize)>`

**Impl для Block:** `new(block_type, &Schema) -> Option<Block>` (factory с default attrs), `is_empty() -> bool`, `text_length() -> usize`

### `crates/gotipe-core/src/selection.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Selection {
    Cursor { block_id: BlockId, offset: usize },
    Text { block_id: BlockId, from: usize, to: usize },
    Block { block_id: BlockId },
    Multi { block_ids: Vec<BlockId> },
}
```

Impl: `as_text() -> Option<TextSelection>`, `as_cursor() -> Option<CursorSelection>`, `block_id() -> &BlockId`, `map_through(steps: &[Step]) -> Selection`

### `crates/gotipe-core/src/transaction.rs`

Из docs/01-architecture.md строки 447-513 — **полный Step enum с 11 вариантами:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub steps: Vec<Step>,
    pub selection: Option<Selection>,
    pub metadata: HashMap<String, AttrValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Step {
    InsertText { block_id: BlockId, offset: usize, text: String, marks: Vec<Mark> },
    DeleteText { block_id: BlockId, from: usize, to: usize },
    InsertBlock { parent_id: Option<BlockId>, index: usize, block: Block },
    DeleteBlock { block_id: BlockId },
    MoveBlock { block_id: BlockId, new_parent_id: Option<BlockId>, new_index: usize },
    SetBlockAttrs { block_id: BlockId, attrs: HashMap<String, AttrValue> },
    SetBlockType { block_id: BlockId, new_type: String, attrs: HashMap<String, AttrValue> },
    AddMark { block_id: BlockId, from: usize, to: usize, mark: Mark },
    RemoveMark { block_id: BlockId, from: usize, to: usize, mark_type: String },
    SplitBlock { block_id: BlockId, offset: usize },
    MergeBlocks { block_id: BlockId, target_id: BlockId },
}
```

`TransformError` enum: `BlockNotFound(BlockId)`, `OffsetOutOfRange`, `InvalidContentType`, `CycleDetected`, `InvalidStep(String)`

### `crates/gotipe-core/src/transform.rs`

Из docs/03-editor-core.md строки 830-1020 — **полная реализация `Step::apply()`** для КАЖДОГО из 11 вариантов + helper-функции:
- `insert_text_at(spans, offset, text, marks)` — полный код из docs
- `delete_text_range(spans, from, to)`
- `add_mark_to_range(spans, from, to, mark)`
- `remove_mark_from_range(spans, from, to, mark_type)`
- `split_block_at(doc, block_id, offset)`
- `merge_blocks(doc, target_id, block_id)`

### `crates/gotipe-core/src/state.rs`

Из docs/01-architecture.md строки 386-442:

```rust
#[derive(Debug, Clone)]
pub struct EditorState {
    doc: Document,
    selection: Selection,
    schema: Schema,
    plugins: Vec<Box<dyn PluginState>>,
    last_steps: Vec<Step>,
}
```

Impl: `new(doc, schema)`, `apply(Transaction) -> Result<EditorState, TransformError>` с полным pipeline: 1) validate steps → 2) apply to doc → 3) map selection → 4) run plugin hooks. Getters: `doc()`, `selection()`, `schema()`, `last_steps()`

### `crates/gotipe-core/src/command.rs`

Из docs/03-editor-core.md строки 1030-1073 + docs/01-architecture.md строки 520-584:

**~25 command functions:**
- Text formatting: `toggle_bold`, `toggle_italic`, `toggle_underline`, `toggle_strikethrough`, `toggle_code`, `toggle_highlight(color)`, `set_link(href)`, `remove_link`
- Block operations: `set_block_type`, `insert_block_after`, `insert_block_before`, `delete_block`, `move_block_up`, `move_block_down`, `duplicate_block`
- Lists: `toggle_bullet_list`, `toggle_ordered_list`, `toggle_todo_list`, `indent`, `outdent`
- Block splitting/merging: `split_block`, `merge_with_previous`, `insert_hard_break`
- Selection: `select_all`, `select_block`
- Clipboard: `cut`, `copy`, `paste`

Каждая функция: `fn(state: &EditorState) -> Option<Transaction>` — полная реализация, создаёт Transaction с правильными Steps.

### `crates/gotipe-core/src/clipboard.rs`

- `parse_paste_html(html: &str, schema: &Schema) -> Result<Document>` — HTML → Document with sanitization
- `parse_paste_markdown(md: &str, schema: &Schema) -> Result<Document>` — MD → Document
- `parse_paste_plain(text: &str) -> Document` — plain → paragraphs
- `serialize_copy(doc: &Document, selection: &Selection) -> ClipboardData` — Selection → HTML + plain + internal JSON

### `crates/gotipe-core/src/extension.rs`

Из docs/01-architecture.md строки 600-631 — Extension trait + Plugin trait:

```rust
pub trait Extension: Send + Sync {
    fn name(&self) -> &str;
    fn dependencies(&self) -> Vec<&str> { vec![] }
    fn nodes(&self) -> Vec<NodeSpec> { vec![] }
    fn marks(&self) -> Vec<MarkSpec> { vec![] }
    fn keybindings(&self) -> Vec<Keybinding> { vec![] }
    fn input_rules(&self) -> Vec<InputRule> { vec![] }
    fn paste_rules(&self) -> Vec<PasteRule> { vec![] }
    fn slash_commands(&self) -> Vec<SlashCommandDef> { vec![] }
    fn on_create(&self, _state: &EditorState) {}
    fn on_update(&self, _old: &EditorState, _new: &EditorState) {}
    fn on_destroy(&self) {}
    fn plugin(&self) -> Option<Box<dyn Plugin>> { None }
    fn default_config(&self) -> HashMap<String, AttrValue> { HashMap::new() }
    fn accessibility(&self) -> Option<BlockA11yConfig> { None }
    fn storage_key(&self) -> Option<&str> { None }
}

pub trait Plugin: Send + Sync {
    fn apply(&self, tr: &Transaction, doc: &Document) -> Box<dyn PluginState>;
    fn decorations(&self, state: &EditorState) -> Vec<Decoration> { vec![] }
}
```

Structs: `InputRule { pattern: String, handler: ... }`, `PasteRule { mime_types: Vec<String>, handler: ... }`, `Keybinding { key: String, command: Command, when: Option<WhenCondition> }`, `SlashCommandDef { name, description, icon, group, aliases, action }`, `WhenCondition` enum (InTable, InCodeBlock, InList, InBlockquote, Custom(String)), `Decoration` enum (Widget, Inline, Block), `BlockA11yConfig { role, label, description, landmark }`

### `crates/gotipe-core/src/error.rs`

```rust
#[derive(Debug, Clone, thiserror::Error)]
pub enum GoTipeError {
    #[error("Transform error: {0}")]
    Transform(#[from] TransformError),
    #[error("Validation error: {0}")]
    Validation(String),
    #[error("Schema error: {0}")]
    Schema(String),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("Extension error: {0}")]
    Extension(String),
}
```

### `crates/gotipe-core/benches/transform.rs`

Из docs/03-editor-core.md строки 1318-1368:
- `bench_insert_text` — 1000 blocks, insert text at block 500
- `bench_parse_json` — parse 10K blocks from JSON
- `bench_validate` — validate 10K blocks
- `bench_apply_1000_inserts` — 1000 sequential text inserts

### Tests для gotipe-core

Полные unit tests для: каждого Step variant (11 тестов), document operations (find, remove, flatten), command execution (toggle_bold, split_block, etc.), selection mapping через steps, clipboard roundtrip (copy → paste → same content)

---

## 1.4 `crates/gotipe-crdt/` — CRDT Engine

### `crates/gotipe-crdt/Cargo.toml`

```toml
[package]
name = "gotipe-crdt"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
gotipe-core = { path = "../gotipe-core" }
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
zstd = { workspace = true }
uuid = { workspace = true }

[dev-dependencies]
proptest = { workspace = true }
```

### Файлы

| Файл | Содержимое |
|------|-----------|
| `src/lib.rs` | Re-exports всех модулей |
| `src/doc.rs` | `CrdtDocument` struct: peer_id, tree (MovableTreeCrdt), texts (HashMap<BlockId, RichTextCrdt>), attrs (HashMap<BlockId, LwwMap>), version (VersionVector), history. **Impl:** `new(peer_id, Document)`, `apply_local(steps) -> Vec<CrdtOp>`, `apply_remote(bytes) -> Vec<Step>`, `encode_update_since(version_vector) -> Vec<u8>`, `encode_snapshot() -> Vec<u8>` |
| `src/text.rs` | `RichTextCrdt`: Fugue/RGA-based. Operations: insert(pos, char, marks), delete(pos) с mark preservation. Convergence через unique operation IDs (lamport_timestamp + peer_id). Каждый символ = `CrdtChar { id: OpId, value: char, marks: Vec<Mark>, deleted: bool, left_origin: OpId, right_origin: OpId }` |
| `src/tree.rs` | `MovableTreeCrdt`: для block reordering/nesting. `insert(parent_id, index, block)`, `move_node(block_id, new_parent, new_index)`, `delete(block_id)` с **cycle detection**. Conflict resolution: deterministic по peer_id при concurrent moves |
| `src/sync.rs` | `SyncProtocol`: encode/decode binary frames. Message types: `0x01 SyncStep1` (version vector), `0x02 SyncStep2` (missing updates), `0x03 Update`, `0x04 Awareness`, `0x05 Query`, `0x06 Snapshot`, `0x07 Auth`, `0x08 Error`, `0x09 Ack`. **zstd compression для payloads >1KB**. VarInt encoding for lengths. Frame format: `[type: u8][flags: u8][length: varint][payload: bytes]` |
| `src/awareness.rs` | `AwarenessProtocol`: AwarenessState {peer_id, user: UserInfo, cursor: Option<CursorPosition>, selection: Option<SelectionRange>, timestamp: u64}. UserInfo {name, color, avatar_url}. **30s timeout для stale peers.** `set_cursor()`, `set_selection()`, `apply_remote()`, `cleanup_stale()` |
| `src/history.rs` | `CrdtHistory` — из docs/03 строки 1082-1168. undo_stack, redo_stack, group_timeout_ms=500. `record(ops)`, `undo() -> (inverse_ops, selection)`, `redo()`. Operation grouping by time window |
| `src/version.rs` | `VersionVector`: HashMap<PeerId, u64>. `tick(peer_id)`, `merge_remote(other)`, `contains(other) -> bool`, `diff(other) -> Vec<(PeerId, u64, u64)>` |
| `src/lww.rs` | `LwwMap<K, V>`: last-writer-wins register для block attributes. `set(key, value, timestamp)`, `get(key) -> Option<&V>`, `merge(other)` |
| `src/map.rs` | `CrdtMap<K, V>`: generic CRDT map. `insert(key, value)`, `update(key, value)`, `delete(key)`, `merge(other)`, `iter()` |
| `src/ops.rs` | `CrdtOp` enum: `Text(BlockId, TextOp)`, `Tree(TreeOp)`, `Attrs(BlockId, HashMap)`, `Comment(CommentOp)`, `Suggestion(SuggestionOp)`. `OpId { lamport: u64, peer_id: String }`. `encode(ops) -> Vec<u8>`, `decode(bytes) -> Vec<CrdtOp>` |
| `tests/convergence.rs` | **proptest** property tests: 1) concurrent operations converge to same state, 2) no cycles in tree after random moves, 3) marks consistent after concurrent mark edits, 4) version vectors monotonically increase |

---

## 1.5 `crates/gotipe-comments/` — Comments & Suggestions

### Файлы

| Файл | Содержимое |
|------|-----------|
| `Cargo.toml` | deps: gotipe-core, gotipe-crdt, serde, thiserror, chrono, uuid |
| `src/lib.rs` | Re-exports: Comment, CommentThread, CommentAnchor, CommentMark, Suggestion, SuggestionMark |
| `src/comment.rs` | `CommentId(String)`, `CommentAnchor` enum: `Inline { block_id, from: usize, to: usize }`, `Block { block_id }`, `Document`. `Comment` struct: `{ id, anchor, author: String, content: String, created_at: DateTime, updated_at: DateTime, resolved_at: Option<DateTime>, resolved_by: Option<String>, parent_id: Option<CommentId>, reactions: Vec<Reaction>, metadata: HashMap }`. `Reaction { emoji: String, user_id: String, created_at }`. `CommentThread { root: Comment, replies: Vec<Comment>, is_resolved: bool }` |
| `src/mark.rs` | CommentMarkExtension impl Extension: mark "comment" с attrs {commentId: String, resolved: Bool}. exclusive_group=None, spanning=true, inclusive=false |
| `src/suggestion.rs` | `SuggestionId(String)`, `SuggestionType` enum: `Insert`, `Delete`, `Replace`, `Format { old_marks, new_marks }`, `BlockChange { old_type, new_type, old_attrs, new_attrs }`. `Suggestion` struct: `{ id, suggestion_type, author, created_at, anchor: CommentAnchor, comment_thread: Option<CommentThread>, status: SuggestionStatus }`. `SuggestionStatus` enum: `Pending`, `Accepted`, `Rejected` |
| `src/suggestion_mark.rs` | SuggestionMarkExtension impl Extension: mark "suggestion" с attrs {suggestionId, type, authorId} |
| `src/ops.rs` | `CommentOp` enum: Add, Update, Delete, Resolve, Reopen, AddReaction, RemoveReaction. `SuggestionOp` enum: Add, Accept, Reject, Update |
| `tests/` | Unit tests: comment CRDT merge, concurrent add+resolve, suggestion accept/reject, overlapping comments |

---

## 1.6 `crates/gotipe-versioning/` — Version History

| Файл | Содержимое |
|------|-----------|
| `Cargo.toml` | deps: gotipe-core, gotipe-crdt, serde, thiserror, chrono, zstd |
| `src/version.rs` | `VersionId(String)`, `Version` struct: `{ id, document_id, name: Option<String>, version_type, state_vector: Vec<u8>, created_by, created_at, description: Option<String>, metadata: HashMap, snapshot_size: u64 }`. `VersionType` enum: `AutoSave`, `Named`, `Milestone { milestone_type: String }`, `RestorePoint { restored_from: VersionId }` |
| `src/snapshot.rs` | `IncrementalSnapshot` struct: `{ base_state_vector: Vec<u8>, ops: Vec<CrdtOp>, compressed_data: Vec<u8> }`. `encode_snapshot(ops, base) -> IncrementalSnapshot` (zstd compress). `decode_snapshot(snapshot) -> Vec<CrdtOp>`. **Full snapshot every 50 versions** |
| `src/diff.rs` | `VersionDiff`: compute diff between two state vectors. `block_changes: Vec<BlockChange>` (Added, Removed, Modified). `text_changes: Vec<TextChange>` (inserted spans, deleted spans). Attribution: who changed what (peer_id → changes) |
| `src/manager.rs` | `VersionManager`: `create_version(name, type)`, `list_versions(doc_id)`, `restore_version(version_id) -> Document`, `compare_versions(from, to) -> VersionDiff`, `auto_save_interval(Duration)` |

---

## 1.7 `crates/gotipe-ai/` — AI Context Builder

| Файл | Содержимое |
|------|-----------|
| `Cargo.toml` | deps: gotipe-core, serde, serde_json, thiserror, regex |
| `src/provider.rs` | `AiProvider` trait: `complete(context, cursor) -> Stream<String>`, `command(context, command, prompt) -> Stream<String>`. `AiCommand` enum: Rewrite, Expand, Summarize, Translate, FixGrammar, ChangeTone. **Provider fallback chain: OpenAI → Anthropic → Gemini.** Mode-specific defaults: temperature inline=0.1, command=0.3, maxTokens inline=128, command=2048 |
| `src/context.rs` | `ContextBuilder`: from EditorState, builds LLM context with blocks_before, blocks_after, selection, document_title. **Token budget truncation:** greedy block selection, token estimation = chars/4 + padding. Smart truncation to fit token limits (default 4096 tokens) |
| `src/suggestion.rs` | `SuggestionState`: ghost_text: Option<GhostText>, position, status (Pending/Streaming/Done/Dismissed), request_id: u64. `GhostText { text, block_id, offset }`. **Auto-dismiss on any keystroke.** AbortController pattern: request_id increments, stale results discarded |
| `src/commands.rs` | AI command definitions with parameter interpolation: `{language}`, `{tone}` placeholders in prompt templates |
| `src/streaming.rs` | `StreamingConfig`: timeout 30s max, retry_after header parsing, exponential backoff (1s, 2s, 4s, max 16s) |
| `src/pii.rs` | `PiiDetector`: `detect_email(text) -> Vec<PiiMatch>` (regex), `detect_phone(text)` (international formats), `detect_credit_card(text)` (Luhn validation), `redact_pii(text) -> String` (replace with [REDACTED]). `PiiType` enum: Email, Phone, CreditCard |

---

## 1.8 `crates/gotipe-export/` — Document Conversion

### `crates/gotipe-export/Cargo.toml`

```toml
[package]
name = "gotipe-export"
version.workspace = true
edition.workspace = true
license.workspace = true

[features]
default = ["html", "markdown", "plaintext"]
html = ["ammonia"]
markdown = ["comrak"]
plaintext = []
pdf = ["typst"]
docx = ["docx-rs"]
notion = []

[dependencies]
gotipe-core = { path = "../gotipe-core" }
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
ammonia = { workspace = true, optional = true }
comrak = { workspace = true, optional = true }
typst = { workspace = true, optional = true }
docx-rs = { workspace = true, optional = true }
```

### Файлы

| Файл | Содержимое |
|------|-----------|
| `src/lib.rs` | Pub functions: `to_html`, `to_markdown`, `to_json`, `to_plaintext`. Feature-gated: `to_pdf`, `to_docx`. `ExportOptions { inline_styles, csp_nonce, base_url, css_classes, highlight_code, include_metadata }`, `ImportOptions { strict, sanitize, max_blocks, allowed_tags, image_base_url }`, `ConvertError` enum (UnsupportedBlockType, UnsupportedMark, Encoding, FontNotFound, ImageError). `ConverterRegistry` (register_exporter/register_importer) |
| `src/html.rs` | `to_html(doc, options) -> Result<String>` — Block→HTML mapping для всех 20 типов. `from_html(html, schema, options) -> Result<Document>` — HTML parser with whitelist |
| `src/html/sanitizer.rs` | `HtmlSanitizer` struct: allowed_elements, allowed_attrs, allowed_css_props, allowed_uri_schemes (http, https, mailto). `HtmlSanitizer::strict()` с полным allowlist. `sanitize(html) -> Result<String>`, `validate_uri(uri) -> bool`. **Блокирует javascript:, data: URIs** |
| `src/markdown.rs` | `to_markdown(doc) -> String`, `from_markdown(md, schema) -> Result<Document>` via comrak (CommonMark + GFM) |
| `src/json.rs` | `to_json(doc) -> String`, `from_json(json, schema) -> Result<Document>` — direct serde |
| `src/plaintext.rs` | `to_plaintext(doc) -> String` — strip marks, flatten blocks |
| `src/pdf.rs` | `#[cfg(feature = "pdf")] to_pdf(doc, config: PdfConfig) -> Result<Vec<u8>>` via typst |
| `src/docx.rs` | `#[cfg(feature = "docx")] to_docx(doc) -> Result<Vec<u8>>` via docx-rs |
| `tests/` | Roundtrip: doc→html→doc, doc→md→doc, doc→json→doc. XSS prevention: `<script>`, `javascript:`, event handlers |

---

## 1.9 `crates/gotipe-wasm/` — WASM Bindings

### `crates/gotipe-wasm/Cargo.toml`

```toml
[package]
name = "gotipe-wasm"
version.workspace = true
edition.workspace = true
license.workspace = true

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
gotipe-schema = { path = "../gotipe-schema" }
gotipe-core = { path = "../gotipe-core" }
gotipe-crdt = { path = "../gotipe-crdt" }
gotipe-comments = { path = "../gotipe-comments" }
gotipe-versioning = { path = "../gotipe-versioning" }
gotipe-ai = { path = "../gotipe-ai" }
gotipe-export = { path = "../gotipe-export" }
wasm-bindgen = { workspace = true }
serde-wasm-bindgen = "0.6"
js-sys = "0.3"
web-sys = { version = "0.3", features = ["console"] }

[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
strip = true
```

### `src/lib.rs`

Из docs/01-architecture.md строки 148-227 — `#[wasm_bindgen] struct WasmEditor` с полным API:

```rust
#[wasm_bindgen]
impl WasmEditor {
    #[wasm_bindgen(constructor)]
    pub fn new(schema_json: &str, doc_json: &str) -> Result<WasmEditor, JsError>;
    pub fn apply(&mut self, transaction_json: &str) -> Result<String, JsError>;
    pub fn validate(&self, doc_json: &str) -> Result<bool, JsError>;

    // Collaboration
    pub fn enable_collaboration(&mut self, peer_id: &str) -> Result<(), JsError>;
    pub fn receive_update(&mut self, update: &[u8]) -> Result<String, JsError>;
    pub fn get_update(&mut self) -> Result<Vec<u8>, JsError>;

    // Export
    pub fn export_html(&self) -> Result<String, JsError>;
    pub fn export_markdown(&self) -> Result<String, JsError>;
    pub fn export_json(&self) -> String;
    pub fn sanitize_html(&self, html: &str) -> Result<String, JsError>;

    // Comments
    pub fn add_comment(&mut self, comment_json: &str) -> Result<String, JsError>;
    pub fn resolve_comment(&mut self, comment_id: &str) -> Result<(), JsError>;
    pub fn get_comments(&self) -> Result<String, JsError>;

    // Suggestions
    pub fn set_suggestion_mode(&mut self, enabled: bool);
    pub fn accept_suggestion(&mut self, suggestion_id: &str) -> Result<String, JsError>;
    pub fn reject_suggestion(&mut self, suggestion_id: &str) -> Result<String, JsError>;

    // Versions
    pub fn create_version(&mut self, name: &str) -> Result<String, JsError>;
    pub fn list_versions(&self) -> Result<String, JsError>;
    pub fn restore_version(&mut self, version_id: &str) -> Result<String, JsError>;
    pub fn compare_versions(&self, from: &str, to: &str) -> Result<String, JsError>;

    // AI
    pub fn detect_pii(&self, text: &str) -> Result<String, JsError>;
}
```

---

## 1.10 Верификация Фазы 1

После реализации ВСЕХ crate'ов запусти:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cargo test -p gotipe-crdt -- --ignored  # property tests
cargo bench --no-run  # verify benchmarks compile
bash scripts/build-wasm.sh  # verify WASM builds and size <500KB
```

**Все команды должны пройти без ошибок.**

---

## Подсказки по реализации

1. **Dependency cycle:** Schema нужна и в validate (для Document) и в core. Решение: определи Document/Block/TextSpan/Mark в gotipe-schema (или в отдельном gotipe-types crate). Core re-exports.

2. **CRDT text:** Используй Fugue algorithm (https://arxiv.org/abs/2305.00583). Каждый символ имеет уникальный OpId(lamport, peer_id). Insert between left_origin and right_origin. Delete = tombstone (deleted=true).

3. **Tree CRDT:** MovableTree по CRDT literature. Cycle detection: при move проверяй что target не является descendant of source. Conflict resolution: sort by (lamport, peer_id).

4. **Binary protocol:** VarInt encoding: 7 bits per byte, MSB = continuation bit. Frame = [type:1][flags:1][length:varint][payload:bytes]. Flags: bit 0 = compressed (zstd), bit 1 = requires-ack.

5. **TextSpan normalization:** После каждой операции merge adjacent spans с одинаковыми marks. Remove empty spans.

6. **Mark exclusive_group:** При AddMark, если mark.exclusive_group совпадает с existing mark, удали existing перед добавлением (например superscript vs subscript).

7. **Block.leaf enforcement:** Если NodeSpec.leaf=true, блок НЕ может иметь children. Validate это.

8. **Selection.map_through:** При InsertText увеличивай offset если insert перед cursor. При DeleteText уменьшай. При InsertBlock/DeleteBlock пересчитывай block_id если нужно.
