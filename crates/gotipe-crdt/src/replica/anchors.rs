use super::ReplicaState;
use crate::ops::OpId;
use gotipe_core::BlockId;
use serde::{Deserialize, Serialize};

/// A boundary attached to character identities; it survives concurrent inserts,
/// tombstones, and text routing through split/merge operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextAnchor {
    pub block_id: BlockId,
    pub left: Option<OpId>,
    pub right: Option<OpId>,
    pub prefer_right: bool,
}
impl ReplicaState {
    pub(crate) fn text_anchor(
        &self,
        block_id: &BlockId,
        offset: usize,
        prefer_right: bool,
    ) -> Option<TextAnchor> {
        let node = self.nodes.get(&block_id.0).filter(|node| !node.deleted)?;
        let chars = node.visible_chars();
        let mut units = 0;
        let index = (0..=chars.len()).find(|&index| {
            let matches = units == offset;
            if let Some(ch) = chars.get(index) {
                units += ch.value.len_utf16();
            }
            matches
        })?;
        Some(TextAnchor {
            block_id: block_id.clone(),
            left: index.checked_sub(1).map(|i| chars[i].id.clone()),
            right: chars.get(index).map(|ch| ch.id.clone()),
            prefer_right,
        })
    }
    pub(crate) fn resolve_anchor(&self, anchor: &TextAnchor) -> Option<(BlockId, usize)> {
        let choices = if anchor.prefer_right {
            [(&anchor.right, false), (&anchor.left, true)]
        } else {
            [(&anchor.left, true), (&anchor.right, false)]
        };
        for (identity, after) in choices {
            let Some(identity) = identity else {
                continue;
            };
            for (id, node) in self.nodes.iter().filter(|(_, node)| !node.deleted) {
                if let Some(target) = node.chars.get(identity) {
                    let offset = node
                        .visible_chars()
                        .into_iter()
                        .filter(|ch| ch.position < target.position || (after && ch.id == target.id))
                        .map(|ch| ch.value.len_utf16())
                        .sum();
                    return Some((BlockId(id.clone()), offset));
                }
            }
        }
        self.nodes
            .get(&anchor.block_id.0)
            .filter(|node| !node.deleted)
            .map(|_| (anchor.block_id.clone(), 0))
    }
}
