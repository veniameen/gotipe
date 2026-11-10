use std::collections::HashMap;

use gotipe_schema::{AttrValue, Block, BlockId, Mark};
use serde::{Deserialize, Serialize};

use crate::selection::Selection;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub steps: Vec<Step>,
    pub selection: Option<Selection>,
    pub metadata: HashMap<String, AttrValue>,
}

impl Transaction {
    pub fn new() -> Self {
        Transaction {
            steps: Vec::new(),
            selection: None,
            metadata: HashMap::new(),
        }
    }

    pub fn with_step(mut self, step: Step) -> Self {
        self.steps.push(step);
        self
    }

    pub fn with_selection(mut self, selection: Selection) -> Self {
        self.selection = Some(selection);
        self
    }

    pub fn with_metadata(mut self, key: &str, value: AttrValue) -> Self {
        self.metadata.insert(key.into(), value);
        self
    }
}

impl Default for Transaction {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Step {
    InsertText {
        block_id: BlockId,
        offset: usize,
        text: String,
        marks: Vec<Mark>,
    },
    #[serde(alias = "DeleteRange")]
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
        block_id: BlockId,
        target_id: BlockId,
    },
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum TransformError {
    #[error("Block not found: {0}")]
    BlockNotFound(BlockId),

    #[error("Offset out of range")]
    OffsetOutOfRange,

    #[error("Invalid content type for this operation")]
    InvalidContentType,

    #[error("Cycle detected in block tree")]
    CycleDetected,

    #[error("Invalid step: {0}")]
    InvalidStep(String),
}
