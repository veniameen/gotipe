# GoTipe — Architecture

> **PDF: historical proposal.** The mentions of Typst/docx-rs and the size and capability
> estimates below do not describe the current backend. GoTipe owns PDF layout and
> OOXML rendering; the current references are the [export contract](development/export-contract.md)
> and the [dependency policy](development/dependencies.md).

> **Historical specification, not a guide to the current API.** The examples, schedules,
> performance comparisons, commercial terms and promises below do not confirm an
> implementation or service availability. Current: [contracts](development/editor-contracts.md),
> [code map](development/code-map.md), [checks](development/testing.md),
> [release plan](22-release-readiness.md). Licenses are defined by `LICENSE` and the manifest
> of each package, not by this document.

## System overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                            │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Framework Adapters                          │  │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌─────────────┐    │  │
│  │  │  React  │  │  Vue 3  │  │ Svelte 5 │  │    Solid    │    │  │
│  │  │ Adapter │  │ Adapter │  │ Adapter  │  │   Adapter   │    │  │
│  │  └────┬────┘  └────┬────┘  └────┬─────┘  └──────┬──────┘    │  │
│  └───────┼─────────────┼───────────┼────────────────┼───────────┘  │
│          └──────┬──────┴─────┬─────┴────────────────┘              │
│                 ▼            ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                @gotipe/core (TypeScript)                      │  │
│  │                                                              │  │
│  │  ┌──────────┐  ┌───────────┐  ┌─────────┐  ┌────────────┐  │  │
│  │  │ EditorManager│ │EventBus│  │PluginHost│ │ View Layer │  │  │
│  │  └─────┬────┘  └─────┬─────┘  └────┬────┘  └─────┬──────┘  │  │
│  └────────┼──────────────┼─────────────┼─────────────┼──────────┘  │
│           └──────┬───────┴──────┬──────┴─────────────┘             │
│                  ▼              ▼                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              gotipe-wasm (Rust → WebAssembly)                 │  │
│  │                                                              │  │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌────────────┐ │  │
│  │  │gotipe-core │ │gotipe-crdt │ │gotipe-ai │ │gotipe-export│ │  │
│  │  │            │ │            │ │          │ │            │ │  │
│  │  │ Document   │ │ CRDT State │ │ Context  │ │ HTML/MD/   │ │  │
│  │  │ Schema     │ │ Sync Proto │ │ Builder  │ │ PDF/DOCX   │ │  │
│  │  │ Transforms │ │ Awareness  │ │ Provider │ │ Converters │ │  │
│  │  │ Commands   │ │ History    │ │ Iface    │ │            │ │  │
│  │  │ Validation │ │            │ │          │ │            │ │  │
│  │  └────────────┘ └──────┬─────┘ └──────────┘ └────────────┘ │  │
│  └─────────────────────────┼────────────────────────────────────┘  │
│                            │                                       │
└────────────────────────────┼───────────────────────────────────────┘
                             │ WebSocket
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│                     SERVER (Self-hosted / Cloud)                    │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Sync Server  │  │  AI Proxy    │  │   Export Service          │ │
│  │ (Go/Rust)    │  │  (Go)        │  │   (Rust WASM)            │ │
│  │              │  │              │  │                          │ │
│  │ WebSocket    │  │ OpenAI       │  │ PDF (typst)             │ │
│  │ CRDT Merge   │  │ Anthropic    │  │ DOCX (docx-rs)          │ │
│  │ Persistence  │  │ Gemini       │  │ Markdown                │ │
│  │ Auth         │  │ Ollama       │  │ HTML                    │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘ │
│         │                 │                       │               │
│         ▼                 ▼                       ▼               │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                   Storage Layer                               │ │
│  │  PostgreSQL  │  Valkey (Redis)  │  Cloudflare R2              │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## Rust/WASM Core

### Why Rust

| Aspect | Rust/WASM | JavaScript | Go/WASM |
|--------|-----------|------------|---------|
| **Parsing speed** | ~10-50x faster than JS on tree operations | Baseline | ~2-5x faster than JS, but the WASM binary is 3-5x larger |
| **Memory safety** | Compile-time guarantees, no GC pauses | GC pauses on large documents | GC, runtime overhead |
| **WASM binary size** | 200-500KB (wasm-opt) | N/A | 2-10MB (Go runtime in WASM) |
| **Server-side** | Native binary OR WASM in Node.js | Native in Node.js | Native binary |
| **Ecosystem** | serde, wasm-bindgen, loro, typst | ProseMirror, Yjs, unified | No RTE ecosystem |
| **Type safety** | Algebraic types, pattern matching | TypeScript (compile-time only) | Interfaces (runtime) |
| **Concurrency** | async/await, rayon (server-side) | Single-threaded | Goroutines (not in WASM) |

**Decision:** Rust is the only language that delivers native performance, memory safety and a compact WASM binary at the same time. The Go WASM binary is too large for the client. JS is not fast enough for CRDT operations on large documents.

### Rust crate structure

```
crates/
├── gotipe-core/          # Document model, schema, validation
│   ├── src/
│   │   ├── lib.rs
│   │   ├── document.rs   # Block, Node, Mark types
│   │   ├── schema.rs     # Schema definition & validation
│   │   ├── transform.rs  # Insert, delete, split, merge
│   │   ├── command.rs    # High-level editor commands
│   │   └── selection.rs  # TextSelection, BlockSelection
│   └── Cargo.toml
│
├── gotipe-schema/        # Schema DSL and type system
│   ├── src/
│   │   ├── lib.rs
│   │   ├── node_spec.rs  # NodeSpec trait and implementations
│   │   ├── mark_spec.rs  # MarkSpec trait
│   │   └── validate.rs   # Schema validation engine
│   └── Cargo.toml
│
├── gotipe-crdt/          # CRDT engine (Loro-inspired)
│   ├── src/
│   │   ├── lib.rs
│   │   ├── doc.rs        # CrdtDocument
│   │   ├── text.rs       # Rich text CRDT
│   │   ├── tree.rs       # Block tree CRDT (MovableTree)
│   │   ├── sync.rs       # Sync protocol (binary encoding)
│   │   ├── awareness.rs  # Presence, cursors
│   │   └── history.rs    # Undo/redo via CRDT versioning
│   └── Cargo.toml
│
├── gotipe-ai/            # AI context builder, provider interface
│   ├── src/
│   │   ├── lib.rs
│   │   ├── context.rs    # Document → LLM context
│   │   ├── provider.rs   # Provider trait
│   │   ├── suggestion.rs # Ghost text data structures
│   │   └── commands.rs   # Rewrite, expand, etc.
│   └── Cargo.toml
│
├── gotipe-export/        # Serialization & conversion
│   ├── src/
│   │   ├── lib.rs
│   │   ├── html.rs       # HTML ↔ Document
│   │   ├── markdown.rs   # Markdown ↔ Document
│   │   ├── json.rs       # JSON ↔ Document
│   │   ├── pdf.rs        # Document → PDF (via typst)
│   │   ├── docx.rs       # Document → DOCX (via docx-rs)
│   │   └── plaintext.rs  # Document → Plain text
│   └── Cargo.toml
│
└── gotipe-wasm/          # WASM bindings (wasm-bindgen)
    ├── src/
    │   ├── lib.rs        # #[wasm_bindgen] exports
    │   ├── editor.rs     # WasmEditor wrapper
    │   ├── types.rs      # JsValue conversions
    │   └── callbacks.rs  # JS callback bridges
    └── Cargo.toml
```

### wasm-bindgen API (key exports)

```rust
// crates/gotipe-wasm/src/lib.rs
use wasm_bindgen::prelude::*;
use gotipe_core::{Document, EditorState, Transaction, Schema};
use gotipe_crdt::CrdtDocument;

#[wasm_bindgen]
pub struct WasmEditor {
    state: EditorState,
    crdt: Option<CrdtDocument>,
    schema: Schema,
}

#[wasm_bindgen]
impl WasmEditor {
    #[wasm_bindgen(constructor)]
    pub fn new(schema_json: &str, doc_json: &str) -> Result<WasmEditor, JsError> {
        let schema = Schema::from_json(schema_json)?;
        let doc = Document::from_json(doc_json, &schema)?;
        let state = EditorState::new(doc, schema.clone());
        Ok(WasmEditor { state, crdt: None, schema })
    }

    /// Apply a transaction and return the new state as JSON
    #[wasm_bindgen]
    pub fn apply(&mut self, transaction_json: &str) -> Result<String, JsError> {
        let tr = Transaction::from_json(transaction_json, &self.schema)?;
        self.state = self.state.apply(tr)?;
        if let Some(crdt) = &mut self.crdt {
            crdt.apply_local(&self.state.last_steps())?;
        }
        Ok(self.state.doc().to_json())
    }

    /// Validate a document against the schema
    #[wasm_bindgen]
    pub fn validate(&self, doc_json: &str) -> Result<bool, JsError> {
        let doc = Document::from_json(doc_json, &self.schema)?;
        Ok(self.schema.validate(&doc).is_ok())
    }

    /// Enable CRDT collaboration
    #[wasm_bindgen]
    pub fn enable_collaboration(&mut self, peer_id: &str) -> Result<(), JsError> {
        let crdt = CrdtDocument::new(peer_id, self.state.doc().clone())?;
        self.crdt = Some(crdt);
        Ok(())
    }

    /// Receive remote CRDT update (binary)
    #[wasm_bindgen]
    pub fn receive_update(&mut self, update: &[u8]) -> Result<String, JsError> {
        let crdt = self.crdt.as_mut().ok_or(JsError::new("Collaboration not enabled"))?;
        crdt.apply_remote(update)?;
        self.state = EditorState::from_crdt(crdt, &self.schema)?;
        Ok(self.state.doc().to_json())
    }

    /// Get local CRDT update since last sync (binary)
    #[wasm_bindgen]
    pub fn get_update(&mut self) -> Result<Vec<u8>, JsError> {
        let crdt = self.crdt.as_mut().ok_or(JsError::new("Collaboration not enabled"))?;
        Ok(crdt.encode_update_since_last_sync())
    }

    /// Export document
    #[wasm_bindgen]
    pub fn export_html(&self) -> Result<String, JsError> {
        Ok(gotipe_export::to_html(self.state.doc())?)
    }

    #[wasm_bindgen]
    pub fn export_markdown(&self) -> Result<String, JsError> {
        Ok(gotipe_export::to_markdown(self.state.doc())?)
    }

    #[wasm_bindgen]
    pub fn export_json(&self) -> String {
        self.state.doc().to_json()
    }
}
```

---

## Document Model

### Comparison with ProseMirror

| Aspect | GoTipe | ProseMirror |
|--------|--------|-------------|
| **Paradigm** | Block-first (like Notion) | Node tree (generic) |
| **Top-level** | `Document → Block[]` | `Document → Node[]` (arbitrary nesting) |
| **Nesting** | Explicit: `children` field in Block | Implicit: via content expressions |
| **Schema** | Rust structs + JSON DSL | JS objects with content expressions |
| **Marks** | Flat set on a text span | Flat set on a text node |
| **CRDT** | Built into the model | External (Yjs adapter) |
| **Validation** | Compile-time (Rust) + Runtime | Runtime only |

### Block-based Document

```
Document
├── Block (heading, level: 1)
│   └── TextSpan ["GoTipe Architecture", marks: []]
├── Block (paragraph)
│   └── TextSpan ["This is ", marks: []]
│   └── TextSpan ["bold text", marks: [bold]]
│   └── TextSpan [" in a paragraph.", marks: []]
├── Block (bulletList)
│   ├── Block (listItem)
│   │   └── TextSpan ["First item", marks: []]
│   └── Block (listItem)
│       └── TextSpan ["Second item", marks: []]
│       └── Block (bulletList)          ← nested
│           └── Block (listItem)
│               └── TextSpan ["Nested item", marks: []]
└── Block (codeBlock, language: "rust")
    └── TextSpan ["fn main() {}", marks: []]
```

### Rust Types

```rust
// crates/gotipe-core/src/document.rs
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

/// Unique block identifier
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct BlockId(pub String);

/// Document — the root container
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub blocks: Vec<Block>,
    pub version: u64,
}

/// Block — the main unit of content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub id: BlockId,
    pub block_type: String,
    pub attrs: HashMap<String, AttrValue>,
    pub content: BlockContent,
    pub children: Vec<Block>,
}

/// Block content
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum BlockContent {
    /// Rich text content (paragraph, heading, list item, etc.)
    RichText(Vec<TextSpan>),
    /// No content (divider, image, embed)
    Empty,
    /// Raw text (code block)
    Raw(String),
}

/// Text span with marks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextSpan {
    pub text: String,
    pub marks: Vec<Mark>,
}

/// Mark — inline formatting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mark {
    pub mark_type: String,
    pub attrs: HashMap<String, AttrValue>,
}

/// Attribute value (typed)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AttrValue {
    String(String),
    Number(f64),
    Bool(bool),
    Null,
}
```

### JSON representation of a document

```json
{
  "version": 1,
  "blocks": [
    {
      "id": "b1",
      "type": "heading",
      "attrs": { "level": 1 },
      "content": [
        { "text": "Welcome to GoTipe", "marks": [] }
      ],
      "children": []
    },
    {
      "id": "b2",
      "type": "paragraph",
      "attrs": {},
      "content": [
        { "text": "A ", "marks": [] },
        { "text": "Rust-powered", "marks": [{ "type": "bold" }] },
        { "text": " editor framework.", "marks": [] }
      ],
      "children": []
    },
    {
      "id": "b3",
      "type": "bulletList",
      "attrs": {},
      "content": [],
      "children": [
        {
          "id": "b4",
          "type": "listItem",
          "attrs": { "checked": null },
          "content": [
            { "text": "CRDT collaboration", "marks": [] }
          ],
          "children": []
        }
      ]
    }
  ]
}
```

---

## State Management

### EditorState — immutable snapshot

```rust
// crates/gotipe-core/src/state.rs

#[derive(Debug, Clone)]
pub struct EditorState {
    doc: Document,
    selection: Selection,
    schema: Schema,
    plugins: Vec<PluginState>,
    last_steps: Vec<Step>,
}

impl EditorState {
    pub fn new(doc: Document, schema: Schema) -> Self {
        EditorState {
            selection: Selection::cursor(BlockId("b1".into()), 0),
            doc,
            schema,
            plugins: vec![],
            last_steps: vec![],
        }
    }

    /// Apply a transaction, returning a new state (immutable)
    pub fn apply(&self, tr: Transaction) -> Result<EditorState, TransformError> {
        // 1. Validate steps against schema
        for step in &tr.steps {
            self.schema.validate_step(step, &self.doc)?;
        }

        // 2. Apply steps to document
        let mut new_doc = self.doc.clone();
        let mut steps_applied = Vec::new();
        for step in tr.steps {
            new_doc = step.apply(new_doc)?;
            steps_applied.push(step);
        }

        // 3. Map selection through steps
        let new_selection = tr.selection.unwrap_or_else(|| {
            self.selection.map_through(&steps_applied)
        });

        // 4. Run plugin apply hooks
        let new_plugins = self.plugins.iter()
            .map(|p| p.apply(&tr, &new_doc))
            .collect();

        Ok(EditorState {
            doc: new_doc,
            selection: new_selection,
            schema: self.schema.clone(),
            plugins: new_plugins,
            last_steps: steps_applied,
        })
    }
}
```

### Transaction — a description of changes

```rust
// crates/gotipe-core/src/transaction.rs

#[derive(Debug, Clone)]
pub struct Transaction {
    pub steps: Vec<Step>,
    pub selection: Option<Selection>,
    pub metadata: HashMap<String, AttrValue>,
}

/// Atomic transformation step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Step {
    InsertText {
        block_id: BlockId,
        offset: usize,
        text: String,
        marks: Vec<Mark>,
    },
    DeleteText {
        block_id: BlockId,
        from: usize,
        to: usize,
    },
    InsertBlock {
        parent_id: Option<BlockId>,
        index: usize,
        block: Block,
    },
    DeleteBlock {
        block_id: BlockId,
    },
    MoveBlock {
        block_id: BlockId,
        new_parent_id: Option<BlockId>,
        new_index: usize,
    },
    SetBlockAttrs {
        block_id: BlockId,
        attrs: HashMap<String, AttrValue>,
    },
    SetBlockType {
        block_id: BlockId,
        new_type: String,
        attrs: HashMap<String, AttrValue>,
    },
    AddMark {
        block_id: BlockId,
        from: usize,
        to: usize,
        mark: Mark,
    },
    RemoveMark {
        block_id: BlockId,
        from: usize,
        to: usize,
        mark_type: String,
    },
    SplitBlock {
        block_id: BlockId,
        offset: usize,
    },
    MergeBlocks {
        block_id: BlockId,       // block that is merged upward
        target_id: BlockId,      // block it is merged into
    },
}
```

### Command Pattern

```rust
// crates/gotipe-core/src/command.rs

/// Command — a function that creates a Transaction from the current state
pub type Command = fn(&EditorState) -> Option<Transaction>;

/// Standard commands
pub mod commands {
    use super::*;

    pub fn toggle_bold(state: &EditorState) -> Option<Transaction> {
        let sel = state.selection().as_text()?;
        let has_bold = state.doc().has_mark_in_range(
            &sel.block_id, sel.from, sel.to, "bold"
        );

        let step = if has_bold {
            Step::RemoveMark {
                block_id: sel.block_id.clone(),
                from: sel.from,
                to: sel.to,
                mark_type: "bold".into(),
            }
        } else {
            Step::AddMark {
                block_id: sel.block_id.clone(),
                from: sel.from,
                to: sel.to,
                mark: Mark { mark_type: "bold".into(), attrs: HashMap::new() },
            }
        };

        Some(Transaction {
            steps: vec![step],
            selection: None,
            metadata: HashMap::new(),
        })
    }

    pub fn insert_block_after(
        state: &EditorState,
        block_type: &str,
    ) -> Option<Transaction> {
        let current_block_id = state.selection().block_id();
        let (parent_id, index) = state.doc().parent_and_index(current_block_id)?;
        let new_block = Block::new(block_type, &state.schema())?;

        Some(Transaction {
            steps: vec![Step::InsertBlock {
                parent_id,
                index: index + 1,
                block: new_block.clone(),
            }],
            selection: Some(Selection::cursor(new_block.id, 0)),
            metadata: HashMap::new(),
        })
    }

    pub fn delete_current_block(state: &EditorState) -> Option<Transaction> {
        let block_id = state.selection().block_id().clone();
        Some(Transaction {
            steps: vec![Step::DeleteBlock { block_id }],
            selection: None,
            metadata: HashMap::new(),
        })
    }
}
```

---

## Extension System

The extension architecture is described in detail in [05-extensions.md](05-extensions.md). Here are the key principles.

### Principle: everything is an extension

Even the basic block types (paragraph, heading, list) are implemented as extensions. The core engine knows nothing about concrete block types, only about Document, Block, TextSpan and Mark.

```rust
// crates/gotipe-core/src/extension.rs

pub trait Extension: Send + Sync {
    /// Unique extension name
    fn name(&self) -> &str;

    /// Schema nodes added by the extension
    fn nodes(&self) -> Vec<NodeSpec> { vec![] }

    /// Schema marks
    fn marks(&self) -> Vec<MarkSpec> { vec![] }

    /// Keyboard shortcuts
    fn keybindings(&self) -> Vec<(KeyBinding, Command)> { vec![] }

    /// Input rules (e.g. "# " → heading)
    fn input_rules(&self) -> Vec<InputRule> { vec![] }

    /// Paste rules
    fn paste_rules(&self) -> Vec<PasteRule> { vec![] }

    /// Lifecycle: extension loaded
    fn on_create(&self, _state: &EditorState) {}

    /// Lifecycle: state updated
    fn on_update(&self, _old: &EditorState, _new: &EditorState) {}

    /// Lifecycle: extension destroyed
    fn on_destroy(&self) {}

    /// Plugin state (for stateful extensions)
    fn plugin(&self) -> Option<Box<dyn Plugin>> { None }
}
```

### Extension registration (TypeScript API)

```typescript
// packages/core/src/editor.ts
import { createEditor } from '@gotipe/core';
import { Paragraph, Heading, BulletList, Bold, Italic } from '@gotipe/core/extensions';
import { Collaboration } from '@gotipe/collaboration';
import { AIInline } from '@gotipe/ai';

const editor = createEditor({
  extensions: [
    Paragraph,
    Heading.configure({ levels: [1, 2, 3] }),
    BulletList,
    Bold,
    Italic,
    Collaboration.configure({
      serverUrl: 'wss://sync.gotipe.com',
      documentId: 'doc-123',
    }),
    AIInline.configure({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
    }),
  ],
  content: initialDocument,
  onUpdate: ({ editor }) => {
    console.log('Document updated:', editor.getJSON());
  },
});
```

---

## Rendering

### Headless Core + Thin Adapter Layer

```
┌─────────────────────────────────────────────────────┐
│                    @gotipe/core                       │
│                                                     │
│  EditorState ──→ ViewState (block tree + decorations)│
│                                                     │
│  ViewState = {                                       │
│    blocks: BlockView[],                              │
│    decorations: Decoration[],                        │
│    selection: SelectionView,                         │
│  }                                                  │
│                                                     │
│  Events: onUpdate, onSelectionChange, onFocus, ...  │
└──────────────────────┬──────────────────────────────┘
                       │ ViewState (plain JS objects)
                       ▼
┌─────────────────────────────────────────────────────┐
│              Framework Adapter (React)               │
│                                                     │
│  ViewState → React elements                         │
│  DOM events → Commands → Transactions               │
│                                                     │
│  <Editor>                                           │
│    <BlockRenderer block={block}>                    │
│      <TextRenderer spans={block.content} />         │
│    </BlockRenderer>                                 │
│  </Editor>                                          │
└─────────────────────────────────────────────────────┘
```

**Key principle:** the core emits ViewState (plain JS objects) and the adapter converts it into framework-specific components. The core does not import React, Vue, etc.

### Virtual rendering for large documents

Documents with >1000 blocks use virtual rendering: only the visible blocks plus a buffer are rendered.

```typescript
// packages/core/src/virtual-renderer.ts
export interface VirtualRendererConfig {
  /** Viewport height in pixels */
  viewportHeight: number;
  /** Approximate height of a single block */
  estimatedBlockHeight: number;
  /** Number of buffer blocks above and below */
  overscan: number;
}

export function computeVisibleRange(
  scrollTop: number,
  config: VirtualRendererConfig,
  blockHeights: Map<string, number>,
): { startIndex: number; endIndex: number; offsetTop: number } {
  // Windowed rendering logic
  let accHeight = 0;
  let startIndex = 0;

  for (const [i, block] of blocks.entries()) {
    const h = blockHeights.get(block.id) ?? config.estimatedBlockHeight;
    if (accHeight + h > scrollTop - config.overscan * config.estimatedBlockHeight) {
      startIndex = i;
      break;
    }
    accHeight += h;
  }

  // ... compute endIndex similarly
  return { startIndex, endIndex, offsetTop: accHeight };
}
```

---

## Performance

### Benchmarks: GoTipe vs ProseMirror/Tiptap (target)

| Operation | ProseMirror (JS) | GoTipe (WASM) | Speedup |
|----------|------------------|---------------|---------|
| Parse 10K blocks from JSON | ~120ms | ~25ms | **4.8x** |
| Apply 1000 sequential inserts | ~85ms | ~18ms | **4.7x** |
| Schema validation (10K blocks) | ~45ms | ~8ms | **5.6x** |
| HTML export (10K blocks) | ~95ms | ~22ms | **4.3x** |
| CRDT merge (1000 ops) | ~180ms (Yjs) | ~90ms (Loro-inspired) | **2.0x** |
| Document serialize to JSON | ~30ms | ~7ms | **4.3x** |
| Initial load (WASM + parse) | N/A (JS) | ~50ms (WASM init) + ~25ms | ~75ms total |

**Methodology:** Chrome 120, M2 MacBook Pro, a document of 10K paragraphs of ~50 characters each. Benchmark code is in [03-editor-core.md#benchmarks](03-editor-core.md#benchmarks).

**Note:** WASM init (~50ms) is a one-time overhead at load. For subsequent operations GoTipe is consistently 2-5x faster.

### WASM Binary Size

| Component | Size (gzip) |
|-----------|------------|
| gotipe-core (schema, transforms, commands) | ~120KB |
| gotipe-crdt | ~80KB |
| gotipe-export (HTML + Markdown) | ~40KB |
| gotipe-ai (context builder) | ~15KB |
| **Total (without PDF/DOCX)** | **~255KB** |
| gotipe-export-pdf (typst) | ~400KB (lazy load) |
| gotipe-export-docx | ~60KB (lazy load) |

For comparison: ProseMirror core is ~40KB gzip, Tiptap + ProseMirror ~90KB gzip, Yjs ~20KB gzip. The GoTipe WASM binary is larger, but it includes CRDT, validation and export, which in the Tiptap ecosystem take 3-4 separate packages.

---

## Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| WASM not supported | Fallback to a JS polyfill (slower, but works). `@gotipe/core-js` is the pure-JS fallback. |
| WebSocket unavailable | Offline mode: all changes are saved in the CRDT. Sync on reconnect. |
| AI provider unavailable | The editor works without AI features. Ghost text is not shown. |
| Export service unavailable | HTML and Markdown export work in WASM (client-side). PDF/DOCX — graceful error. |

```typescript
// packages/core/src/init.ts
export async function initGoTipe(): Promise<GoTipeEngine> {
  try {
    // Try to load WASM
    const wasm = await import('@gotipe/wasm');
    await wasm.default(); // init WASM
    return new WasmEngine(wasm);
  } catch (e) {
    console.warn('GoTipe: WASM not available, falling back to JS engine');
    const js = await import('@gotipe/core-js');
    return new JsEngine(js);
  }
}
```

---

## Cost Analysis

### Infrastructure costs (self-hosted, 1000 concurrent users)

| Component | Hetzner VDS (recommended) | Cost |
|-----------|---------------------------|-----------|
| Hetzner CX32 (4 vCPU, 8 GB RAM, 80 GB NVMe) | Go API + PostgreSQL + Valkey + Caddy | ~EUR 7/mo |
| Cloudflare R2 (CRDT snapshots, exports, assets) | 10 GB storage, zero egress | ~$0.15/mo |
| Cloudflare R2 (backups) | pgBackRest WAL + full backups | ~$0.50/mo |
| **Total** | | **~EUR 8/mo** |

For comparison: Tiptap Cloud for 1000 documents = **$49/mo** (sync only, no AI/export). GoTipe self-hosted on Hetzner = **~EUR 8/mo** for everything.

### Development Effort

| Component | Person-months | Dependencies | License |
|-----------|--------------|-------------|----------|
| Rust core (schema, transforms, commands) | 3 | — | MIT |
| WASM bindings | 1 | Rust core | MIT |
| CRDT engine | 2 | Rust core | MIT |
| React adapter | 1.5 | WASM bindings | MIT |
| Block editor UX (slash commands, DnD, toolbar) | 2 | React adapter | **Commercial** |
| Block Editor license system (JWT, watermark) | 0.5 | Core | **Commercial** |
| AI integration | 1 | WASM bindings | MIT |
| Export (HTML, MD, PDF) | 1.5 | Rust core | MIT |
| Sync server (Go) | 1.5 | CRDT engine | MIT |
| Cloud API | 1 | Sync server | Proprietary |
| Documentation site (Mintlify) | 0.5 | All | — |
| **Total** | **~16.5 person-months** | | |

> **Monetization model:** The headless core (MIT) is free. The Block Editor UI (`@gotipe/block-editor`) has a commercial license ($149/app/year). Cloud is a subscription ($29+/mo, Block Editor included). Details in [00-overview.md#monetization](00-overview.md) and [12-release-plan.md#pricing](12-release-plan.md).

Detailed plan in [12-release-plan.md](12-release-plan.md).
