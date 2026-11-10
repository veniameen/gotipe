use super::Position;
use crate::ops::OpId;
use gotipe_core::{AttrValue, BlockContent, BlockId, Mark};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ContentKind {
    RichText,
    Raw,
    Empty,
}
impl From<&BlockContent> for ContentKind {
    fn from(content: &BlockContent) -> Self {
        match content {
            BlockContent::RichText(_) => Self::RichText,
            BlockContent::Raw(_) => Self::Raw,
            BlockContent::Empty => Self::Empty,
        }
    }
}

/// A causally stamped change. Repeated delivery is identified by `id`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplicaOp {
    pub id: OpId,
    pub change: Change,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Change {
    SetData {
        collection: String,
        key: String,
        value: Option<String>,
    },
    MoveTextRange {
        source: BlockId,
        target: BlockId,
        from: Option<Position>,
        to: Option<Position>,
        prefix: Position,
    },
    SetOperationActive {
        target: OpId,
        active: bool,
    },
    CreateBlock {
        block_id: BlockId,
        parent: Option<BlockId>,
        position: Position,
        block_type: String,
        kind: ContentKind,
    },
    DeleteBlock {
        block_id: BlockId,
    },
    MoveBlock {
        block_id: BlockId,
        parent: Option<BlockId>,
        position: Position,
    },
    SetType {
        block_id: BlockId,
        block_type: String,
        kind: ContentKind,
    },
    SetAttr {
        block_id: BlockId,
        key: String,
        value: Option<AttrValue>,
    },
    InsertChar {
        block_id: BlockId,
        position: Position,
        value: char,
        marks: Vec<Mark>,
    },
    DeleteChar {
        block_id: BlockId,
        target: OpId,
    },
    SetMark {
        block_id: BlockId,
        target: OpId,
        mark_type: String,
        mark: Option<Mark>,
    },
}
