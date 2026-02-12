use gotipe_core::BlockId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SuggestionStatus {
    Pending,
    Streaming,
    Done,
    Dismissed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhostText {
    pub text: String,
    pub block_id: BlockId,
    pub offset: usize,
}

/// State for inline AI suggestions (ghost text)
#[derive(Debug, Clone)]
pub struct SuggestionState {
    pub ghost_text: Option<GhostText>,
    pub status: SuggestionStatus,
    pub request_id: u64,
}

impl SuggestionState {
    pub fn new() -> Self {
        SuggestionState {
            ghost_text: None,
            status: SuggestionStatus::Dismissed,
            request_id: 0,
        }
    }

    /// Start a new suggestion request (auto-dismisses previous)
    pub fn start_request(&mut self) -> u64 {
        self.request_id += 1;
        self.ghost_text = None;
        self.status = SuggestionStatus::Pending;
        self.request_id
    }

    /// Set streaming text for a specific request
    pub fn set_streaming(&mut self, request_id: u64, text: &str, block_id: BlockId, offset: usize) {
        if request_id != self.request_id {
            return; // Stale request, discard
        }
        self.ghost_text = Some(GhostText {
            text: text.into(),
            block_id,
            offset,
        });
        self.status = SuggestionStatus::Streaming;
    }

    /// Mark request as complete
    pub fn complete(&mut self, request_id: u64) {
        if request_id != self.request_id {
            return;
        }
        self.status = SuggestionStatus::Done;
    }

    /// Dismiss the current suggestion (auto-dismiss on any keystroke)
    pub fn dismiss(&mut self) {
        self.ghost_text = None;
        self.status = SuggestionStatus::Dismissed;
    }

    /// Accept the suggestion — returns the ghost text to insert
    pub fn accept(&mut self) -> Option<GhostText> {
        let ghost = self.ghost_text.take();
        self.status = SuggestionStatus::Dismissed;
        ghost
    }

    pub fn has_suggestion(&self) -> bool {
        self.ghost_text.is_some()
            && (self.status == SuggestionStatus::Done || self.status == SuggestionStatus::Streaming)
    }
}

impl Default for SuggestionState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_start_request_increments_id() {
        let mut state = SuggestionState::new();
        let id1 = state.start_request();
        let id2 = state.start_request();
        assert!(id2 > id1);
    }

    #[test]
    fn test_stale_request_ignored() {
        let mut state = SuggestionState::new();
        let id1 = state.start_request();
        let _id2 = state.start_request();

        // Try to set text for the old request — should be ignored
        state.set_streaming(id1, "old text", BlockId("b1".into()), 0);
        assert!(!state.has_suggestion());
    }

    #[test]
    fn test_dismiss_clears_ghost_text() {
        let mut state = SuggestionState::new();
        let id = state.start_request();
        state.set_streaming(id, "hello", BlockId("b1".into()), 0);
        assert!(state.has_suggestion());
        state.dismiss();
        assert!(!state.has_suggestion());
    }

    #[test]
    fn test_accept_returns_ghost_text() {
        let mut state = SuggestionState::new();
        let id = state.start_request();
        state.set_streaming(id, "suggestion", BlockId("b1".into()), 5);
        state.complete(id);
        let ghost = state.accept().unwrap();
        assert_eq!(ghost.text, "suggestion");
        assert!(!state.has_suggestion());
    }
}
