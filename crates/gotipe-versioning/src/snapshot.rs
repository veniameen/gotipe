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

const MAGIC: &[u8] = b"GTS1";
const MAX_DECODED_BYTES: usize = 64 * 1024 * 1024;

/// Compression is tagged explicitly, so native and WASM builds agree on bytes.
pub fn encode_snapshot(ops: &[CrdtOp], base_state_vector: &[u8]) -> IncrementalSnapshot {
    let json = serde_json::to_vec(ops).expect("serializable CRDT operations");
    #[cfg(feature = "compression")]
    let (flag, payload) = match zstd::encode_all(json.as_slice(), 3) {
        Ok(compressed) => (1u8, compressed),
        Err(_) => (0u8, json),
    };
    #[cfg(not(feature = "compression"))]
    let (flag, payload) = (0u8, json);
    let mut data = Vec::with_capacity(payload.len() + 5);
    data.extend_from_slice(MAGIC);
    data.push(flag);
    data.extend(payload);
    IncrementalSnapshot {
        base_state_vector: base_state_vector.to_vec(),
        ops: ops.to_vec(),
        compressed_data: data,
    }
}

pub fn decode_snapshot(snapshot: &IncrementalSnapshot) -> Result<Vec<CrdtOp>, SnapshotError> {
    let bytes = snapshot.compressed_data.as_slice();
    let (flag, payload) = if bytes.starts_with(MAGIC) {
        let flag = *bytes.get(4).ok_or(SnapshotError::InvalidHeader)?;
        (flag, &bytes[5..])
    } else if bytes.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]) {
        (1, bytes) // Legacy native zstd snapshots.
    } else {
        (0, bytes)
    }; // Legacy JSON snapshots.
    let decoded = match flag {
        0 => {
            if payload.len() > MAX_DECODED_BYTES {
                return Err(SnapshotError::TooLarge);
            }
            payload.to_vec()
        }
        1 => decompress(payload)?,
        _ => return Err(SnapshotError::InvalidHeader),
    };
    serde_json::from_slice(&decoded)
        .map_err(|e| SnapshotError::DeserializationFailed(e.to_string()))
}
#[cfg(feature = "compression")]
fn decompress(payload: &[u8]) -> Result<Vec<u8>, SnapshotError> {
    use std::io::Read;
    let decoder = zstd::Decoder::new(payload).map_err(|_| SnapshotError::DecompressionFailed)?;
    let mut decoded = Vec::new();
    decoder
        .take(MAX_DECODED_BYTES as u64 + 1)
        .read_to_end(&mut decoded)
        .map_err(|_| SnapshotError::DecompressionFailed)?;
    if decoded.len() > MAX_DECODED_BYTES {
        return Err(SnapshotError::TooLarge);
    }
    Ok(decoded)
}
#[cfg(not(feature = "compression"))]
fn decompress(_payload: &[u8]) -> Result<Vec<u8>, SnapshotError> {
    Err(SnapshotError::CompressionUnavailable)
}

/// Check if a full snapshot should be created
pub fn should_create_full_snapshot(version_count: usize) -> bool {
    version_count.is_multiple_of(FULL_SNAPSHOT_INTERVAL)
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum SnapshotError {
    #[error("Invalid snapshot encoding header")]
    InvalidHeader,
    #[error("Snapshot exceeds the 64 MiB decoded limit")]
    TooLarge,
    #[error("This build cannot decode compressed snapshots")]
    CompressionUnavailable,
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
    #[test]
    fn plain_snapshots_decode_identically_regardless_of_compression_feature() {
        let mut snapshot = IncrementalSnapshot {
            base_state_vector: vec![],
            ops: vec![],
            compressed_data: b"GTS1\0[]".to_vec(),
        };
        assert!(decode_snapshot(&snapshot).unwrap().is_empty());
        snapshot.compressed_data = b"[]".to_vec();
        assert!(decode_snapshot(&snapshot).unwrap().is_empty());
        for bytes in [b"GTS1".as_slice(), b"GTS1\x07[]".as_slice()] {
            snapshot.compressed_data = bytes.to_vec();
            assert!(decode_snapshot(&snapshot).is_err());
        }
    }
}
