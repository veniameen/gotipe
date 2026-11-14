use crate::boundaries::Boundaries;
use crate::replica::{prepare, reconcile, Change, ReplicaOp, ReplicaState};
use crate::wire::{self, Envelope, OperationsWriter};
use crate::{
    history::CrdtHistory,
    ops::{CrdtOp, OpId},
    version::VersionVector,
};
use gotipe_core::{Document, Step, TransformError};
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};

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
    /// The newest clock of this replica's own operations.
    own_lamport: u64,
    boundaries: Boundaries,
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
            own_lamport: 0,
            boundaries: Boundaries::default(),
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
        staged.end_transaction();
        *self = staged;
        Ok(operations)
    }
    /// Reconcile an already validated editor result, keeping generated split IDs.
    pub fn apply_local_document(
        &mut self,
        target: &Document,
    ) -> Result<Vec<CrdtOp>, TransformError> {
        let operations = self.apply_local_steps_result(&[], target)?;
        self.end_transaction();
        Ok(operations)
    }
    /// Ends a local transaction: an update frame may end after its operations,
    /// never inside them. `try_apply_local`, `apply_local_document` and
    /// `apply_local_operations` end their own; a caller that combines
    /// `apply_local_steps_result` and `try_set_data` into one edit ends it here.
    /// Own operations not yet ended travel together with the next transaction.
    pub fn end_transaction(&mut self) {
        self.boundaries.seal(self.own_lamport);
    }
    /// A peer confirmed every own operation up to `clock`: forget where the
    /// transactions up to it ended. `encode_local_update_after` never starts at
    /// or below a confirmed clock again.
    pub fn forget_boundaries_through(&mut self, clock: u64) {
        self.boundaries.forget_through(clock);
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
        if op.id.peer_id == self.peer_id {
            self.own_lamport = self.own_lamport.max(op.id.lamport);
            self.boundaries.observe(op.id.lamport);
        }
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
        self.end_transaction();
        self.replay();
        Ok(())
    }
    /// Decode, merge and project atomically. Duplicate and reordered deliveries
    /// converge because updates contain operation identities and causal clocks.
    pub fn apply_remote(&mut self, bytes: &[u8]) -> Result<Vec<Step>, serde_json::Error> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Wire {
            Update(Envelope),
            Operations(Vec<CrdtOp>),
        }
        let wire: Wire = serde_json::from_slice(bytes)?;
        let mut adopted_base = None;
        let ops = match wire {
            Wire::Update(update) => {
                match (update.protocol.as_str(), update.base) {
                    (wire::FULL_STATE, Some(mut base)) => {
                        if base.duplicate_block_id().is_some() {
                            return Err(invalid("Duplicate block ID in collaboration baseline"));
                        }
                        base.version = self.base.version;
                        if serde_json::to_value(&base)? != serde_json::to_value(&self.base)? {
                            if !self.operations.is_empty() {
                                return Err(invalid(
                                    "Peers must start from the same document snapshot",
                                ));
                            }
                            adopted_base = Some(base);
                        }
                    }
                    (wire::FULL_STATE, None) => {
                        return Err(invalid(
                            "A gotipe.crdt/1 update must carry its baseline document",
                        ))
                    }
                    // The transport checked the generation; there is no document to compare.
                    (wire::OPERATIONS, None) => {}
                    (wire::OPERATIONS, Some(_)) => {
                        return Err(invalid(
                            "A gotipe.crdt/2 update names its baseline by generation only",
                        ))
                    }
                    _ => return Err(invalid("Unsupported collaboration protocol")),
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
        let mut merged = false;
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
                merged = true;
            }
        }
        // A repeated delivery holds nothing new: skip the replay of the whole log.
        if !merged && !adopting {
            return Ok(vec![]);
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
    /// The full state: the baseline and every operation (`gotipe.crdt/1`). It is
    /// replay-safe and also covers out-of-order gaps that a maximum-only version
    /// vector cannot describe, so the version argument omits nothing. Use it for
    /// local copies and first contact; `encode_local_update_after` sends edits.
    pub fn encode_update_since(&self, _since: &VersionVector) -> Vec<u8> {
        wire::full_state(&self.base, self.operations.values())
    }
    /// This replica's own operations after the Lamport clock `after`, oldest
    /// first, as `gotipe.crdt/2` without the baseline, plus `remaining` (later
    /// own operations left out) and `continues`. A positive `max_bytes` bounds
    /// the result, which ends only after the last operation of a transaction
    /// (`end_transaction`), so a peer never receives half of one. When the next
    /// transaction alone exceeds `max_bytes`, the result is the part of it that
    /// fits (at least one operation) and `continues` is true: read the rest with
    /// `after` set to the part's last clock. Own clocks only grow and a
    /// transport confirms them in order, so one clock marks everything a peer has.
    pub fn encode_local_update_after(&self, after: u64, max_bytes: usize) -> Vec<u8> {
        let total = self.local_operations_after(after).count();
        let mut local = self.local_operations_after(after).peekable();
        let mut writer = OperationsWriter::new(max_bytes);
        let mut taken = 0;
        // The writer's state after the last operation a frame may end with.
        let mut end = None;
        let mut continues = false;
        while let Some(operation) = local.peek() {
            if !writer.push(operation) {
                match end {
                    Some((mark, count)) => {
                        writer.truncate(mark);
                        taken = count;
                    }
                    None => continues = true,
                }
                break;
            }
            let clock = operation.id.lamport;
            local.next();
            taken += 1;
            // Nothing newer exists yet, so the newest operation always ends a frame.
            if local.peek().is_none() || self.boundaries.ends_after(clock) {
                end = Some((writer.mark(), taken));
            }
        }
        writer.finish(&format!(
            r#""remaining":{},"continues":{continues}"#,
            total - taken
        ))
    }
    fn local_operations_after(&self, after: u64) -> impl Iterator<Item = &ReplicaOp> {
        let first = OpId::new(after.saturating_add(1), "");
        self.operations
            .range(first..)
            .filter(move |(id, _)| id.lamport > after && id.peer_id == self.peer_id)
            .map(|(_, operation)| operation)
    }
    /// Operations this replica holds and the state `remote` lacks, except its own
    /// operations newer than `acknowledged`, the newest of them in `remote`: those
    /// follow through `encode_local_update_after(acknowledged, …)`. The rest was
    /// restored from a local copy under another peer ID, or is a gap in `remote`.
    pub fn encode_missing_from(&self, remote: &[u8]) -> Result<Vec<u8>, serde_json::Error> {
        let known = wire::identities(remote)?;
        let acknowledged = known
            .iter()
            .filter(|id| id.peer_id == self.peer_id)
            .map(|id| id.lamport)
            .max()
            .unwrap_or(0);
        let mut writer = OperationsWriter::new(0);
        for (id, operation) in &self.operations {
            let pending = id.peer_id == self.peer_id && id.lamport > acknowledged;
            if !pending && !known.contains(id) {
                writer.push(operation);
            }
        }
        Ok(writer.finish(&format!(r#""acknowledged":{acknowledged}"#)))
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
