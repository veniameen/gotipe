use std::collections::HashMap;

use gotipe_core::{AttrValue, Mark, Timestamp};
use serde::{Deserialize, Serialize};

use crate::comment::{CommentAnchor, CommentThread};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SuggestionId(pub String);

impl SuggestionId {
    pub fn new() -> Self {
        SuggestionId(uuid::Uuid::now_v7().to_string())
    }
}

impl Default for SuggestionId {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SuggestionType {
    Insert,
    Delete,
    Replace,
    Format {
        old_marks: Vec<Mark>,
        new_marks: Vec<Mark>,
    },
    BlockChange {
        old_type: String,
        new_type: String,
        old_attrs: HashMap<String, AttrValue>,
        new_attrs: HashMap<String, AttrValue>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SuggestionStatus {
    Pending,
    Accepted,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Suggestion {
    pub id: SuggestionId,
    pub suggestion_type: SuggestionType,
    pub author: String,
    pub created_at: Timestamp,
    pub anchor: CommentAnchor,
    pub comment_thread: Option<CommentThread>,
    pub status: SuggestionStatus,
}

impl Suggestion {
    pub fn new(author: &str, suggestion_type: SuggestionType, anchor: CommentAnchor) -> Self {
        Suggestion {
            id: SuggestionId::new(),
            suggestion_type,
            author: author.into(),
            created_at: Timestamp::now(),
            anchor,
            comment_thread: None,
            status: SuggestionStatus::Pending,
        }
    }

    pub fn accept(&mut self) {
        self.status = SuggestionStatus::Accepted;
    }

    pub fn reject(&mut self) {
        self.status = SuggestionStatus::Rejected;
    }

    pub fn is_pending(&self) -> bool {
        self.status == SuggestionStatus::Pending
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_suggestion() {
        let suggestion = Suggestion::new("alice", SuggestionType::Insert, CommentAnchor::Document);
        assert!(suggestion.is_pending());
    }

    #[test]
    fn test_accept_suggestion() {
        let mut suggestion =
            Suggestion::new("alice", SuggestionType::Delete, CommentAnchor::Document);
        suggestion.accept();
        assert_eq!(suggestion.status, SuggestionStatus::Accepted);
    }

    #[test]
    fn test_reject_suggestion() {
        let mut suggestion =
            Suggestion::new("alice", SuggestionType::Replace, CommentAnchor::Document);
        suggestion.reject();
        assert_eq!(suggestion.status, SuggestionStatus::Rejected);
    }
}
