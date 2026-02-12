use gotipe_crdt::CrdtOp;
use serde::{Deserialize, Serialize};

/// Full snapshot every N versions
const FULL_SNAPSHOT_INTERVAL: usize = 50;

/// Incremental snapshot — stores ops since a base state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncrementalSnapshot {
    pub base_state_vector: Vec<u8>,
    pub ops: Vec<CrdtOp>,
    pub compressed_data: Vec<u8>,
}

/// Encode operations into an incremental snapshot (zstd compressed when available)
pub fn encode_snapshot(ops: &[CrdtOp], base_state_vector: &[u8]) -> IncrementalSnapshot {
    let ops_json = serde_json::to_vec(ops).unwrap_or_default();

    #[cfg(feature = "compression")]
    let compressed = zstd::encode_all(ops_json.as_slice(), 3).unwrap_or_else(|_| ops_json.clone());
    #[cfg(not(feature = "compression"))]
    let compressed = ops_json;

    IncrementalSnapshot {
        base_state_vector: base_state_vector.to_vec(),
        ops: ops.to_vec(),
        compressed_data: compressed,
    }
}

/// Decode operations from a snapshot
pub fn decode_snapshot(snapshot: &IncrementalSnapshot) -> Result<Vec<CrdtOp>, SnapshotError> {
    #[cfg(feature = "compression")]
    let decompressed = zstd::decode_all(snapshot.compressed_data.as_slice())
        .map_err(|_| SnapshotError::DecompressionFailed)?;
    #[cfg(not(feature = "compression"))]
    let decompressed = snapshot.compressed_data.clone();

    let ops: Vec<CrdtOp> = serde_json::from_slice(&decompressed)
        .map_err(|e| SnapshotError::DeserializationFailed(e.to_string()))?;
    Ok(ops)
}

/// Check if a full snapshot should be created
pub fn should_create_full_snapshot(version_count: usize) -> bool {
    version_count.is_multiple_of(FULL_SNAPSHOT_INTERVAL)
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum SnapshotError {
    #[error("Decompression failed")]
    DecompressionFailed,

    #[error("Deserialization failed: {0}")]
    DeserializationFailed(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_roundtrip() {
        let ops = vec![]; // empty ops
        let snapshot = encode_snapshot(&ops, &[]);
        let decoded = decode_snapshot(&snapshot).unwrap();
        assert_eq!(decoded.len(), 0);
    }

    #[test]
    fn test_full_snapshot_interval() {
        assert!(should_create_full_snapshot(50));
        assert!(should_create_full_snapshot(100));
        assert!(!should_create_full_snapshot(49));
    }
}
