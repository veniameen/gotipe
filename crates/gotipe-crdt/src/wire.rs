//! Update envelopes. `gotipe.crdt/1` repeats the baseline document, so only a
//! full state uses it; `gotipe.crdt/2` carries operations alone and its transport
//! names the baseline by a generation token, which the engine does not interpret.
use crate::ops::OpId;
use crate::replica::ReplicaOp;
use gotipe_core::Document;
use serde::{de::IgnoredAny, Deserialize, Serialize};
use std::collections::BTreeSet;

pub(crate) const FULL_STATE: &str = "gotipe.crdt/1";
pub(crate) const OPERATIONS: &str = "gotipe.crdt/2";

#[derive(Deserialize)]
pub(crate) struct Envelope {
    pub protocol: String,
    #[serde(default)]
    pub base: Option<Document>,
    pub operations: Vec<ReplicaOp>,
}

#[derive(Serialize)]
struct FullState<'a> {
    protocol: &'static str,
    base: &'a Document,
    operations: Vec<&'a ReplicaOp>,
}

pub(crate) fn full_state<'a>(
    base: &'a Document,
    operations: impl Iterator<Item = &'a ReplicaOp>,
) -> Vec<u8> {
    serde_json::to_vec(&FullState {
        protocol: FULL_STATE,
        base,
        operations: operations.collect(),
    })
    .expect("Serializable CRDT update")
}

/// Writes `{"protocol":"gotipe.crdt/2","operations":[…],<fields>}` without
/// copying operations. With a byte budget it stops before the operation that
/// would pass it, yet always takes one, so a caller can make progress.
pub(crate) struct OperationsWriter {
    bytes: Vec<u8>,
    budget: usize,
    count: usize,
}
impl OperationsWriter {
    pub fn new(budget: usize) -> Self {
        Self {
            bytes: format!(r#"{{"protocol":"{OPERATIONS}","operations":["#).into_bytes(),
            budget,
            count: 0,
        }
    }
    /// Returns false, taking nothing, once the budget is spent.
    pub fn push(&mut self, operation: &ReplicaOp) -> bool {
        let encoded = serde_json::to_vec(operation).expect("Serializable CRDT operation");
        // The closing fields need at most 64 bytes.
        let size = self.bytes.len() + encoded.len() + 65;
        if self.count > 0 && self.budget > 0 && size > self.budget {
            return false;
        }
        if self.count > 0 {
            self.bytes.push(b',');
        }
        self.bytes.extend(encoded);
        self.count += 1;
        true
    }
    /// The length and count so far, to `truncate` back to.
    pub fn mark(&self) -> (usize, usize) {
        (self.bytes.len(), self.count)
    }
    pub fn truncate(&mut self, (length, count): (usize, usize)) {
        self.bytes.truncate(length);
        self.count = count;
    }
    /// Closes the envelope with `fields`, such as `"remaining":3`.
    pub fn finish(mut self, fields: &str) -> Vec<u8> {
        self.bytes.extend(format!("],{fields}}}").into_bytes());
        self.bytes
    }
}

/// Operation identities of an envelope; changes are skipped, not decoded.
pub(crate) fn identities(bytes: &[u8]) -> Result<BTreeSet<OpId>, serde_json::Error> {
    #[derive(Deserialize)]
    struct Identity {
        id: OpId,
        #[serde(rename = "change")]
        _change: IgnoredAny,
    }
    #[derive(Deserialize)]
    struct Identities {
        protocol: String,
        operations: Vec<Identity>,
    }
    let envelope: Identities = serde_json::from_slice(bytes)?;
    if envelope.protocol != FULL_STATE && envelope.protocol != OPERATIONS {
        return Err(<serde_json::Error as serde::de::Error>::custom(
            "Unsupported collaboration protocol",
        ));
    }
    Ok(envelope.operations.into_iter().map(|op| op.id).collect())
}
