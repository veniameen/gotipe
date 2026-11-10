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

        // Stable IDs identify structural, formatting and text changes independently.
        for new_block in new.flatten() {
            if let Some(old_block) = old.find_block(&new_block.id) {
                let mut changed = |field: &str| {
                    diff.block_changes.push(BlockChange::Modified {
                        block_id: new_block.id.clone(),
                        field: field.into(),
                    })
                };
                if old_block.block_type != new_block.block_type {
                    changed("block_type");
                }
                if old_block.attrs != new_block.attrs {
                    changed("attrs");
                }
                if old.parent_and_index(&new_block.id) != new.parent_and_index(&new_block.id) {
                    changed("position");
                }
                if serde_json::to_value(&old_block.content).ok()
                    != serde_json::to_value(&new_block.content).ok()
                {
                    changed("content");
                    diff.text_changes.extend(text_changes(
                        &new_block.id,
                        &text(old_block),
                        &text(new_block),
                    ));
                }
            }
        }

        diff
    }
}

fn text(block: &gotipe_core::Block) -> String {
    match &block.content {
        gotipe_core::BlockContent::RichText(spans) => {
            spans.iter().map(|s| s.text.as_str()).collect()
        }
        gotipe_core::BlockContent::Raw(text) => text.clone(),
        gotipe_core::BlockContent::Empty => String::new(),
    }
}

/// A contiguous replacement keeps shared prefix/suffix and never cuts a scalar.
fn text_changes(id: &BlockId, old: &str, new: &str) -> Vec<TextChange> {
    let old: Vec<_> = old.chars().collect();
    let new: Vec<_> = new.chars().collect();
    let prefix = old.iter().zip(&new).take_while(|(a, b)| a == b).count();
    let suffix = old[prefix..]
        .iter()
        .rev()
        .zip(new[prefix..].iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    let offset = old[..prefix].iter().map(|c| c.len_utf16()).sum();
    let removed = &old[prefix..old.len() - suffix];
    let inserted = &new[prefix..new.len() - suffix];
    let mut changes = Vec::new();
    if !removed.is_empty() {
        changes.push(TextChange::Deleted {
            block_id: id.clone(),
            offset,
            length: removed.iter().map(|c| c.len_utf16()).sum(),
            peer_id: String::new(),
        });
    }
    if !inserted.is_empty() {
        changes.push(TextChange::Inserted {
            block_id: id.clone(),
            offset,
            text: inserted.iter().collect(),
            peer_id: String::new(),
        });
    }
    changes
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

#[cfg(test)]
mod integrity_tests {
    use super::*;
    use gotipe_core::{AttrValue, Block, BlockContent, Document, Mark, TextSpan};
    fn node(text: &str) -> Block {
        let mut block = Block::new_with_type(
            "paragraph",
            BlockContent::RichText(vec![TextSpan {
                text: text.into(),
                marks: vec![],
            }]),
        );
        block.id = BlockId("one".into());
        block
    }
    #[test]
    fn replacement_offsets_are_utf16_and_keep_shared_suffix() {
        let old = Document {
            blocks: vec![node("Ж😀oldβ")],
            version: 0,
        };
        let new = Document {
            blocks: vec![node("Ж😀newβ")],
            version: 1,
        };
        let diff = VersionDiff::compute(&old, &new);
        assert!(
            matches!(&diff.text_changes[..],[TextChange::Deleted{offset:3,length:3,..},TextChange::Inserted{offset:3,text,..}] if text=="new")
        );
    }
    #[test]
    fn formatting_attrs_and_reordering_are_visible_without_text_edits() {
        let mut other = node("second");
        other.id = BlockId("two".into());
        let old = Document {
            blocks: vec![node("same"), other],
            version: 0,
        };
        let mut new = old.clone();
        new.blocks.reverse();
        new.blocks[1].attrs.insert(
            "settings".into(),
            AttrValue::Array(vec![AttrValue::Bool(true)]),
        );
        let BlockContent::RichText(spans) = &mut new.blocks[1].content else {
            panic!()
        };
        spans[0].marks.push(Mark::new("bold"));
        let diff = VersionDiff::compute(&old, &new);
        assert!(diff.text_changes.is_empty());
        for field in ["attrs", "content", "position"] {
            assert!(diff.block_changes.iter().any(|change|matches!(change,BlockChange::Modified{block_id,field:changed} if block_id.0=="one"&&changed==field)));
        }
    }
}
