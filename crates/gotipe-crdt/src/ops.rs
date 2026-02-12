use std::collections::HashMap;

use gotipe_core::{AttrValue, BlockId, Mark};
use serde::{Deserialize, Serialize};

/// Unique operation identifier (Lamport timestamp + peer_id)
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct OpId {
    pub lamport: u64,
    pub peer_id: String,
}

impl OpId {
    pub fn new(lamport: u64, peer_id: &str) -> Self {
        OpId {
            lamport,
            peer_id: peer_id.into(),
        }
    }

    pub fn zero(peer_id: &str) -> Self {
        OpId {
            lamport: 0,
            peer_id: peer_id.into(),
        }
    }
}

/// CRDT operation types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CrdtOp {
    Text(BlockId, TextOp),
    Tree(TreeOp),
    Attrs(BlockId, HashMap<String, AttrValue>),
    Comment(CommentOp),
    Suggestion(SuggestionOp),
}

/// Text CRDT operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TextOp {
    Insert {
        id: OpId,
        pos: usize,
        ch: char,
        marks: Vec<Mark>,
        left_origin: Option<OpId>,
        right_origin: Option<OpId>,
    },
    Delete {
        id: OpId,
        target_id: OpId,
    },
    AddMark {
        from: usize,
        to: usize,
        mark: Mark,
    },
    RemoveMark {
        from: usize,
        to: usize,
        mark_type: String,
    },
}

/// Tree CRDT operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TreeOp {
    Insert {
        id: OpId,
        parent_id: Option<BlockId>,
        index: usize,
        block_id: BlockId,
        block_type: String,
    },
    Move {
        id: OpId,
        block_id: BlockId,
        new_parent_id: Option<BlockId>,
        new_index: usize,
    },
    Delete {
        id: OpId,
        block_id: BlockId,
    },
}

/// Comment CRDT operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CommentOp {
    Add {
        id: OpId,
        comment_id: String,
        data: String, // JSON-serialized comment
    },
    Update {
        id: OpId,
        comment_id: String,
        data: String,
    },
    Delete {
        id: OpId,
        comment_id: String,
    },
    Resolve {
        id: OpId,
        comment_id: String,
    },
    Reopen {
        id: OpId,
        comment_id: String,
    },
}

/// Suggestion CRDT operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SuggestionOp {
    Add {
        id: OpId,
        suggestion_id: String,
        data: String,
    },
    Accept {
        id: OpId,
        suggestion_id: String,
    },
    Reject {
        id: OpId,
        suggestion_id: String,
    },
    Update {
        id: OpId,
        suggestion_id: String,
        data: String,
    },
}

impl CrdtOp {
    /// Compute inverse operation for undo
    pub fn inverse(&self) -> CrdtOp {
        match self {
            CrdtOp::Text(block_id, text_op) => match text_op {
                TextOp::Insert { id, .. } => CrdtOp::Text(
                    block_id.clone(),
                    TextOp::Delete {
                        id: id.clone(),
                        target_id: id.clone(),
                    },
                ),
                TextOp::Delete { id, .. } => {
                    // Approximate inverse — re-insert is complex
                    CrdtOp::Text(
                        block_id.clone(),
                        TextOp::Insert {
                            id: id.clone(),
                            pos: 0,
                            ch: ' ',
                            marks: vec![],
                            left_origin: None,
                            right_origin: None,
                        },
                    )
                }
                TextOp::AddMark { from, to, mark } => CrdtOp::Text(
                    block_id.clone(),
                    TextOp::RemoveMark {
                        from: *from,
                        to: *to,
                        mark_type: mark.mark_type.clone(),
                    },
                ),
                TextOp::RemoveMark {
                    from,
                    to,
                    mark_type,
                } => CrdtOp::Text(
                    block_id.clone(),
                    TextOp::AddMark {
                        from: *from,
                        to: *to,
                        mark: Mark::new(mark_type),
                    },
                ),
            },
            // Tree operations inverse
            CrdtOp::Tree(tree_op) => match tree_op {
                TreeOp::Insert { id, block_id, .. } => CrdtOp::Tree(TreeOp::Delete {
                    id: id.clone(),
                    block_id: block_id.clone(),
                }),
                TreeOp::Delete { id, block_id } => {
                    // Cannot fully invert a delete without more context
                    CrdtOp::Tree(TreeOp::Insert {
                        id: id.clone(),
                        parent_id: None,
                        index: 0,
                        block_id: block_id.clone(),
                        block_type: "paragraph".into(),
                    })
                }
                TreeOp::Move { id, block_id, .. } => {
                    // Approximate inverse
                    CrdtOp::Tree(TreeOp::Move {
                        id: id.clone(),
                        block_id: block_id.clone(),
                        new_parent_id: None,
                        new_index: 0,
                    })
                }
            },
            // Attrs: store old attrs for full inverse (simplified here)
            CrdtOp::Attrs(block_id, _attrs) => CrdtOp::Attrs(block_id.clone(), HashMap::new()),
            // Comment/Suggestion inverses
            CrdtOp::Comment(op) => CrdtOp::Comment(op.clone()),
            CrdtOp::Suggestion(op) => CrdtOp::Suggestion(op.clone()),
        }
    }
}

/// Encode operations to binary
pub fn encode_ops(ops: &[CrdtOp]) -> Vec<u8> {
    serde_json::to_vec(ops).unwrap_or_default()
}

/// Decode operations from binary
pub fn decode_ops(bytes: &[u8]) -> Result<Vec<CrdtOp>, serde_json::Error> {
    serde_json::from_slice(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_opid_ordering() {
        let a = OpId::new(1, "peer_a");
        let b = OpId::new(2, "peer_a");
        let c = OpId::new(1, "peer_b");
        assert!(a < b);
        assert!(a < c); // same lamport, different peer — lexicographic
    }

    #[test]
    fn test_encode_decode_roundtrip() {
        let ops = vec![CrdtOp::Text(
            BlockId("b1".into()),
            TextOp::Insert {
                id: OpId::new(1, "peer_a"),
                pos: 0,
                ch: 'H',
                marks: vec![],
                left_origin: None,
                right_origin: None,
            },
        )];
        let bytes = encode_ops(&ops);
        let decoded = decode_ops(&bytes).unwrap();
        assert_eq!(decoded.len(), 1);
    }
}
