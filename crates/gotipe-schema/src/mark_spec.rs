use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::attr::AttrSpec;

/// MarkSpec: the definition of an inline format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarkSpec {
    pub name: String,
    /// Whether the mark may overlap other marks of this type
    pub exclusive_group: Option<String>,
    /// Attributes (for example href for link)
    pub attrs: HashMap<String, AttrSpec>,
    /// Render priority (nesting order in HTML)
    pub rank: u32,
    /// A span with this mark is one indivisible element of the line (a mention, a formula).
    /// Its text is a fallback representation; see docs/development/inline-atoms.md.
    #[serde(default)]
    pub atomic: bool,
}
