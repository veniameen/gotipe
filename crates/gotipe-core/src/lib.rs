pub mod clipboard;
pub mod command;
pub mod error;
pub mod extension;
pub mod selection;
mod selection_mapping;
pub mod state;
pub mod transaction;
pub mod transform;

// Re-export schema types so downstream crates only need gotipe-core
pub use gotipe_schema::{
    defaults, AttrSpec, AttrType, AttrValue, Block, BlockContent, BlockId, ContentRule, Document,
    Mark, MarkSpec, MarksRule, NodeSpec, Schema, TextSpan, ValidationError,
};

pub use error::GoTipeError;
pub use selection::{Selection, TextPosition};
pub use state::EditorState;
pub use transaction::{Step, Transaction, TransformError};
