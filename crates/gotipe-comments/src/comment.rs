use std::collections::HashMap;

use chrono::{DateTime, Utc};
use gotipe_core::{AttrValue, BlockId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CommentId(pub String);

impl CommentId {
    pub fn new() -> Self {
        CommentId(uuid::Uuid::now_v7().to_string())
    }
}

impl Default for CommentId {
    fn default() -> Self {
        Self::new()
    }
}

/// Where a comment is anchored in the document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CommentAnchor {
    /// Anchored to a text range within a block
    Inline {
        block_id: BlockId,
        from: usize,
        to: usize,
    },
    /// A text range whose endpoints belong to different blocks.
    Range {
        from_block_id: BlockId,
        from_offset: usize,
        to_block_id: BlockId,
        to_offset: usize,
    },
    /// Anchored to an entire block
    Block { block_id: BlockId },
    /// Anchored to the entire document
    Document,
}

/// A single comment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    pub id: CommentId,
    pub anchor: CommentAnchor,
    pub author: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub resolved_by: Option<String>,
    pub parent_id: Option<CommentId>,
    pub reactions: Vec<Reaction>,
    pub metadata: HashMap<String, AttrValue>,
}

impl Comment {
    pub fn new(author: &str, content: &str, anchor: CommentAnchor) -> Self {
        let now = Utc::now();
        Comment {
            id: CommentId::new(),
            anchor,
            author: author.into(),
            content: content.into(),
            created_at: now,
            updated_at: now,
            resolved_at: None,
            resolved_by: None,
            parent_id: None,
            reactions: Vec::new(),
            metadata: HashMap::new(),
        }
    }

    pub fn reply(author: &str, content: &str, parent_id: CommentId, anchor: CommentAnchor) -> Self {
        let mut comment = Self::new(author, content, anchor);
        comment.parent_id = Some(parent_id);
        comment
    }

    pub fn resolve(&mut self, resolved_by: &str) {
        self.resolved_at = Some(Utc::now());
        self.resolved_by = Some(resolved_by.into());
    }

    pub fn reopen(&mut self) {
        self.resolved_at = None;
        self.resolved_by = None;
    }

    pub fn is_resolved(&self) -> bool {
        self.resolved_at.is_some()
    }

    pub fn add_reaction(&mut self, emoji: &str, user_id: &str) {
        if !self
            .reactions
            .iter()
            .any(|r| r.emoji == emoji && r.user_id == user_id)
        {
            self.reactions.push(Reaction {
                emoji: emoji.into(),
                user_id: user_id.into(),
                created_at: Utc::now(),
            });
        }
    }

    pub fn remove_reaction(&mut self, emoji: &str, user_id: &str) {
        self.reactions
            .retain(|r| !(r.emoji == emoji && r.user_id == user_id));
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reaction {
    pub emoji: String,
    pub user_id: String,
    pub created_at: DateTime<Utc>,
}

/// A comment thread with root and replies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentThread {
    pub root: Comment,
    pub replies: Vec<Comment>,
}

impl CommentThread {
    pub fn new(root: Comment) -> Self {
        CommentThread {
            root,
            replies: Vec::new(),
        }
    }

    pub fn add_reply(&mut self, reply: Comment) {
        self.replies.push(reply);
    }

    pub fn is_resolved(&self) -> bool {
        self.root.is_resolved()
    }

    pub fn resolve(&mut self, resolved_by: &str) {
        self.root.resolve(resolved_by);
    }

    pub fn reopen(&mut self) {
        self.root.reopen();
    }

    pub fn reply_count(&self) -> usize {
        self.replies.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_comment() {
        let comment = Comment::new("alice", "Hello!", CommentAnchor::Document);
        assert_eq!(comment.author, "alice");
        assert!(!comment.is_resolved());
    }

    #[test]
    fn test_resolve_and_reopen() {
        let mut comment = Comment::new("alice", "Fix this", CommentAnchor::Document);
        comment.resolve("bob");
        assert!(comment.is_resolved());
        comment.reopen();
        assert!(!comment.is_resolved());
    }

    #[test]
    fn test_reactions() {
        let mut comment = Comment::new("alice", "Great!", CommentAnchor::Document);
        comment.add_reaction("thumbsup", "bob");
        assert_eq!(comment.reactions.len(), 1);

        // Duplicate reaction not added
        comment.add_reaction("thumbsup", "bob");
        assert_eq!(comment.reactions.len(), 1);

        comment.remove_reaction("thumbsup", "bob");
        assert_eq!(comment.reactions.len(), 0);
    }

    #[test]
    fn test_comment_thread() {
        let root = Comment::new("alice", "Root", CommentAnchor::Document);
        let mut thread = CommentThread::new(root);
        let reply = Comment::new("bob", "Reply", CommentAnchor::Document);
        thread.add_reply(reply);
        assert_eq!(thread.reply_count(), 1);
    }
}
