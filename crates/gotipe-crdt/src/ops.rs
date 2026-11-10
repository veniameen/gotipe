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
    Replica(crate::replica::ReplicaOp),
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

#[derive(Debug, Clone, thiserror::Error)]
#[error("A positional operation cannot be inverted without its original replica state; use identity-based Replica operations")]
pub struct InverseError;

impl CrdtOp {
    /// Compatibility helper for already supported operations. Checked callers use
    /// `try_inverse`; unsupported legacy edits must never fabricate lost content.
    pub fn inverse(&self) -> CrdtOp {
        self.try_inverse()
            .expect("Cannot invert a legacy operation without replica state")
    }

    pub fn try_inverse(&self) -> Result<CrdtOp, InverseError> {
        use crate::replica::{Change, ReplicaOp};
        Ok(match self {
            CrdtOp::Replica(op) => CrdtOp::Replica(ReplicaOp {
                id: OpId::zero(""),
                change: match &op.change {
                    Change::SetOperationActive { target, active } => Change::SetOperationActive {
                        target: target.clone(),
                        active: !active,
                    },
                    _ => Change::SetOperationActive {
                        target: op.id.clone(),
                        active: false,
                    },
                },
            }),
            CrdtOp::Text(block_id, TextOp::Insert { id, .. }) => CrdtOp::Text(
                block_id.clone(),
                TextOp::Delete {
                    id: id.clone(),
                    target_id: id.clone(),
                },
            ),
            CrdtOp::Tree(TreeOp::Insert { id, block_id, .. }) => CrdtOp::Tree(TreeOp::Delete {
                id: id.clone(),
                block_id: block_id.clone(),
            }),
            _ => return Err(InverseError),
        })
    }
}

/// Encode operations to binary
pub fn encode_ops(ops: &[CrdtOp]) -> Vec<u8> {
    serde_json::to_vec(ops).expect("CRDT operations contain serializable JSON data")
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
    #[test]
    fn unchecked_legacy_deletion_never_invents_inverse_text() {
        let operation = CrdtOp::Text(
            BlockId("one".into()),
            TextOp::Delete {
                id: OpId::new(2, "a"),
                target_id: OpId::new(1, "a"),
            },
        );
        assert!(operation.try_inverse().is_err());
        assert!(CrdtOp::Attrs(BlockId("one".into()), HashMap::new())
            .try_inverse()
            .is_err());
    }
}
