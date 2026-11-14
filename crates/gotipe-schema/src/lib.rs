pub mod atoms;
pub mod attr;
mod creation;
pub mod defaults;
pub mod document;
pub mod mark_spec;
pub mod node_spec;
pub mod validate;

pub use attr::{AttrSpec, AttrType, AttrValue};
pub use document::{Block, BlockContent, BlockId, Document, Mark, TextSpan};
pub use mark_spec::MarkSpec;
pub use node_spec::{ContentRule, MarksRule, NodeSpec};
pub use validate::{Schema, ValidationError};
