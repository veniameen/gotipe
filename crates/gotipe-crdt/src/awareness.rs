use std::collections::HashMap;

use gotipe_core::BlockId;
use serde::{Deserialize, Serialize};

const STALE_TIMEOUT_MS: u64 = 30_000; // 30 seconds

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub name: String,
    pub color: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorPosition {
    pub block_id: BlockId,
    pub offset: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionRange {
    pub block_id: BlockId,
    pub from: usize,
    pub to: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AwarenessState {
    pub peer_id: String,
    pub user: UserInfo,
    pub cursor: Option<CursorPosition>,
    pub selection: Option<SelectionRange>,
    pub timestamp: u64,
}

/// Awareness protocol — tracks peer cursors, selections, and presence
#[derive(Debug, Clone)]
pub struct AwarenessProtocol {
    local_peer_id: String,
    states: HashMap<String, AwarenessState>,
}

impl AwarenessProtocol {
    pub fn new(peer_id: &str, user: UserInfo) -> Self {
        let state = AwarenessState {
            peer_id: peer_id.into(),
            user,
            cursor: None,
            selection: None,
            timestamp: current_time_ms(),
        };

        let mut states = HashMap::new();
        states.insert(peer_id.into(), state);

        AwarenessProtocol {
            local_peer_id: peer_id.into(),
            states,
        }
    }

    pub fn set_cursor(&mut self, cursor: CursorPosition) {
        if let Some(state) = self.states.get_mut(&self.local_peer_id) {
            state.cursor = Some(cursor);
            state.selection = None;
            state.timestamp = current_time_ms();
        }
    }

    pub fn set_selection(&mut self, selection: SelectionRange) {
        if let Some(state) = self.states.get_mut(&self.local_peer_id) {
            state.selection = Some(selection);
            state.cursor = None;
            state.timestamp = current_time_ms();
        }
    }

    pub fn clear_cursor(&mut self) {
        if let Some(state) = self.states.get_mut(&self.local_peer_id) {
            state.cursor = None;
            state.selection = None;
            state.timestamp = current_time_ms();
        }
    }

    /// Apply a remote awareness state
    pub fn apply_remote(&mut self, remote_state: AwarenessState) {
        let existing = self.states.get(&remote_state.peer_id);
        let should_update = match existing {
            Some(existing) => remote_state.timestamp > existing.timestamp,
            None => true,
        };

        if should_update {
            self.states
                .insert(remote_state.peer_id.clone(), remote_state);
        }
    }

    /// Remove stale peers (not updated within 30s)
    pub fn cleanup_stale(&mut self) {
        let now = current_time_ms();
        self.states.retain(|peer_id, state| {
            peer_id == &self.local_peer_id || (now - state.timestamp) < STALE_TIMEOUT_MS
        });
    }

    /// Get all remote peer states
    pub fn remote_states(&self) -> Vec<&AwarenessState> {
        self.states
            .values()
            .filter(|s| s.peer_id != self.local_peer_id)
            .collect()
    }

    /// Get the local state
    pub fn local_state(&self) -> Option<&AwarenessState> {
        self.states.get(&self.local_peer_id)
    }

    /// Get all states (including local)
    pub fn all_states(&self) -> Vec<&AwarenessState> {
        self.states.values().collect()
    }

    /// Get state count (including local)
    pub fn peer_count(&self) -> usize {
        self.states.len()
    }

    /// Encode local state for broadcasting
    pub fn encode_local(&self) -> Vec<u8> {
        if let Some(state) = self.local_state() {
            serde_json::to_vec(state).unwrap_or_default()
        } else {
            vec![]
        }
    }

    /// Decode a remote awareness update
    pub fn decode_remote(data: &[u8]) -> Result<AwarenessState, serde_json::Error> {
        serde_json::from_slice(data)
    }
}

fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_user(name: &str) -> UserInfo {
        UserInfo {
            name: name.into(),
            color: "#ff0000".into(),
            avatar_url: None,
        }
    }

    #[test]
    fn test_set_cursor() {
        let mut awareness = AwarenessProtocol::new("peer_a", make_user("Alice"));
        awareness.set_cursor(CursorPosition {
            block_id: BlockId("b1".into()),
            offset: 5,
        });
        let state = awareness.local_state().unwrap();
        assert!(state.cursor.is_some());
        assert!(state.selection.is_none());
    }

    #[test]
    fn test_set_selection() {
        let mut awareness = AwarenessProtocol::new("peer_a", make_user("Alice"));
        awareness.set_selection(SelectionRange {
            block_id: BlockId("b1".into()),
            from: 2,
            to: 8,
        });
        let state = awareness.local_state().unwrap();
        assert!(state.selection.is_some());
        assert!(state.cursor.is_none());
    }

    #[test]
    fn test_apply_remote() {
        let mut awareness = AwarenessProtocol::new("peer_a", make_user("Alice"));
        let remote = AwarenessState {
            peer_id: "peer_b".into(),
            user: make_user("Bob"),
            cursor: Some(CursorPosition {
                block_id: BlockId("b1".into()),
                offset: 3,
            }),
            selection: None,
            timestamp: current_time_ms(),
        };
        awareness.apply_remote(remote);
        assert_eq!(awareness.peer_count(), 2);
        assert_eq!(awareness.remote_states().len(), 1);
    }

    #[test]
    fn test_encode_decode_roundtrip() {
        let mut awareness = AwarenessProtocol::new("peer_a", make_user("Alice"));
        awareness.set_cursor(CursorPosition {
            block_id: BlockId("b1".into()),
            offset: 5,
        });

        let encoded = awareness.encode_local();
        let decoded = AwarenessProtocol::decode_remote(&encoded).unwrap();
        assert_eq!(decoded.peer_id, "peer_a");
    }
}
