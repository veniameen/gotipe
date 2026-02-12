use crate::version::VersionVector;

/// Binary protocol message types
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageType {
    SyncStep1 = 0x01, // version vector
    SyncStep2 = 0x02, // missing updates
    Update = 0x03,    // incremental update
    Awareness = 0x04, // awareness state
    Query = 0x05,     // query
    Snapshot = 0x06,  // full snapshot
    Auth = 0x07,      // authentication
    Error = 0x08,     // error
    Ack = 0x09,       // acknowledgement
}

impl MessageType {
    pub fn from_u8(byte: u8) -> Option<Self> {
        match byte {
            0x01 => Some(MessageType::SyncStep1),
            0x02 => Some(MessageType::SyncStep2),
            0x03 => Some(MessageType::Update),
            0x04 => Some(MessageType::Awareness),
            0x05 => Some(MessageType::Query),
            0x06 => Some(MessageType::Snapshot),
            0x07 => Some(MessageType::Auth),
            0x08 => Some(MessageType::Error),
            0x09 => Some(MessageType::Ack),
            _ => None,
        }
    }
}

/// Frame flags
pub const FLAG_COMPRESSED: u8 = 0x01;
pub const FLAG_REQUIRES_ACK: u8 = 0x02;

/// Compression threshold in bytes
#[cfg(feature = "compression")]
const COMPRESSION_THRESHOLD: usize = 1024;

/// Sync protocol — encodes/decodes binary frames
pub struct SyncProtocol;

#[derive(Debug, Clone)]
pub struct Frame {
    pub msg_type: MessageType,
    pub flags: u8,
    pub payload: Vec<u8>,
}

impl SyncProtocol {
    /// Encode a frame into binary format:
    /// [type: u8][flags: u8][length: varint][payload: bytes]
    pub fn encode_frame(msg_type: MessageType, payload: &[u8]) -> Vec<u8> {
        let (final_payload, flags) = compress_payload(payload);

        let mut buf = Vec::with_capacity(2 + 5 + final_payload.len());
        buf.push(msg_type as u8);
        buf.push(flags);
        encode_varint(&mut buf, final_payload.len() as u64);
        buf.extend_from_slice(&final_payload);
        buf
    }

    /// Decode a frame from binary data
    pub fn decode_frame(data: &[u8]) -> Result<(Frame, usize), SyncError> {
        if data.len() < 3 {
            return Err(SyncError::InsufficientData);
        }

        let msg_type =
            MessageType::from_u8(data[0]).ok_or(SyncError::UnknownMessageType(data[0]))?;
        let flags = data[1];

        let (length, varint_len) = decode_varint(&data[2..])?;
        let header_len = 2 + varint_len;
        let total_len = header_len + length as usize;

        if data.len() < total_len {
            return Err(SyncError::InsufficientData);
        }

        let raw_payload = &data[header_len..total_len];
        let payload = if flags & FLAG_COMPRESSED != 0 {
            decompress_payload(raw_payload)?
        } else {
            raw_payload.to_vec()
        };

        Ok((
            Frame {
                msg_type,
                flags,
                payload,
            },
            total_len,
        ))
    }

    /// Encode SyncStep1: send our version vector
    pub fn encode_sync_step1(version: &VersionVector) -> Vec<u8> {
        let payload = version.encode();
        Self::encode_frame(MessageType::SyncStep1, &payload)
    }

    /// Encode SyncStep2: send missing updates
    pub fn encode_sync_step2(updates: &[u8]) -> Vec<u8> {
        Self::encode_frame(MessageType::SyncStep2, updates)
    }

    /// Encode an incremental update
    pub fn encode_update(update: &[u8]) -> Vec<u8> {
        Self::encode_frame(MessageType::Update, update)
    }

    /// Encode awareness state
    pub fn encode_awareness(awareness_json: &[u8]) -> Vec<u8> {
        Self::encode_frame(MessageType::Awareness, awareness_json)
    }

    /// Encode error message
    pub fn encode_error(error_msg: &str) -> Vec<u8> {
        Self::encode_frame(MessageType::Error, error_msg.as_bytes())
    }

    /// Encode acknowledgement
    pub fn encode_ack() -> Vec<u8> {
        Self::encode_frame(MessageType::Ack, &[])
    }
}

#[cfg(feature = "compression")]
fn compress_payload(payload: &[u8]) -> (Vec<u8>, u8) {
    if payload.len() > COMPRESSION_THRESHOLD {
        match zstd::encode_all(payload, 3) {
            Ok(compressed) => (compressed, FLAG_COMPRESSED),
            Err(_) => (payload.to_vec(), 0u8),
        }
    } else {
        (payload.to_vec(), 0u8)
    }
}

#[cfg(not(feature = "compression"))]
fn compress_payload(payload: &[u8]) -> (Vec<u8>, u8) {
    (payload.to_vec(), 0u8)
}

#[cfg(feature = "compression")]
fn decompress_payload(raw_payload: &[u8]) -> Result<Vec<u8>, SyncError> {
    zstd::decode_all(raw_payload).map_err(|_| SyncError::DecompressionFailed)
}

#[cfg(not(feature = "compression"))]
fn decompress_payload(_raw_payload: &[u8]) -> Result<Vec<u8>, SyncError> {
    Err(SyncError::DecompressionFailed)
}

/// VarInt encoding: 7 bits per byte, MSB = continuation bit
fn encode_varint(buf: &mut Vec<u8>, mut value: u64) {
    loop {
        let byte = (value & 0x7F) as u8;
        value >>= 7;
        if value == 0 {
            buf.push(byte);
            break;
        }
        buf.push(byte | 0x80);
    }
}

/// VarInt decoding — returns (value, bytes_consumed)
fn decode_varint(data: &[u8]) -> Result<(u64, usize), SyncError> {
    let mut value: u64 = 0;
    let mut shift = 0;
    for (i, &byte) in data.iter().enumerate() {
        value |= ((byte & 0x7F) as u64) << shift;
        if byte & 0x80 == 0 {
            return Ok((value, i + 1));
        }
        shift += 7;
        if shift >= 64 {
            return Err(SyncError::InvalidVarInt);
        }
    }
    Err(SyncError::InsufficientData)
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum SyncError {
    #[error("Insufficient data")]
    InsufficientData,

    #[error("Unknown message type: {0:#x}")]
    UnknownMessageType(u8),

    #[error("Decompression failed")]
    DecompressionFailed,

    #[error("Invalid varint")]
    InvalidVarInt,

    #[error("Invalid payload")]
    InvalidPayload,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_varint_roundtrip() {
        for value in [0, 1, 127, 128, 255, 16383, 16384, u64::MAX / 2] {
            let mut buf = Vec::new();
            encode_varint(&mut buf, value);
            let (decoded, _) = decode_varint(&buf).unwrap();
            assert_eq!(decoded, value);
        }
    }

    #[test]
    fn test_encode_decode_frame() {
        let payload = b"Hello, sync!";
        let encoded = SyncProtocol::encode_frame(MessageType::Update, payload);
        let (frame, consumed) = SyncProtocol::decode_frame(&encoded).unwrap();
        assert_eq!(frame.msg_type, MessageType::Update);
        assert_eq!(frame.payload, payload);
        assert_eq!(consumed, encoded.len());
    }

    #[test]
    fn test_compression_for_large_payloads() {
        let payload = vec![0u8; 2000]; // > 1KB threshold
        let encoded = SyncProtocol::encode_frame(MessageType::Update, &payload);
        let (frame, _) = SyncProtocol::decode_frame(&encoded).unwrap();
        assert_eq!(frame.payload, payload);
        // Encoded should be smaller due to compression
        assert!(encoded.len() < payload.len());
    }

    #[test]
    fn test_sync_step1_roundtrip() {
        let mut vv = VersionVector::new();
        vv.tick("peer_a");
        vv.tick("peer_b");

        let encoded = SyncProtocol::encode_sync_step1(&vv);
        let (frame, _) = SyncProtocol::decode_frame(&encoded).unwrap();
        assert_eq!(frame.msg_type, MessageType::SyncStep1);

        let decoded_vv = VersionVector::decode(&frame.payload).unwrap();
        assert_eq!(decoded_vv.get("peer_a"), 1);
        assert_eq!(decoded_vv.get("peer_b"), 1);
    }

    #[test]
    fn test_all_message_types() {
        for msg_type in [
            MessageType::SyncStep1,
            MessageType::SyncStep2,
            MessageType::Update,
            MessageType::Awareness,
            MessageType::Query,
            MessageType::Snapshot,
            MessageType::Auth,
            MessageType::Error,
            MessageType::Ack,
        ] {
            let encoded = SyncProtocol::encode_frame(msg_type, b"test");
            let (frame, _) = SyncProtocol::decode_frame(&encoded).unwrap();
            assert_eq!(frame.msg_type, msg_type);
        }
    }
}
