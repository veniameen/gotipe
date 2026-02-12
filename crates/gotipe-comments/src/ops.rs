use serde::{Deserialize, Serialize};

/// CRDT operations for comments
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CommentOp {
    Add {
        comment_id: String,
        data: String,
    },
    Update {
        comment_id: String,
        data: String,
    },
    Delete {
        comment_id: String,
    },
    Resolve {
        comment_id: String,
    },
    Reopen {
        comment_id: String,
    },
    AddReaction {
        comment_id: String,
        emoji: String,
        user_id: String,
    },
    RemoveReaction {
        comment_id: String,
        emoji: String,
        user_id: String,
    },
}

/// CRDT operations for suggestions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SuggestionOp {
    Add { suggestion_id: String, data: String },
    Accept { suggestion_id: String },
    Reject { suggestion_id: String },
    Update { suggestion_id: String, data: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_comment_op_serialization() {
        let op = CommentOp::Add {
            comment_id: "c1".into(),
            data: "{}".into(),
        };
        let json = serde_json::to_string(&op).unwrap();
        let _: CommentOp = serde_json::from_str(&json).unwrap();
    }

    #[test]
    fn test_suggestion_op_serialization() {
        let op = SuggestionOp::Accept {
            suggestion_id: "s1".into(),
        };
        let json = serde_json::to_string(&op).unwrap();
        let _: SuggestionOp = serde_json::from_str(&json).unwrap();
    }
}
