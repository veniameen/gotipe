use std::collections::HashMap;

use gotipe_core::BlockId;
use serde::{Deserialize, Serialize};

use crate::ops::OpId;

/// Tree node in the CRDT
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeNode {
    pub block_id: BlockId,
    pub parent_id: Option<BlockId>,
    pub index: usize,
    pub deleted: bool,
    pub last_move: OpId,
}

/// Movable tree CRDT for block reordering and nesting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MovableTreeCrdt {
    nodes: HashMap<String, TreeNode>,
    peer_id: String,
    lamport: u64,
}

impl MovableTreeCrdt {
    pub fn new(peer_id: &str) -> Self {
        MovableTreeCrdt {
            nodes: HashMap::new(),
            peer_id: peer_id.into(),
            lamport: 0,
        }
    }

    /// Insert a new block into the tree
    pub fn insert(&mut self, parent_id: Option<BlockId>, index: usize, block_id: BlockId) -> OpId {
        self.lamport += 1;
        let op_id = OpId::new(self.lamport, &self.peer_id);

        let node = TreeNode {
            block_id: block_id.clone(),
            parent_id,
            index,
            deleted: false,
            last_move: op_id.clone(),
        };

        self.nodes.insert(block_id.0.clone(), node);
        op_id
    }

    /// Move a block to a new parent/index
    pub fn move_node(
        &mut self,
        block_id: &BlockId,
        new_parent_id: Option<BlockId>,
        new_index: usize,
    ) -> Result<OpId, TreeCrdtError> {
        // Cycle detection: ensure new_parent is not a descendant of block_id
        if let Some(ref new_parent) = new_parent_id {
            if self.is_descendant(new_parent, block_id) {
                return Err(TreeCrdtError::CycleDetected);
            }
        }

        self.lamport += 1;
        let op_id = OpId::new(self.lamport, &self.peer_id);

        if let Some(node) = self.nodes.get_mut(&block_id.0) {
            node.parent_id = new_parent_id;
            node.index = new_index;
            node.last_move = op_id.clone();
        } else {
            return Err(TreeCrdtError::NodeNotFound(block_id.clone()));
        }

        Ok(op_id)
    }

    /// Delete a block (mark as tombstone)
    pub fn delete(&mut self, block_id: &BlockId) -> Result<OpId, TreeCrdtError> {
        self.lamport += 1;
        let op_id = OpId::new(self.lamport, &self.peer_id);

        if let Some(node) = self.nodes.get_mut(&block_id.0) {
            node.deleted = true;
            node.last_move = op_id.clone();
        } else {
            return Err(TreeCrdtError::NodeNotFound(block_id.clone()));
        }

        Ok(op_id)
    }

    /// Apply a remote move operation with conflict resolution
    pub fn apply_remote_move(
        &mut self,
        op_id: OpId,
        block_id: &BlockId,
        new_parent_id: Option<BlockId>,
        new_index: usize,
    ) -> Result<(), TreeCrdtError> {
        self.lamport = self.lamport.max(op_id.lamport);

        // Cycle detection
        if let Some(ref new_parent) = new_parent_id {
            if self.is_descendant(new_parent, block_id) {
                // Conflict: reject this move silently
                return Ok(());
            }
        }

        if let Some(node) = self.nodes.get_mut(&block_id.0) {
            // Only apply if op_id is more recent
            if op_id > node.last_move {
                node.parent_id = new_parent_id;
                node.index = new_index;
                node.last_move = op_id;
            }
        }

        Ok(())
    }

    /// Get children of a node (sorted by index, then by OpId for conflict resolution)
    pub fn children(&self, parent_id: Option<&BlockId>) -> Vec<&TreeNode> {
        let mut children: Vec<&TreeNode> = self
            .nodes
            .values()
            .filter(|n| {
                !n.deleted
                    && match (&n.parent_id, parent_id) {
                        (None, None) => true,
                        (Some(a), Some(b)) => a == b,
                        _ => false,
                    }
            })
            .collect();
        children.sort_by(|a, b| a.index.cmp(&b.index).then(a.last_move.cmp(&b.last_move)));
        children
    }

    /// Check if `potential_descendant` is a descendant of `ancestor`
    fn is_descendant(&self, potential_descendant: &BlockId, ancestor: &BlockId) -> bool {
        if potential_descendant == ancestor {
            return true;
        }

        let mut current = potential_descendant.clone();
        let mut visited = std::collections::HashSet::new();

        loop {
            if visited.contains(&current.0) {
                return false; // Already in a cycle, shouldn't happen
            }
            visited.insert(current.0.clone());

            if let Some(node) = self.nodes.get(&current.0) {
                if let Some(ref parent) = node.parent_id {
                    if parent == ancestor {
                        return true;
                    }
                    current = parent.clone();
                } else {
                    return false;
                }
            } else {
                return false;
            }
        }
    }

    /// Get ordered list of root-level block IDs
    pub fn root_order(&self) -> Vec<BlockId> {
        self.children(None)
            .into_iter()
            .map(|n| n.block_id.clone())
            .collect()
    }

    pub fn get_node(&self, block_id: &BlockId) -> Option<&TreeNode> {
        self.nodes.get(&block_id.0).filter(|n| !n.deleted)
    }

    pub fn node_count(&self) -> usize {
        self.nodes.values().filter(|n| !n.deleted).count()
    }
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum TreeCrdtError {
    #[error("Cycle detected in tree")]
    CycleDetected,

    #[error("Node not found: {0}")]
    NodeNotFound(BlockId),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_insert_and_children() {
        let mut tree = MovableTreeCrdt::new("peer_a");
        tree.insert(None, 0, BlockId("a".into()));
        tree.insert(None, 1, BlockId("b".into()));

        let roots = tree.root_order();
        assert_eq!(roots.len(), 2);
    }

    #[test]
    fn test_move_node() {
        let mut tree = MovableTreeCrdt::new("peer_a");
        tree.insert(None, 0, BlockId("parent".into()));
        tree.insert(None, 1, BlockId("child".into()));

        tree.move_node(&BlockId("child".into()), Some(BlockId("parent".into())), 0)
            .unwrap();

        let roots = tree.root_order();
        assert_eq!(roots.len(), 1); // only "parent" at root
        let children = tree.children(Some(&BlockId("parent".into())));
        assert_eq!(children.len(), 1);
    }

    #[test]
    fn test_delete_node() {
        let mut tree = MovableTreeCrdt::new("peer_a");
        tree.insert(None, 0, BlockId("a".into()));
        tree.delete(&BlockId("a".into())).unwrap();
        assert_eq!(tree.root_order().len(), 0);
    }

    #[test]
    fn test_cycle_detection() {
        let mut tree = MovableTreeCrdt::new("peer_a");
        tree.insert(None, 0, BlockId("a".into()));
        tree.insert(Some(BlockId("a".into())), 0, BlockId("b".into()));

        // Try to move 'a' under 'b' — should fail (cycle)
        let result = tree.move_node(&BlockId("a".into()), Some(BlockId("b".into())), 0);
        assert!(result.is_err());
    }

    #[test]
    fn test_concurrent_moves_resolved_by_opid() {
        let mut tree = MovableTreeCrdt::new("peer_a");
        tree.insert(None, 0, BlockId("root1".into()));
        tree.insert(None, 1, BlockId("root2".into()));
        tree.insert(None, 2, BlockId("child".into()));

        // peer_a moves child under root1
        tree.move_node(&BlockId("child".into()), Some(BlockId("root1".into())), 0)
            .unwrap();

        // Remote peer_b also moved child under root2 with higher lamport
        tree.apply_remote_move(
            OpId::new(100, "peer_b"),
            &BlockId("child".into()),
            Some(BlockId("root2".into())),
            0,
        )
        .unwrap();

        // peer_b's move should win (higher lamport)
        let node = tree.get_node(&BlockId("child".into())).unwrap();
        assert_eq!(node.parent_id, Some(BlockId("root2".into())));
    }
}
