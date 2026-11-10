use crate::replica::{prepare, reconcile, Change, ReplicaOp, ReplicaState};
use crate::{
    history::CrdtHistory,
    ops::{CrdtOp, OpId},
    version::VersionVector,
};
use gotipe_core::{Document, Step, TransformError};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

const PROTOCOL: &str = "gotipe.crdt/1";
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Update {
    protocol: String,
    base: Document,
    operations: Vec<ReplicaOp>,
}

/// A document replica. The update log is an idempotent union of causally stamped
/// changes; projection uses identities and dense positions, never remote offsets.
#[derive(Debug, Clone)]
pub struct CrdtDocument {
    peer_id: String,
    base: Document,
    operations: BTreeMap<OpId, ReplicaOp>,
    state: ReplicaState,
    version: VersionVector,
    history: CrdtHistory,
    lamport: u64,
}
impl CrdtDocument {
    pub fn new(peer_id: &str, doc: &Document) -> Self {
        Self::try_new(peer_id, doc).expect("A replica requires a valid peer and unique block IDs")
    }
    pub fn try_new(peer_id: &str, doc: &Document) -> Result<Self, TransformError> {
        if peer_id.trim().is_empty() || peer_id.starts_with("@base") || peer_id.len() > 256 {
            return Err(TransformError::InvalidStep(
                "Invalid collaboration peer ID".into(),
            ));
        }
        if doc.duplicate_block_id().is_some() {
            return Err(TransformError::InvalidStep(
                "Duplicate block ID in collaboration baseline".into(),
            ));
        }
        Ok(Self {
            peer_id: peer_id.into(),
            base: doc.clone(),
            operations: BTreeMap::new(),
            state: ReplicaState::from_document(doc),
            version: VersionVector::new(),
            history: CrdtHistory::new(),
            lamport: 0,
        })
    }
    /// Compatibility entry point for callers which already validated the steps.
    /// Use `try_apply_local` when accepting untrusted or unchecked transactions.
    pub fn apply_local(&mut self, steps: &[Step]) -> Vec<CrdtOp> {
        self.try_apply_local(steps)
            .expect("Invalid local CRDT transaction")
    }
    pub fn try_apply_local(&mut self, steps: &[Step]) -> Result<Vec<CrdtOp>, TransformError> {
        let mut staged = self.clone();
        let mut operations = Vec::new();
        for step in steps {
            let target = step.apply(staged.to_document())?;
            operations
                .extend(staged.apply_local_steps_result(std::slice::from_ref(step), &target)?);
        }
        *self = staged;
        Ok(operations)
    }
    /// Reconcile an already validated editor result, keeping generated split IDs.
    pub fn apply_local_document(
        &mut self,
        target: &Document,
    ) -> Result<Vec<CrdtOp>, TransformError> {
        self.apply_local_steps_result(&[], target)
    }
    pub fn apply_local_steps_result(
        &mut self,
        steps: &[Step],
        target: &Document,
    ) -> Result<Vec<CrdtOp>, TransformError> {
        let mut ids = BTreeSet::new();
        if target
            .flatten()
            .any(|block| !ids.insert(block.id.0.clone()))
        {
            return Err(TransformError::InvalidStep("Duplicate block IDs".into()));
        }
        // Allocation may fail at the shared wire clock limit. Do not expose any
        // partial projection, generated identity or log entry from that attempt.
        let mut state = self.state.clone();
        let mut clock = self.lamport;
        let mut ops = prepare(&mut state, target, steps, &self.peer_id, &mut clock)?;
        ops.extend(reconcile(&mut state, target, &self.peer_id, &mut clock)?);
        self.state = state;
        self.lamport = clock;
        for op in &ops {
            self.remember(op.clone());
        }
        Ok(ops.into_iter().map(CrdtOp::Replica).collect())
    }
    pub fn text_anchor(
        &self,
        block_id: &gotipe_core::BlockId,
        offset: usize,
        prefer_right: bool,
    ) -> Option<crate::replica::TextAnchor> {
        self.state.text_anchor(block_id, offset, prefer_right)
    }
    pub fn resolve_anchor(
        &self,
        anchor: &crate::replica::TextAnchor,
    ) -> Option<(gotipe_core::BlockId, usize)> {
        self.state.resolve_anchor(anchor)
    }

    /// Replicate document-associated review data without mixing it into block JSON.
    pub fn set_data(&mut self, collection: &str, key: &str, value: Option<String>) {
        self.try_set_data(collection, key, value)
            .expect("Collaboration clock exhausted");
    }
    pub fn try_set_data(
        &mut self,
        collection: &str,
        key: &str,
        value: Option<String>,
    ) -> Result<(), TransformError> {
        let id = crate::clock::next_id(self.lamport, &self.peer_id)?;
        let op = ReplicaOp {
            id,
            change: Change::SetData {
                collection: collection.into(),
                key: key.into(),
                value,
            },
        };
        self.state.apply(&op);
        self.remember(op);
        Ok(())
    }
    pub fn data(&self, collection: &str) -> Option<&BTreeMap<String, String>> {
        self.state.data.get(collection)
    }

    fn remember(&mut self, op: ReplicaOp) {
        self.lamport = self.lamport.max(op.id.lamport);
        self.version.observe(&op.id.peer_id, op.id.lamport);
        self.operations.insert(op.id.clone(), op);
    }
    fn replay(&mut self) {
        let mut inactive = BTreeSet::new();
        for op in self.operations.values() {
            if let Change::SetOperationActive { target, active } = &op.change {
                if *active {
                    inactive.remove(target);
                } else {
                    inactive.insert(target.clone());
                }
            }
        }
        self.state = ReplicaState::from_document(&self.base);
        for op in self
            .operations
            .values()
            .filter(|op| !inactive.contains(&op.id))
        {
            self.state.apply(op);
        }
    }
    /// Apply undo/redo intents from CrdtHistory with fresh IDs, so they replicate.
    pub fn apply_local_operations(&mut self, operations: &[CrdtOp]) -> Result<(), TransformError> {
        let mut changes = vec![];
        for op in operations {
            let CrdtOp::Replica(op) = op else {
                return Err(TransformError::InvalidStep(
                    "Legacy positional history cannot be replayed safely".into(),
                ));
            };
            let (target, active) = match &op.change {
                Change::SetOperationActive { target, active } => (target.clone(), *active),
                _ => (op.id.clone(), true),
            };
            if !self.operations.contains_key(&target) {
                return Err(TransformError::InvalidStep(
                    "History operation not found".into(),
                ));
            }
            changes.push(Change::SetOperationActive { target, active });
        }
        crate::clock::reserve(self.lamport, changes.len())?;
        for change in changes {
            self.lamport += 1;
            self.remember(ReplicaOp {
                id: OpId::new(self.lamport, &self.peer_id),
                change,
            });
        }
        self.replay();
        Ok(())
    }
    /// Decode, merge and project atomically. Duplicate and reordered deliveries
    /// converge because updates contain operation identities and causal clocks.
    pub fn apply_remote(&mut self, bytes: &[u8]) -> Result<Vec<Step>, serde_json::Error> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Wire {
            Update(Update),
            Operations(Vec<CrdtOp>),
        }
        let wire: Wire = serde_json::from_slice(bytes)?;
        let mut adopted_base = None;
        let ops = match wire {
            Wire::Update(update) => {
                if update.protocol != PROTOCOL {
                    return Err(invalid("Unsupported collaboration protocol"));
                }
                let mut base = update.base;
                if base.duplicate_block_id().is_some() {
                    return Err(invalid("Duplicate block ID in collaboration baseline"));
                }
                base.version = self.base.version;
                if serde_json::to_value(&base)? != serde_json::to_value(&self.base)? {
                    if !self.operations.is_empty() {
                        return Err(invalid("Peers must start from the same document snapshot"));
                    }
                    adopted_base = Some(base);
                }
                update.operations
            }
            Wire::Operations(ops) => ops
                .into_iter()
                .map(|op| match op {
                    CrdtOp::Replica(op) => Ok(op),
                    _ => Err(invalid(
                        "Legacy positional updates are unsupported; use identity-based updates",
                    )),
                })
                .collect::<Result<Vec<_>, _>>()?,
        };
        let before = self.to_document();
        let mut staged = self.clone();
        let adopting = adopted_base.is_some();
        if let Some(base) = adopted_base {
            staged.base = base;
        }
        for op in ops {
            if op.id.peer_id.trim().is_empty()
                || op.id.peer_id.len() > 256
                || op.id.peer_id.starts_with("@base")
                || op.id.lamport == 0
                || !crate::clock::valid_clock(&op.id)
                || !crate::replica::valid_change_clocks(&op.change)
            {
                return Err(invalid("Invalid operation identity"));
            }
            if let Some(existing) = staged.operations.get(&op.id) {
                if serde_json::to_value(existing)? != serde_json::to_value(&op)? {
                    return Err(invalid("Conflicting operation identity"));
                }
            } else {
                staged.remember(op);
            }
        }
        staged.replay();
        let after = staged.to_document();
        if adopting && serde_json::to_value(&before.blocks)? != serde_json::to_value(&after.blocks)?
        {
            return Err(invalid(
                "The received baseline differs; initialize collaboration before editing",
            ));
        }
        let steps =
            if serde_json::to_value(&before.blocks)? == serde_json::to_value(&after.blocks)? {
                vec![]
            } else {
                before
                    .blocks
                    .iter()
                    .map(|b| Step::DeleteBlock {
                        block_id: b.id.clone(),
                    })
                    .chain(after.blocks.iter().enumerate().map(|(index, block)| {
                        Step::InsertBlock {
                            parent_id: None,
                            index,
                            block: block.clone(),
                        }
                    }))
                    .collect()
            };
        *self = staged;
        Ok(steps)
    }
    /// Updates are replay-safe. Sending the complete log also covers out-of-order
    /// gaps that a maximum-only version vector cannot describe.
    pub fn encode_update_since(&self, _since: &VersionVector) -> Vec<u8> {
        serde_json::to_vec(&Update {
            protocol: PROTOCOL.into(),
            base: self.base.clone(),
            operations: self.operations.values().cloned().collect(),
        })
        .expect("Serializable CRDT update")
    }
    /// Plain document snapshots are intentionally separate from network updates.
    pub fn encode_snapshot(&self) -> Vec<u8> {
        serde_json::to_vec(&self.to_document()).expect("Serializable document")
    }
    pub fn to_document(&self) -> Document {
        self.state.document(
            self.base
                .version
                .saturating_add(self.operations.len() as u64),
        )
    }
    pub fn version(&self) -> &VersionVector {
        &self.version
    }
    pub fn peer_id(&self) -> &str {
        &self.peer_id
    }
    pub fn history(&self) -> &CrdtHistory {
        &self.history
    }
    pub fn history_mut(&mut self) -> &mut CrdtHistory {
        &mut self.history
    }
}
fn invalid(message: &str) -> serde_json::Error {
    <serde_json::Error as serde::de::Error>::custom(message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use gotipe_core::{Block, BlockContent, BlockId, TextSpan};
    use std::collections::HashMap;

    fn make_doc() -> Document {
        Document {
            blocks: vec![Block {
                id: BlockId("b1".into()),
                block_type: "paragraph".into(),
                attrs: HashMap::new(),
                content: BlockContent::RichText(vec![TextSpan {
                    text: "Hello".into(),
                    marks: vec![],
                }]),
                children: vec![],
            }],
            version: 0,
        }
    }

    #[test]
    fn test_new_imports_document() {
        let doc = make_doc();
        let crdt = CrdtDocument::new("peer_a", &doc);
        let restored = crdt.to_document();
        assert_eq!(restored.blocks.len(), 1);
        assert_eq!(restored.blocks[0].text_length(), 5);
    }

    #[test]
    fn test_apply_local_insert_text() {
        let doc = make_doc();
        let mut crdt = CrdtDocument::new("peer_a", &doc);

        let ops = crdt.apply_local(&[Step::InsertText {
            block_id: BlockId("b1".into()),
            offset: 5,
            text: "!".into(),
            marks: vec![],
        }]);

        assert!(!ops.is_empty());
        let restored = crdt.to_document();
        assert_eq!(restored.blocks[0].text_length(), 6);
    }

    #[test]
    fn test_apply_local_insert_block() {
        let doc = make_doc();
        let mut crdt = CrdtDocument::new("peer_a", &doc);

        let new_block = Block::new_with_type("paragraph", BlockContent::RichText(vec![]));
        let ops = crdt.apply_local(&[Step::InsertBlock {
            parent_id: None,
            index: 1,
            block: new_block,
        }]);

        assert!(!ops.is_empty());
        let restored = crdt.to_document();
        assert_eq!(restored.blocks.len(), 2);
    }

    #[test]
    fn test_encode_snapshot_roundtrip() {
        let doc = make_doc();
        let crdt = CrdtDocument::new("peer_a", &doc);
        let snapshot = crdt.encode_snapshot();
        let restored: Document = serde_json::from_slice(&snapshot).unwrap();
        assert_eq!(restored.blocks.len(), 1);
    }
}
