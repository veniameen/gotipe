//! Canonical Cloud WebSocket frames: one message-type byte and an opaque payload.
//! JSON interpretation belongs to the operation/awareness receiver, not framing.
use crate::version::VersionVector;

#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageType {
    SyncStep1 = 0x01,
    SyncStep2 = 0x02,
    Update = 0x03,
    Awareness = 0x04,
    Query = 0x05,
    Snapshot = 0x06,
    Auth = 0x07,
    Error = 0x08,
    Ack = 0x09,
}
impl MessageType {
    pub fn from_u8(byte: u8) -> Option<Self> {
        Some(match byte {
            1 => Self::SyncStep1,
            2 => Self::SyncStep2,
            3 => Self::Update,
            4 => Self::Awareness,
            5 => Self::Query,
            6 => Self::Snapshot,
            7 => Self::Auth,
            8 => Self::Error,
            9 => Self::Ack,
            _ => return None,
        })
    }
}
/// Legacy flag constants remain source-compatible; canonical frames have no flags.
pub const FLAG_COMPRESSED: u8 = 1;
pub const FLAG_REQUIRES_ACK: u8 = 2;
pub struct SyncProtocol;
#[derive(Debug, Clone)]
pub struct Frame {
    pub msg_type: MessageType,
    /// Always zero for the canonical protocol.
    pub flags: u8,
    pub payload: Vec<u8>,
}
impl SyncProtocol {
    pub fn encode_frame(msg_type: MessageType, payload: &[u8]) -> Vec<u8> {
        let mut frame = Vec::with_capacity(payload.len() + 1);
        frame.push(msg_type as u8);
        frame.extend_from_slice(payload);
        frame
    }
    /// A WebSocket message is exactly one frame; concatenation is not supported.
    pub fn decode_frame(data: &[u8]) -> Result<(Frame, usize), SyncError> {
        let byte = *data.first().ok_or(SyncError::InsufficientData)?;
        let msg_type = MessageType::from_u8(byte).ok_or(SyncError::UnknownMessageType(byte))?;
        Ok((
            Frame {
                msg_type,
                flags: 0,
                payload: data[1..].to_vec(),
            },
            data.len(),
        ))
    }
    pub fn encode_sync_step1(_version: &VersionVector) -> Vec<u8> {
        Self::encode_frame(MessageType::SyncStep1, &[])
    }
    pub fn encode_sync_step2(updates: &[u8]) -> Vec<u8> {
        Self::encode_frame(MessageType::SyncStep2, updates)
    }
    pub fn encode_update(update: &[u8]) -> Vec<u8> {
        Self::encode_frame(MessageType::Update, update)
    }
    pub fn encode_awareness(awareness_json: &[u8]) -> Vec<u8> {
        Self::encode_frame(MessageType::Awareness, awareness_json)
    }
    pub fn encode_error(error_msg: &str) -> Vec<u8> {
        let payload = serde_json::json!({"code":"SYNC_ERROR","message":error_msg}).to_string();
        Self::encode_frame(MessageType::Error, payload.as_bytes())
    }
    pub fn encode_ack() -> Vec<u8> {
        vec![MessageType::Ack as u8]
    }
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
    fn cloud_frames_match_exact_websocket_bytes() {
        assert_eq!(SyncProtocol::encode_ack(), [9]);
        assert_eq!(SyncProtocol::encode_sync_step1(&VersionVector::new()), [1]);
        let payload = br#"{"protocol":"gotipe.crdt/1","operations":[]}"#;
        let mut expected = vec![3];
        expected.extend_from_slice(payload);
        assert_eq!(SyncProtocol::encode_update(payload), expected);
        let (frame, used) = SyncProtocol::decode_frame(&expected).unwrap();
        assert_eq!(frame.payload, payload);
        assert_eq!(used, expected.len());
        assert_eq!(frame.flags, 0);
        assert!(SyncProtocol::decode_frame(&[9])
            .unwrap()
            .0
            .payload
            .is_empty());
    }
    #[test]
    fn large_payload_is_never_implicitly_compressed() {
        let payload = vec![b'x'; 100_000];
        let encoded = SyncProtocol::encode_update(&payload);
        assert_eq!(encoded.len(), payload.len() + 1);
        assert_eq!(
            SyncProtocol::decode_frame(&encoded).unwrap().0.payload,
            payload
        );
    }
    #[test]
    fn errors_are_structured_and_invalid_type_is_rejected() {
        let encoded = SyncProtocol::encode_error("failure Ж😀");
        let (frame, _) = SyncProtocol::decode_frame(&encoded).unwrap();
        let value: serde_json::Value = serde_json::from_slice(&frame.payload).unwrap();
        assert_eq!(value["message"], "failure Ж😀");
        assert!(SyncProtocol::decode_frame(&[]).is_err());
        assert!(SyncProtocol::decode_frame(&[255]).is_err());
    }
}
