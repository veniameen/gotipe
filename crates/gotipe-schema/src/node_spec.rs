use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::attr::AttrSpec;

/// NodeSpec: the definition of a block type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeSpec {
    /// Type name (for example "paragraph", "heading")
    pub name: String,

    /// Groups the node belongs to (for example "block", "inline")
    pub group: Vec<String>,

    /// What content is allowed
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

/// Content rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ContentRule {
    /// Rich text (TextSpan[])
    RichText,
    /// Raw text (code, formulas)
    RawText,
    /// No content (divider, image)
    Empty,
}

/// Marks rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MarksRule {
    /// All marks are allowed
    All,
    /// A specific set of marks
    Only(Vec<String>),
    /// Marks are not allowed
    None,
}
