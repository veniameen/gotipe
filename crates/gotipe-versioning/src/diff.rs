use gotipe_core::BlockId;
use serde::{Deserialize, Serialize};

/// Diff between two versions of a document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionDiff {
    pub block_changes: Vec<BlockChange>,
    pub text_changes: Vec<TextChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BlockChange {
    Added {
        block_id: BlockId,
        block_type: String,
    },
    Removed {
        block_id: BlockId,
        block_type: String,
    },
    Modified {
        block_id: BlockId,
        field: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TextChange {
    Inserted {
        block_id: BlockId,
        offset: usize,
        text: String,
        peer_id: String,
    },
    Deleted {
        block_id: BlockId,
        offset: usize,
        length: usize,
        peer_id: String,
    },
}

impl VersionDiff {
    pub fn new() -> Self {
        VersionDiff {
            block_changes: Vec::new(),
            text_changes: Vec::new(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.block_changes.is_empty() && self.text_changes.is_empty()
    }

    /// Compute diff between two documents
    pub fn compute(old: &gotipe_core::Document, new: &gotipe_core::Document) -> Self {
        let mut diff = VersionDiff::new();

        // Collect block IDs from each document
        let old_ids: std::collections::HashSet<&BlockId> = old.flatten().map(|b| &b.id).collect();
        let new_ids: std::collections::HashSet<&BlockId> = new.flatten().map(|b| &b.id).collect();

        // Added blocks
        for block in new.flatten() {
            if !old_ids.contains(&block.id) {
                diff.block_changes.push(BlockChange::Added {
                    block_id: block.id.clone(),
                    block_type: block.block_type.clone(),
                });
            }
        }

        // Removed blocks
        for block in old.flatten() {
            if !new_ids.contains(&block.id) {
                diff.block_changes.push(BlockChange::Removed {
                    block_id: block.id.clone(),
                    block_type: block.block_type.clone(),
                });
            }
        }

        // Modified blocks (type or attrs changed)
        for new_block in new.flatten() {
            if let Some(old_block) = old.find_block(&new_block.id) {
                if old_block.block_type != new_block.block_type {
                    diff.block_changes.push(BlockChange::Modified {
                        block_id: new_block.id.clone(),
                        field: "block_type".into(),
                    });
                }
            }
        }

        diff
    }
}

impl Default for VersionDiff {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gotipe_core::{Block, BlockContent, Document};
    use std::collections::HashMap;

    fn make_doc(blocks: Vec<(&str, &str)>) -> Document {
        Document {
            blocks: blocks
                .into_iter()
                .map(|(id, text)| Block {
                    id: BlockId(id.into()),
                    block_type: "paragraph".into(),
                    attrs: HashMap::new(),
                    content: BlockContent::RichText(vec![gotipe_core::TextSpan {
                        text: text.into(),
                        marks: vec![],
                    }]),
                    children: vec![],
                })
                .collect(),
            version: 0,
        }
    }

    #[test]
    fn test_no_diff_for_identical_docs() {
        let doc = make_doc(vec![("b1", "Hello")]);
        let diff = VersionDiff::compute(&doc, &doc);
        assert!(diff.is_empty());
    }

    #[test]
    fn test_added_block() {
        let old = make_doc(vec![("b1", "Hello")]);
        let new = make_doc(vec![("b1", "Hello"), ("b2", "World")]);
        let diff = VersionDiff::compute(&old, &new);
        assert_eq!(diff.block_changes.len(), 1);
        assert!(matches!(&diff.block_changes[0], BlockChange::Added { .. }));
    }

    #[test]
    fn test_removed_block() {
        let old = make_doc(vec![("b1", "Hello"), ("b2", "World")]);
        let new = make_doc(vec![("b1", "Hello")]);
        let diff = VersionDiff::compute(&old, &new);
        assert_eq!(diff.block_changes.len(), 1);
        assert!(matches!(
            &diff.block_changes[0],
            BlockChange::Removed { .. }
        ));
    }
}
