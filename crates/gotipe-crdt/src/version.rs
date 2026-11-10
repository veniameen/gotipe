use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Version vector for tracking causal ordering
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VersionVector {
    clocks: HashMap<String, u64>,
}

impl VersionVector {
    pub fn new() -> Self {
        VersionVector {
            clocks: HashMap::new(),
        }
    }

    /// Increment the clock for a peer
    pub fn tick(&mut self, peer_id: &str) -> u64 {
        let counter = self.clocks.entry(peer_id.into()).or_insert(0);
        *counter += 1;
        *counter
    }

    /// Observe an operation's Lamport clock.
    pub fn observe(&mut self, peer_id: &str, clock: u64) {
        let counter = self.clocks.entry(peer_id.into()).or_insert(0);
        *counter = (*counter).max(clock);
    }

    /// Get the current clock for a peer
    pub fn get(&self, peer_id: &str) -> u64 {
        self.clocks.get(peer_id).copied().unwrap_or(0)
    }

    /// Merge with a remote version vector (take max of each component)
    pub fn merge_remote(&mut self, other: &VersionVector) {
        for (peer_id, &counter) in &other.clocks {
            let local = self.clocks.entry(peer_id.clone()).or_insert(0);
            *local = (*local).max(counter);
        }
    }

    /// Check if this version vector contains (is >= than) other
    pub fn contains(&self, other: &VersionVector) -> bool {
        other
            .clocks
            .iter()
            .all(|(peer_id, &counter)| self.get(peer_id) >= counter)
    }

    /// Calculate the diff: operations in `other` that we don't have
    pub fn diff(&self, other: &VersionVector) -> Vec<(String, u64, u64)> {
        let mut diffs = Vec::new();
        for (peer_id, &remote_counter) in &other.clocks {
            let local_counter = self.get(peer_id);
            if remote_counter > local_counter {
                diffs.push((peer_id.clone(), local_counter, remote_counter));
            }
        }
        diffs
    }

    pub fn clocks(&self) -> &HashMap<String, u64> {
        &self.clocks
    }

    /// Encode to bytes
    pub fn encode(&self) -> Vec<u8> {
        serde_json::to_vec(&self.clocks).unwrap_or_default()
    }

    /// Decode from bytes
    pub fn decode(bytes: &[u8]) -> Result<Self, serde_json::Error> {
        let clocks: HashMap<String, u64> = serde_json::from_slice(bytes)?;
        Ok(VersionVector { clocks })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tick_increments() {
        let mut vv = VersionVector::new();
        assert_eq!(vv.tick("peer_a"), 1);
        assert_eq!(vv.tick("peer_a"), 2);
        assert_eq!(vv.tick("peer_b"), 1);
    }

    #[test]
    fn test_merge_takes_max() {
        let mut vv1 = VersionVector::new();
        vv1.tick("peer_a"); // a=1
        vv1.tick("peer_a"); // a=2

        let mut vv2 = VersionVector::new();
        vv2.tick("peer_a"); // a=1
        vv2.tick("peer_b"); // b=1

        vv1.merge_remote(&vv2);
        assert_eq!(vv1.get("peer_a"), 2); // max(2, 1) = 2
        assert_eq!(vv1.get("peer_b"), 1); // max(0, 1) = 1
    }

    #[test]
    fn test_contains() {
        let mut vv1 = VersionVector::new();
        vv1.tick("peer_a");
        vv1.tick("peer_a");

        let mut vv2 = VersionVector::new();
        vv2.tick("peer_a");

        assert!(vv1.contains(&vv2));
        assert!(!vv2.contains(&vv1));
    }

    #[test]
    fn test_diff() {
        let mut vv1 = VersionVector::new();
        vv1.tick("peer_a"); // a=1

        let mut vv2 = VersionVector::new();
        vv2.tick("peer_a"); // a=1
        vv2.tick("peer_a"); // a=2
        vv2.tick("peer_b"); // b=1

        let diff = vv1.diff(&vv2);
        assert_eq!(diff.len(), 2);
        // Should contain (peer_a, 1, 2) and (peer_b, 0, 1)
    }

    #[test]
    fn test_encode_decode_roundtrip() {
        let mut vv = VersionVector::new();
        vv.tick("peer_a");
        vv.tick("peer_b");

        let bytes = vv.encode();
        let decoded = VersionVector::decode(&bytes).unwrap();
        assert_eq!(decoded.get("peer_a"), 1);
        assert_eq!(decoded.get("peer_b"), 1);
    }
}
