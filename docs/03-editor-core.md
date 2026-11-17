# GoTipe — Editor Core (Rust/WASM)

> **PDF: historical proposal.** The mentions of Typst/docx-rs and the size and capability
> estimates below do not describe the current backend. GoTipe owns PDF layout and
> OOXML rendering; see the [export contract](development/export-contract.md)
> and the [dependency policy](development/dependencies.md) for what is current.

> **Historical specification, not a guide to the current API.** The examples, timelines,
> performance comparisons, commercial terms and promises below do not confirm an
> implementation or service availability. Current: [contracts](development/editor-contracts.md),
> [code map](development/code-map.md), [checks](development/testing.md),
> [release plan](22-release-readiness.md). Licenses are defined by `LICENSE` and each
> package's manifest, not by this document.

## Overview

Editor Core is the set of Rust crates holding all of the editor's business logic: document model, schema engine, transforms, commands, history, serialization. It compiles to WebAssembly for the browser and runs natively on the server.

```
┌─────────────────────────────────────────────────────────┐
│                    gotipe-wasm                            │
│              (wasm-bindgen exports)                       │
│                        │                                 │
│    ┌──────────────────┼──────────────────────┐          │
│    │                  │                      │          │
│    ▼                  ▼                      ▼          │
│ gotipe-core      gotipe-crdt           gotipe-export    │
│ ┌──────────┐    ┌──────────┐          ┌──────────┐     │
│ │ Document │    │ CRDT Doc │          │ HTML     │     │
│ │ Schema   │    │ Sync     │          │ Markdown │     │
│ │ Transform│    │ Awareness│          │ PDF      │     │
│ │ Command  │    │ History  │          │ DOCX     │     │
│ │ Selection│    └──────────┘          │ JSON     │     │
│ └────┬─────┘                          └──────────┘     │
│      │                                                   │
│      ▼                                                   │
│ gotipe-schema                                            │
│ ┌───────────┐                                           │
│ │ NodeSpec  │                                           │
│ │ MarkSpec  │                                           │
│ │ Validate  │                                           │
│ └───────────┘                                           │
└─────────────────────────────────────────────────────────┘
```

---

## Crate Structure

### Cargo Workspace

```toml
# Cargo.toml (workspace root)
[workspace]
resolver = "2"
members = [
    "crates/gotipe-core",
    "crates/gotipe-schema",
    "crates/gotipe-crdt",
    "crates/gotipe-ai",
    "crates/gotipe-export",
    "crates/gotipe-wasm",
]

[workspace.dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
thiserror = "2.0"
wasm-bindgen = "0.2"
```

### Dependencies between crates

```
gotipe-schema ◄──── gotipe-core ◄──── gotipe-wasm
                         │                  │
                         ▼                  │
                    gotipe-crdt ◄───────────┤
                                            │
                    gotipe-ai ◄─────────────┤
                                            │
                    gotipe-export ◄──────────┘
```

| Crate | Depends on | Purpose |
|-------|-----------|---------|
| `gotipe-schema` | serde | Node/Mark type definitions, validation rules |
| `gotipe-core` | gotipe-schema, serde | Document, EditorState, Transform, Command, Selection |
| `gotipe-crdt` | gotipe-core | CRDT engine, sync protocol, awareness |
| `gotipe-ai` | gotipe-core | AI context builder, provider interface, suggestion types |
| `gotipe-export` | gotipe-core, typst, docx-rs | HTML, Markdown, PDF, DOCX conversion |
| `gotipe-wasm` | all above, wasm-bindgen | WASM bindings, JS API surface |

---

## Document Schema

### Schema DSL

Schema defines the allowed node types, mark types and validation rules.

```rust
// crates/gotipe-schema/src/lib.rs

use serde::{Serialize, Deserialize};
use std::collections::HashMap;

/// Schema: a set of rules for validating a document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schema {
    pub nodes: HashMap<String, NodeSpec>,
    pub marks: HashMap<String, MarkSpec>,
}

/// NodeSpec: definition of a block type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeSpec {
    /// Type name (e.g. "paragraph", "heading")
    pub name: String,

    /// Groups this node belongs to (e.g. "block", "inline")
    pub group: Vec<String>,

    /// Which content is allowed
    pub content: ContentRule,

    /// Attributes with default values and validation
    pub attrs: HashMap<String, AttrSpec>,

    /// Whether it can be a top-level block
    pub top_level: bool,

    /// Whether it allows inline marks
    pub marks_allowed: MarksRule,

    /// Whether it is a leaf node (no children)
    pub leaf: bool,

    /// Whether it can contain nested blocks (children)
    pub allows_children: bool,

    /// Allowed child types
    pub child_types: Option<Vec<String>>,
}

/// Rule for content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ContentRule {
    /// Rich text (TextSpan[])
    RichText,
    /// Raw text (code, formulas)
    RawText,
    /// No content (divider, image)
    Empty,
}

/// Rule for marks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MarksRule {
    /// All marks are allowed
    All,
    /// A specific set of marks
    Only(Vec<String>),
    /// Marks are forbidden
    None,
}

/// Attribute with a type and a default
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

/// MarkSpec: definition of inline formatting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarkSpec {
    pub name: String,
    /// Whether the mark can overlap with other marks of this type
    pub exclusive_group: Option<String>,
    /// Attributes (e.g. href for link)
    pub attrs: HashMap<String, AttrSpec>,
    /// Rendering priority (nesting order in HTML)
    pub rank: u32,
}
```

### Default Schema (built-in blocks)

```rust
// crates/gotipe-schema/src/defaults.rs

impl Schema {
    /// Default schema with Notion-like block types
    pub fn default_block_editor() -> Self {
        let mut nodes = HashMap::new();
        let mut marks = HashMap::new();

        // === Nodes ===

        nodes.insert("paragraph".into(), NodeSpec {
            name: "paragraph".into(),
            group: vec!["block".into()],
            content: ContentRule::RichText,
            attrs: HashMap::new(),
            top_level: true,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: false,
            child_types: None,
        });

        nodes.insert("heading".into(), NodeSpec {
            name: "heading".into(),
            group: vec!["block".into()],
            content: ContentRule::RichText,
            attrs: HashMap::from([
                ("level".into(), AttrSpec {
                    attr_type: AttrType::Enum(
                        vec!["1","2","3","4","5","6"].into_iter().map(String::from).collect()
                    ),
                    default: Some(AttrValue::Number(1.0)),
                    required: true,
                }),
            ]),
            top_level: true,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: false,
            child_types: None,
        });

        nodes.insert("bulletList".into(), NodeSpec {
            name: "bulletList".into(),
            group: vec!["block".into(), "list".into()],
            content: ContentRule::Empty,
            attrs: HashMap::new(),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["listItem".into()]),
        });

        nodes.insert("orderedList".into(), NodeSpec {
            name: "orderedList".into(),
            group: vec!["block".into(), "list".into()],
            content: ContentRule::Empty,
            attrs: HashMap::from([
                ("start".into(), AttrSpec {
                    attr_type: AttrType::Number,
                    default: Some(AttrValue::Number(1.0)),
                    required: false,
                }),
            ]),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["listItem".into()]),
        });

        nodes.insert("listItem".into(), NodeSpec {
            name: "listItem".into(),
            group: vec!["listChild".into()],
            content: ContentRule::RichText,
            attrs: HashMap::from([
                ("checked".into(), AttrSpec {
                    attr_type: AttrType::Bool,
                    default: None, // null = not a todo item
                    required: false,
                }),
            ]),
            top_level: false,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["bulletList".into(), "orderedList".into()]),
        });

        nodes.insert("codeBlock".into(), NodeSpec {
            name: "codeBlock".into(),
            group: vec!["block".into()],
            content: ContentRule::RawText,
            attrs: HashMap::from([
                ("language".into(), AttrSpec {
                    attr_type: AttrType::String,
                    default: Some(AttrValue::String("plain".into())),
                    required: false,
                }),
            ]),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: false,
            child_types: None,
        });

        nodes.insert("image".into(), NodeSpec {
            name: "image".into(),
            group: vec!["block".into()],
            content: ContentRule::Empty,
            attrs: HashMap::from([
                ("src".into(), AttrSpec {
                    attr_type: AttrType::String,
                    default: None,
                    required: true,
                }),
                ("alt".into(), AttrSpec {
                    attr_type: AttrType::String,
                    default: Some(AttrValue::String("".into())),
                    required: false,
                }),
                ("width".into(), AttrSpec {
                    attr_type: AttrType::Number,
                    default: None,
                    required: false,
                }),
            ]),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: true,
            allows_children: false,
            child_types: None,
        });

        nodes.insert("blockquote".into(), NodeSpec {
            name: "blockquote".into(),
            group: vec!["block".into()],
            content: ContentRule::RichText,
            attrs: HashMap::new(),
            top_level: true,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["paragraph".into()]),
        });

        nodes.insert("divider".into(), NodeSpec {
            name: "divider".into(),
            group: vec!["block".into()],
            content: ContentRule::Empty,
            attrs: HashMap::new(),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: true,
            allows_children: false,
            child_types: None,
        });

        nodes.insert("callout".into(), NodeSpec {
            name: "callout".into(),
            group: vec!["block".into()],
            content: ContentRule::RichText,
            attrs: HashMap::from([
                ("emoji".into(), AttrSpec {
                    attr_type: AttrType::String,
                    default: Some(AttrValue::String("💡".into())),
                    required: false,
                }),
            ]),
            top_level: true,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["paragraph".into()]),
        });

        nodes.insert("table".into(), NodeSpec {
            name: "table".into(),
            group: vec!["block".into()],
            content: ContentRule::Empty,
            attrs: HashMap::new(),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["tableRow".into()]),
        });

        nodes.insert("tableRow".into(), NodeSpec {
            name: "tableRow".into(),
            group: vec!["tableChild".into()],
            content: ContentRule::Empty,
            attrs: HashMap::new(),
            top_level: false,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["tableCell".into(), "tableHeader".into()]),
        });

        nodes.insert("tableCell".into(), NodeSpec {
            name: "tableCell".into(),
            group: vec!["tableChild".into()],
            content: ContentRule::RichText,
            attrs: HashMap::from([
                ("colspan".into(), AttrSpec {
                    attr_type: AttrType::Number,
                    default: Some(AttrValue::Number(1.0)),
                    required: false,
                }),
                ("rowspan".into(), AttrSpec {
                    attr_type: AttrType::Number,
                    default: Some(AttrValue::Number(1.0)),
                    required: false,
                }),
            ]),
            top_level: false,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: false,
            child_types: None,
        });

        nodes.insert("tableHeader".into(), NodeSpec {
            name: "tableHeader".into(),
            group: vec!["tableChild".into()],
            content: ContentRule::RichText,
            attrs: HashMap::from([
                ("colspan".into(), AttrSpec {
                    attr_type: AttrType::Number,
                    default: Some(AttrValue::Number(1.0)),
                    required: false,
                }),
                ("rowspan".into(), AttrSpec {
                    attr_type: AttrType::Number,
                    default: Some(AttrValue::Number(1.0)),
                    required: false,
                }),
            ]),
            top_level: false,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: false,
            child_types: None,
        });

        nodes.insert("toggle".into(), NodeSpec {
            name: "toggle".into(),
            group: vec!["block".into()],
            content: ContentRule::RichText,
            attrs: HashMap::from([
                ("open".into(), AttrSpec {
                    attr_type: AttrType::Bool,
                    default: Some(AttrValue::Bool(false)),
                    required: false,
                }),
            ]),
            top_level: true,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["paragraph".into(), "bulletList".into(), "orderedList".into()]),
        });

        nodes.insert("columns".into(), NodeSpec {
            name: "columns".into(),
            group: vec!["block".into()],
            content: ContentRule::Empty,
            attrs: HashMap::new(),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["column".into()]),
        });

        nodes.insert("column".into(), NodeSpec {
            name: "column".into(),
            group: vec!["columnChild".into()],
            content: ContentRule::Empty,
            attrs: HashMap::from([
                ("width".into(), AttrSpec {
                    attr_type: AttrType::Number,
                    default: None,
                    required: false,
                }),
            ]),
            top_level: false,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: true,
            child_types: None, // any block type
        });

        nodes.insert("embed".into(), NodeSpec {
            name: "embed".into(),
            group: vec!["block".into()],
            content: ContentRule::Empty,
            attrs: HashMap::from([
                ("url".into(), AttrSpec {
                    attr_type: AttrType::String,
                    default: None,
                    required: true,
                }),
                ("type".into(), AttrSpec {
                    attr_type: AttrType::Enum(vec![
                        "youtube".into(), "vimeo".into(), "twitter".into(),
                        "codepen".into(), "figma".into(), "generic".into(),
                    ]),
                    default: Some(AttrValue::String("generic".into())),
                    required: false,
                }),
            ]),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: true,
            allows_children: false,
            child_types: None,
        });

        nodes.insert("math".into(), NodeSpec {
            name: "math".into(),
            group: vec!["block".into()],
            content: ContentRule::RawText,
            attrs: HashMap::new(),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: false,
            child_types: None,
        });

        nodes.insert("file".into(), NodeSpec {
            name: "file".into(),
            group: vec!["block".into()],
            content: ContentRule::Empty,
            attrs: HashMap::from([
                ("url".into(), AttrSpec {
                    attr_type: AttrType::String,
                    default: None,
                    required: true,
                }),
                ("name".into(), AttrSpec {
                    attr_type: AttrType::String,
                    default: None,
                    required: true,
                }),
                ("size".into(), AttrSpec {
                    attr_type: AttrType::Number,
                    default: None,
                    required: false,
                }),
                ("mime_type".into(), AttrSpec {
                    attr_type: AttrType::String,
                    default: None,
                    required: false,
                }),
            ]),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: true,
            allows_children: false,
            child_types: None,
        });

        // === Marks ===

        marks.insert("bold".into(), MarkSpec {
            name: "bold".into(),
            exclusive_group: None,
            attrs: HashMap::new(),
            rank: 10,
        });

        marks.insert("italic".into(), MarkSpec {
            name: "italic".into(),
            exclusive_group: None,
            attrs: HashMap::new(),
            rank: 20,
        });

        marks.insert("underline".into(), MarkSpec {
            name: "underline".into(),
            exclusive_group: None,
            attrs: HashMap::new(),
            rank: 30,
        });

        marks.insert("strikethrough".into(), MarkSpec {
            name: "strikethrough".into(),
            exclusive_group: None,
            attrs: HashMap::new(),
            rank: 40,
        });

        marks.insert("code".into(), MarkSpec {
            name: "code".into(),
            exclusive_group: Some("code".into()),
            attrs: HashMap::new(),
            rank: 50,
        });

        marks.insert("link".into(), MarkSpec {
            name: "link".into(),
            exclusive_group: None,
            attrs: HashMap::from([
                ("href".into(), AttrSpec {
                    attr_type: AttrType::String,
                    default: None,
                    required: true,
                }),
                ("target".into(), AttrSpec {
                    attr_type: AttrType::String,
                    default: Some(AttrValue::String("_blank".into())),
                    required: false,
                }),
            ]),
            rank: 60,
        });

        marks.insert("highlight".into(), MarkSpec {
            name: "highlight".into(),
            exclusive_group: None,
            attrs: HashMap::from([
                ("color".into(), AttrSpec {
                    attr_type: AttrType::String,
                    default: Some(AttrValue::String("yellow".into())),
                    required: false,
                }),
            ]),
            rank: 5,
        });

        marks.insert("superscript".into(), MarkSpec {
            name: "superscript".into(),
            exclusive_group: Some("script".into()),
            attrs: HashMap::new(),
            rank: 70,
        });

        marks.insert("subscript".into(), MarkSpec {
            name: "subscript".into(),
            exclusive_group: Some("script".into()),
            attrs: HashMap::new(),
            rank: 80,
        });

        Schema { nodes, marks }
    }
}
```

### Schema Validation

```rust
// crates/gotipe-schema/src/validate.rs

impl Schema {
    /// Validate entire document against schema
    pub fn validate(&self, doc: &Document) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();

        for block in doc.flatten() {
            // 1. Check block type exists in schema
            let spec = match self.nodes.get(&block.block_type) {
                Some(s) => s,
                None => {
                    errors.push(ValidationError::UnknownBlockType {
                        block_id: block.id.clone(),
                        block_type: block.block_type.clone(),
                    });
                    continue;
                }
            };

            // 2. Validate attributes
            for (key, attr_spec) in &spec.attrs {
                if attr_spec.required && !block.attrs.contains_key(key) {
                    errors.push(ValidationError::MissingAttribute {
                        block_id: block.id.clone(),
                        attr: key.clone(),
                    });
                }
            }

            // Check for unknown attributes
            for key in block.attrs.keys() {
                if !spec.attrs.contains_key(key) {
                    errors.push(ValidationError::UnknownAttribute {
                        block_id: block.id.clone(),
                        attr: key.clone(),
                    });
                }
            }

            // 3. Validate content type
            match (&spec.content, &block.content) {
                (ContentRule::RichText, BlockContent::RichText(_)) => {},
                (ContentRule::RawText, BlockContent::Raw(_)) => {},
                (ContentRule::Empty, BlockContent::Empty) => {},
                _ => {
                    errors.push(ValidationError::InvalidContent {
                        block_id: block.id.clone(),
                        expected: format!("{:?}", spec.content),
                    });
                }
            }

            // 4. Validate marks
            if let BlockContent::RichText(spans) = &block.content {
                for span in spans {
                    for mark in &span.marks {
                        // Check mark exists in schema
                        if !self.marks.contains_key(&mark.mark_type) {
                            errors.push(ValidationError::UnknownMark {
                                block_id: block.id.clone(),
                                mark_type: mark.mark_type.clone(),
                            });
                        }
                        // Check mark is allowed on this block type
                        match &spec.marks_allowed {
                            MarksRule::None => {
                                errors.push(ValidationError::MarkNotAllowed {
                                    block_id: block.id.clone(),
                                    mark_type: mark.mark_type.clone(),
                                });
                            }
                            MarksRule::Only(allowed) if !allowed.contains(&mark.mark_type) => {
                                errors.push(ValidationError::MarkNotAllowed {
                                    block_id: block.id.clone(),
                                    mark_type: mark.mark_type.clone(),
                                });
                            }
                            _ => {}
                        }
                    }
                }
            }

            // 5. Validate children
            if !block.children.is_empty() && !spec.allows_children {
                errors.push(ValidationError::ChildrenNotAllowed {
                    block_id: block.id.clone(),
                });
            }

            if let Some(child_types) = &spec.child_types {
                for child in &block.children {
                    if !child_types.contains(&child.block_type) {
                        errors.push(ValidationError::InvalidChildType {
                            parent_id: block.id.clone(),
                            child_id: child.id.clone(),
                            child_type: child.block_type.clone(),
                        });
                    }
                }
            }
        }

        if errors.is_empty() { Ok(()) } else { Err(errors) }
    }

    /// Validate a single step against schema
    pub fn validate_step(&self, step: &Step, doc: &Document) -> Result<(), ValidationError> {
        match step {
            Step::InsertBlock { block, .. } => {
                if !self.nodes.contains_key(&block.block_type) {
                    return Err(ValidationError::UnknownBlockType {
                        block_id: block.id.clone(),
                        block_type: block.block_type.clone(),
                    });
                }
                Ok(())
            }
            Step::AddMark { mark, block_id, .. } => {
                let block = doc.find_block(block_id)
                    .ok_or(ValidationError::BlockNotFound { block_id: block_id.clone() })?;
                let spec = self.nodes.get(&block.block_type)
                    .ok_or(ValidationError::UnknownBlockType {
                        block_id: block_id.clone(),
                        block_type: block.block_type.clone(),
                    })?;
                match &spec.marks_allowed {
                    MarksRule::None => Err(ValidationError::MarkNotAllowed {
                        block_id: block_id.clone(),
                        mark_type: mark.mark_type.clone(),
                    }),
                    MarksRule::Only(allowed) if !allowed.contains(&mark.mark_type) => {
                        Err(ValidationError::MarkNotAllowed {
                            block_id: block_id.clone(),
                            mark_type: mark.mark_type.clone(),
                        })
                    }
                    _ => Ok(()),
                }
            }
            _ => Ok(()),
        }
    }
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum ValidationError {
    #[error("Unknown block type '{block_type}' in block {block_id:?}")]
    UnknownBlockType { block_id: BlockId, block_type: String },

    #[error("Missing required attribute '{attr}' in block {block_id:?}")]
    MissingAttribute { block_id: BlockId, attr: String },

    #[error("Unknown attribute '{attr}' in block {block_id:?}")]
    UnknownAttribute { block_id: BlockId, attr: String },

    #[error("Invalid content in block {block_id:?}, expected {expected}")]
    InvalidContent { block_id: BlockId, expected: String },

    #[error("Unknown mark '{mark_type}' in block {block_id:?}")]
    UnknownMark { block_id: BlockId, mark_type: String },

    #[error("Mark '{mark_type}' not allowed in block {block_id:?}")]
    MarkNotAllowed { block_id: BlockId, mark_type: String },

    #[error("Children not allowed in block {block_id:?}")]
    ChildrenNotAllowed { block_id: BlockId },

    #[error("Invalid child type '{child_type}' in block {parent_id:?}")]
    InvalidChildType { parent_id: BlockId, child_id: BlockId, child_type: String },

    #[error("Block not found: {block_id:?}")]
    BlockNotFound { block_id: BlockId },
}
```

---

## Transforms

Each `Step` is an atomic document transformation. Steps are composable: Transaction = Vec<Step>.

### Step Implementations

```rust
// crates/gotipe-core/src/transform.rs

impl Step {
    /// Apply step to document, return new document
    pub fn apply(&self, mut doc: Document) -> Result<Document, TransformError> {
        match self {
            Step::InsertText { block_id, offset, text, marks } => {
                let block = doc.find_block_mut(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;

                match &mut block.content {
                    BlockContent::RichText(spans) => {
                        insert_text_at(spans, *offset, text, marks)?;
                    }
                    BlockContent::Raw(raw) => {
                        if *offset > raw.len() {
                            return Err(TransformError::OffsetOutOfRange);
                        }
                        raw.insert_str(*offset, text);
                    }
                    BlockContent::Empty => {
                        return Err(TransformError::InvalidContentType);
                    }
                }
                doc.version += 1;
                Ok(doc)
            }

            Step::DeleteText { block_id, from, to } => {
                let block = doc.find_block_mut(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;

                match &mut block.content {
                    BlockContent::RichText(spans) => {
                        delete_text_range(spans, *from, *to)?;
                    }
                    BlockContent::Raw(raw) => {
                        if *to > raw.len() {
                            return Err(TransformError::OffsetOutOfRange);
                        }
                        raw.drain(*from..*to);
                    }
                    BlockContent::Empty => {
                        return Err(TransformError::InvalidContentType);
                    }
                }
                doc.version += 1;
                Ok(doc)
            }

            Step::InsertBlock { parent_id, index, block } => {
                if let Some(parent_id) = parent_id {
                    let parent = doc.find_block_mut(parent_id)
                        .ok_or(TransformError::BlockNotFound(parent_id.clone()))?;
                    let idx = (*index).min(parent.children.len());
                    parent.children.insert(idx, block.clone());
                } else {
                    let idx = (*index).min(doc.blocks.len());
                    doc.blocks.insert(idx, block.clone());
                }
                doc.version += 1;
                Ok(doc)
            }

            Step::DeleteBlock { block_id } => {
                doc.remove_block(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
                doc.version += 1;
                Ok(doc)
            }

            Step::MoveBlock { block_id, new_parent_id, new_index } => {
                let block = doc.remove_block(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;

                if let Some(parent_id) = new_parent_id {
                    let parent = doc.find_block_mut(parent_id)
                        .ok_or(TransformError::BlockNotFound(parent_id.clone()))?;
                    let idx = (*new_index).min(parent.children.len());
                    parent.children.insert(idx, block);
                } else {
                    let idx = (*new_index).min(doc.blocks.len());
                    doc.blocks.insert(idx, block);
                }
                doc.version += 1;
                Ok(doc)
            }

            Step::SetBlockAttrs { block_id, attrs } => {
                let block = doc.find_block_mut(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
                for (k, v) in attrs {
                    block.attrs.insert(k.clone(), v.clone());
                }
                doc.version += 1;
                Ok(doc)
            }

            Step::SetBlockType { block_id, new_type, attrs } => {
                let block = doc.find_block_mut(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
                block.block_type = new_type.clone();
                block.attrs = attrs.clone();
                doc.version += 1;
                Ok(doc)
            }

            Step::AddMark { block_id, from, to, mark } => {
                let block = doc.find_block_mut(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
                if let BlockContent::RichText(spans) = &mut block.content {
                    add_mark_to_range(spans, *from, *to, mark)?;
                }
                doc.version += 1;
                Ok(doc)
            }

            Step::RemoveMark { block_id, from, to, mark_type } => {
                let block = doc.find_block_mut(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
                if let BlockContent::RichText(spans) = &mut block.content {
                    remove_mark_from_range(spans, *from, *to, mark_type)?;
                }
                doc.version += 1;
                Ok(doc)
            }

            Step::SplitBlock { block_id, offset } => {
                split_block_at(&mut doc, block_id, *offset)?;
                doc.version += 1;
                Ok(doc)
            }

            Step::MergeBlocks { block_id, target_id } => {
                merge_blocks(&mut doc, target_id, block_id)?;
                doc.version += 1;
                Ok(doc)
            }
        }
    }
}

/// Helper: insert text into spans at a character offset
fn insert_text_at(
    spans: &mut Vec<TextSpan>,
    offset: usize,
    text: &str,
    marks: &[Mark],
) -> Result<(), TransformError> {
    let mut current_offset = 0;

    for i in 0..spans.len() {
        let span_len = spans[i].text.len();

        if current_offset + span_len >= offset {
            let local_offset = offset - current_offset;

            // Check if marks match — if so, just insert into existing span
            if spans[i].marks == *marks {
                spans[i].text.insert_str(local_offset, text);
                return Ok(());
            }

            // Otherwise, split span and insert new one
            let after = spans[i].text.split_off(local_offset);
            let new_span = TextSpan {
                text: text.to_string(),
                marks: marks.to_vec(),
            };

            let after_span = TextSpan {
                text: after,
                marks: spans[i].marks.clone(),
            };

            spans.insert(i + 1, new_span);
            spans.insert(i + 2, after_span);
            return Ok(());
        }

        current_offset += span_len;
    }

    // Append at end
    spans.push(TextSpan {
        text: text.to_string(),
        marks: marks.to_vec(),
    });
    Ok(())
}
```

---

## Commands

The full list of built-in commands: high-level operations that create Transactions.

```rust
// crates/gotipe-core/src/command.rs

pub mod commands {
    /// Text formatting
    pub fn toggle_bold(state: &EditorState) -> Option<Transaction>;
    pub fn toggle_italic(state: &EditorState) -> Option<Transaction>;
    pub fn toggle_underline(state: &EditorState) -> Option<Transaction>;
    pub fn toggle_strikethrough(state: &EditorState) -> Option<Transaction>;
    pub fn toggle_code(state: &EditorState) -> Option<Transaction>;
    pub fn toggle_highlight(state: &EditorState, color: &str) -> Option<Transaction>;
    pub fn set_link(state: &EditorState, href: &str) -> Option<Transaction>;
    pub fn remove_link(state: &EditorState) -> Option<Transaction>;

    /// Block operations
    pub fn set_block_type(state: &EditorState, block_type: &str, attrs: HashMap<String, AttrValue>) -> Option<Transaction>;
    pub fn insert_block_after(state: &EditorState, block_type: &str) -> Option<Transaction>;
    pub fn insert_block_before(state: &EditorState, block_type: &str) -> Option<Transaction>;
    pub fn delete_block(state: &EditorState) -> Option<Transaction>;
    pub fn move_block_up(state: &EditorState) -> Option<Transaction>;
    pub fn move_block_down(state: &EditorState) -> Option<Transaction>;
    pub fn duplicate_block(state: &EditorState) -> Option<Transaction>;

    /// List operations
    pub fn toggle_bullet_list(state: &EditorState) -> Option<Transaction>;
    pub fn toggle_ordered_list(state: &EditorState) -> Option<Transaction>;
    pub fn toggle_todo_list(state: &EditorState) -> Option<Transaction>;
    pub fn indent(state: &EditorState) -> Option<Transaction>;  // Tab
    pub fn outdent(state: &EditorState) -> Option<Transaction>; // Shift+Tab

    /// Block splitting / merging
    pub fn split_block(state: &EditorState) -> Option<Transaction>; // Enter
    pub fn merge_with_previous(state: &EditorState) -> Option<Transaction>; // Backspace at start
    pub fn insert_hard_break(state: &EditorState) -> Option<Transaction>; // Shift+Enter

    /// Selection
    pub fn select_all(state: &EditorState) -> Option<Transaction>;
    pub fn select_block(state: &EditorState) -> Option<Transaction>;

    /// Clipboard
    pub fn cut(state: &EditorState) -> Option<(Transaction, ClipboardData)>;
    pub fn copy(state: &EditorState) -> Option<ClipboardData>;
    pub fn paste(state: &EditorState, data: &ClipboardData) -> Option<Transaction>;
}
```

---

## History (Undo/Redo)

Undo/Redo is implemented through CRDT history rather than a separate command stack. This gives correct undo in collaborative editing.

```rust
// crates/gotipe-crdt/src/history.rs

pub struct CrdtHistory {
    /// Stack of undo items (local operations only)
    undo_stack: Vec<HistoryItem>,
    /// Stack of redo items
    redo_stack: Vec<HistoryItem>,
    /// Max items in undo stack
    max_items: usize,
    /// Group timeout: operations within this window are grouped
    group_timeout_ms: u64,
    last_operation_time: u64,
}

struct HistoryItem {
    /// CRDT operations to undo
    operations: Vec<CrdtOp>,
    /// Inverse operations (to apply for undo)
    inverse: Vec<CrdtOp>,
    /// Timestamp
    timestamp: u64,
    /// Selection before the operation
    selection: Selection,
}

impl CrdtHistory {
    pub fn new() -> Self {
        CrdtHistory {
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            max_items: 100,
            group_timeout_ms: 500,
            last_operation_time: 0,
        }
    }

    /// Record a local operation (only local ops are undoable)
    pub fn record(&mut self, ops: Vec<CrdtOp>) {
        let now = current_time_ms();
        let inverse = ops.iter().map(|op| op.inverse()).collect();

        // Group with previous if within timeout
        if now - self.last_operation_time < self.group_timeout_ms {
            if let Some(last) = self.undo_stack.last_mut() {
                last.operations.extend(ops);
                last.inverse.extend(inverse);
                self.last_operation_time = now;
                return;
            }
        }

        self.undo_stack.push(HistoryItem {
            operations: ops,
            inverse,
            timestamp: now,
            selection: Selection::default(), // captured externally
        });

        // Clear redo stack on new operation
        self.redo_stack.clear();

        // Trim undo stack
        if self.undo_stack.len() > self.max_items {
            self.undo_stack.remove(0);
        }

        self.last_operation_time = now;
    }

    /// Undo: return inverse operations to apply
    pub fn undo(&mut self) -> Option<(Vec<CrdtOp>, Selection)> {
        let item = self.undo_stack.pop()?;
        let inverse = item.inverse.clone();
        let selection = item.selection.clone();
        self.redo_stack.push(item);
        Some((inverse, selection))
    }

    /// Redo: return original operations to re-apply
    pub fn redo(&mut self) -> Option<(Vec<CrdtOp>, Selection)> {
        let item = self.redo_stack.pop()?;
        let ops = item.operations.clone();
        let selection = item.selection.clone();
        self.undo_stack.push(item);
        Some((ops, selection))
    }
}
```

---

## Serialization

| Format | Direction | Module | Use case |
|--------|-----------|--------|----------|
| JSON | ↔ | `gotipe-core` | Primary storage, API transport |
| HTML | ↔ | `gotipe-export` | Browser paste, server rendering |
| Markdown | ↔ | `gotipe-export` | Developer-friendly export/import |
| PDF | → | `gotipe-export` (typst) | Print, download |
| DOCX | → | `gotipe-export` (docx-rs) | Enterprise export |
| Plain Text | → | `gotipe-export` | Clipboard, search indexing |
| CRDT Binary | ↔ | `gotipe-crdt` | Sync protocol |

Detailed export/import documentation is in [08-export-import.md](08-export-import.md).

---

## Server-Side Usage

### Node.js (WASM)

```typescript
// server/validate.ts
import init, { WasmEditor } from '@gotipe/wasm';

// Initialize WASM once at server start
await init();

export function validateDocument(docJson: string): { valid: boolean; errors: string[] } {
  const schema = JSON.stringify(Schema.defaultBlockEditor());
  const editor = new WasmEditor(schema, docJson);
  try {
    const isValid = editor.validate(docJson);
    return { valid: isValid, errors: [] };
  } catch (e) {
    return { valid: false, errors: [e.message] };
  }
}

// HTML comes from @gotipe/core (editor.getHTML()) or, on a server, from gotipe-convert;
// the WASM module carries no HTML serializer or sanitizer.
```

### Rust (native, server)

```rust
// Rust server — no WASM, native performance
use gotipe_core::{Document, Schema};
use gotipe_export;

fn validate_and_render(json: &str) -> Result<String, Box<dyn std::error::Error>> {
    let schema = Schema::default_block_editor();
    let doc = Document::from_json(json, &schema)?;
    schema.validate(&doc)?;
    Ok(gotipe_export::to_html(&doc)?)
}
```

---

## WASM Bindings

### TypeScript Type Definitions

```typescript
// packages/wasm/pkg/gotipe_wasm.d.ts (auto-generated by wasm-bindgen)
export class WasmEditor {
  constructor(schema_json: string, doc_json: string);
  free(): void;
  apply(transaction_json: string): string;
  validate(doc_json: string): boolean;
  enable_collaboration(peer_id: string): void;
  receive_update(update: Uint8Array): string;
  get_update(): Uint8Array;
  get_local_update_after(after: number, max_bytes: number): Uint8Array;
  get_update_missing_from(remote: Uint8Array): Uint8Array;
  // HTML and Markdown are serialized, and HTML sanitized, by @gotipe/core in TypeScript.
  export_json(): string;
}

export default function init(input?: string | URL | Request): Promise<void>;
```

### Build Configuration

```toml
# crates/gotipe-wasm/Cargo.toml
[package]
name = "gotipe-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
gotipe-core = { path = "../gotipe-core" }
gotipe-schema = { path = "../gotipe-schema" }
gotipe-crdt = { path = "../gotipe-crdt" }
gotipe-ai = { path = "../gotipe-ai" }
gotipe-export = { path = "../gotipe-export" }
wasm-bindgen = "0.2"
serde-wasm-bindgen = "0.6"
js-sys = "0.3"
web-sys = { version = "0.3", features = ["console"] }

[profile.release]
opt-level = "z"     # Optimize for size
lto = true          # Link-time optimization
codegen-units = 1   # Single codegen unit for better optimization
strip = true        # Strip symbols
```

### Build Script

```bash
#!/bin/bash
# scripts/build-wasm.sh
set -euo pipefail

echo "Building WASM..."
wasm-pack build crates/gotipe-wasm \
  --target web \
  --out-dir ../../packages/wasm/pkg \
  --release

echo "Optimizing WASM..."
wasm-opt packages/wasm/pkg/gotipe_wasm_bg.wasm \
  -Oz \
  -o packages/wasm/pkg/gotipe_wasm_bg.wasm

echo "WASM size:"
ls -lh packages/wasm/pkg/gotipe_wasm_bg.wasm
gzip -k packages/wasm/pkg/gotipe_wasm_bg.wasm
ls -lh packages/wasm/pkg/gotipe_wasm_bg.wasm.gz
rm packages/wasm/pkg/gotipe_wasm_bg.wasm.gz
```

---

## Benchmarks

### Micro-benchmarks (Rust)

```rust
// crates/gotipe-core/benches/transform.rs
use criterion::{criterion_group, criterion_main, Criterion};
use gotipe_core::{Document, Schema, EditorState, Transaction, Step, Block, BlockId};

fn bench_insert_text(c: &mut Criterion) {
    let schema = Schema::default_block_editor();
    let doc = generate_document(1000); // 1000 paragraphs
    let state = EditorState::new(doc, schema);

    c.bench_function("insert_text_1000_blocks", |b| {
        b.iter(|| {
            let tr = Transaction {
                steps: vec![Step::InsertText {
                    block_id: BlockId("b500".into()),
                    offset: 10,
                    text: "Hello, world!".into(),
                    marks: vec![],
                }],
                selection: None,
                metadata: Default::default(),
            };
            state.apply(tr).unwrap();
        });
    });
}

fn bench_parse_json(c: &mut Criterion) {
    let schema = Schema::default_block_editor();
    let json = generate_document_json(10_000); // 10K blocks

    c.bench_function("parse_10k_blocks_from_json", |b| {
        b.iter(|| {
            Document::from_json(&json, &schema).unwrap();
        });
    });
}

fn bench_validate(c: &mut Criterion) {
    let schema = Schema::default_block_editor();
    let doc = generate_document(10_000);

    c.bench_function("validate_10k_blocks", |b| {
        b.iter(|| {
            schema.validate(&doc).unwrap();
        });
    });
}

criterion_group!(benches, bench_insert_text, bench_parse_json, bench_validate);
criterion_main!(benches);
```

---

## Related documents

- [01-architecture.md](01-architecture.md) — overall architecture, crate structure overview
- [02-collaboration.md](02-collaboration.md) — CRDT engine in detail
- [04-block-editor.md](04-block-editor.md) — block types, UX
- [05-extensions.md](05-extensions.md) — extension API, built-in extensions
- [08-export-import.md](08-export-import.md) — serialization in detail
- [11-monorepo.md](11-monorepo.md) — build tooling, wasm-pack
