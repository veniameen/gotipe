use std::collections::HashMap;

use gotipe_core::{AttrValue, Block, BlockContent, BlockId, Document, Step};

use crate::history::CrdtHistory;
use crate::lww::LwwMap;
use crate::ops::{CrdtOp, OpId, TextOp, TreeOp};
use crate::text::RichTextCrdt;
use crate::tree::MovableTreeCrdt;
use crate::version::VersionVector;

/// CRDT-enabled document
#[derive(Debug, Clone)]
pub struct CrdtDocument {
    peer_id: String,
    tree: MovableTreeCrdt,
    texts: HashMap<String, RichTextCrdt>,
    attrs: HashMap<String, LwwMap<String, AttrValue>>,
    block_types: HashMap<String, String>,
    version: VersionVector,
    history: CrdtHistory,
    lamport: u64,
}

impl CrdtDocument {
    /// Create a new CRDT document from an existing Document
    pub fn new(peer_id: &str, doc: &Document) -> Self {
        let mut crdt = CrdtDocument {
            peer_id: peer_id.into(),
            tree: MovableTreeCrdt::new(peer_id),
            texts: HashMap::new(),
            attrs: HashMap::new(),
            block_types: HashMap::new(),
            version: VersionVector::new(),
            history: CrdtHistory::new(),
            lamport: 0,
        };

        // Import existing document into CRDT state
        for (i, block) in doc.blocks.iter().enumerate() {
            crdt.import_block(block, None, i);
        }

        crdt
    }

    fn import_block(&mut self, block: &Block, parent_id: Option<BlockId>, index: usize) {
        self.tree.insert(parent_id.clone(), index, block.id.clone());
        self.block_types
            .insert(block.id.0.clone(), block.block_type.clone());

        // Import text content
        if let BlockContent::RichText(spans) = &block.content {
            let mut text_crdt = RichTextCrdt::new(&self.peer_id);
            let mut pos = 0;
            for span in spans {
                for ch in span.text.chars() {
                    text_crdt.insert(pos, ch, span.marks.clone());
                    pos += 1;
                }
            }
            self.texts.insert(block.id.0.clone(), text_crdt);
        } else if let BlockContent::Raw(raw) = &block.content {
            let mut text_crdt = RichTextCrdt::new(&self.peer_id);
            for (pos, ch) in raw.chars().enumerate() {
                text_crdt.insert(pos, ch, vec![]);
            }
            self.texts.insert(block.id.0.clone(), text_crdt);
        }

        // Import attributes
        if !block.attrs.is_empty() {
            let mut lww = LwwMap::new();
            for (k, v) in &block.attrs {
                lww.set(k.clone(), v.clone(), 0, &self.peer_id);
            }
            self.attrs.insert(block.id.0.clone(), lww);
        }

        // Import children
        for (i, child) in block.children.iter().enumerate() {
            self.import_block(child, Some(block.id.clone()), i);
        }
    }

    /// Apply local steps and return CRDT operations to broadcast
    pub fn apply_local(&mut self, steps: &[Step]) -> Vec<CrdtOp> {
        let mut ops = Vec::new();

        for step in steps {
            let step_ops = self.apply_local_step(step);
            ops.extend(step_ops);
        }

        self.version.tick(&self.peer_id);
        ops
    }

    fn apply_local_step(&mut self, step: &Step) -> Vec<CrdtOp> {
        match step {
            Step::InsertText {
                block_id,
                offset,
                text,
                marks,
            } => {
                let mut ops = Vec::new();
                let text_crdt = self
                    .texts
                    .entry(block_id.0.clone())
                    .or_insert_with(|| RichTextCrdt::new(&self.peer_id));
                for (i, ch) in text.chars().enumerate() {
                    let op_id = text_crdt.insert(offset + i, ch, marks.clone());
                    ops.push(CrdtOp::Text(
                        block_id.clone(),
                        TextOp::Insert {
                            id: op_id,
                            pos: offset + i,
                            ch,
                            marks: marks.clone(),
                            left_origin: None,
                            right_origin: None,
                        },
                    ));
                }
                ops
            }
            Step::DeleteText { block_id, from, to } => {
                let mut ops = Vec::new();
                if let Some(text_crdt) = self.texts.get_mut(&block_id.0) {
                    // Delete from end to start to keep positions valid
                    for pos in (*from..*to).rev() {
                        if let Some(target_id) = text_crdt.delete(pos) {
                            self.lamport += 1;
                            ops.push(CrdtOp::Text(
                                block_id.clone(),
                                TextOp::Delete {
                                    id: OpId::new(self.lamport, &self.peer_id),
                                    target_id,
                                },
                            ));
                        }
                    }
                }
                ops
            }
            Step::InsertBlock {
                parent_id,
                index,
                block,
            } => {
                self.lamport += 1;
                let op_id = self
                    .tree
                    .insert(parent_id.clone(), *index, block.id.clone());
                self.block_types
                    .insert(block.id.0.clone(), block.block_type.clone());
                vec![CrdtOp::Tree(TreeOp::Insert {
                    id: op_id,
                    parent_id: parent_id.clone(),
                    index: *index,
                    block_id: block.id.clone(),
                    block_type: block.block_type.clone(),
                })]
            }
            Step::DeleteBlock { block_id } => {
                self.lamport += 1;
                let _ = self.tree.delete(block_id);
                vec![CrdtOp::Tree(TreeOp::Delete {
                    id: OpId::new(self.lamport, &self.peer_id),
                    block_id: block_id.clone(),
                })]
            }
            Step::MoveBlock {
                block_id,
                new_parent_id,
                new_index,
            } => {
                self.lamport += 1;
                let _ = self
                    .tree
                    .move_node(block_id, new_parent_id.clone(), *new_index);
                vec![CrdtOp::Tree(TreeOp::Move {
                    id: OpId::new(self.lamport, &self.peer_id),
                    block_id: block_id.clone(),
                    new_parent_id: new_parent_id.clone(),
                    new_index: *new_index,
                })]
            }
            Step::SetBlockAttrs { block_id, attrs } => {
                self.lamport += 1;
                let lww = self.attrs.entry(block_id.0.clone()).or_default();
                for (k, v) in attrs {
                    lww.set(k.clone(), v.clone(), self.lamport, &self.peer_id);
                }
                vec![CrdtOp::Attrs(block_id.clone(), attrs.clone())]
            }
            Step::AddMark {
                block_id,
                from,
                to,
                mark,
            } => {
                if let Some(text_crdt) = self.texts.get_mut(&block_id.0) {
                    text_crdt.add_mark(*from, *to, mark.clone());
                }
                vec![CrdtOp::Text(
                    block_id.clone(),
                    TextOp::AddMark {
                        from: *from,
                        to: *to,
                        mark: mark.clone(),
                    },
                )]
            }
            Step::RemoveMark {
                block_id,
                from,
                to,
                mark_type,
            } => {
                if let Some(text_crdt) = self.texts.get_mut(&block_id.0) {
                    text_crdt.remove_mark(*from, *to, mark_type);
                }
                vec![CrdtOp::Text(
                    block_id.clone(),
                    TextOp::RemoveMark {
                        from: *from,
                        to: *to,
                        mark_type: mark_type.clone(),
                    },
                )]
            }
            _ => vec![],
        }
    }

    /// Apply remote operations and return resulting Steps for local document update
    pub fn apply_remote(&mut self, bytes: &[u8]) -> Result<Vec<Step>, serde_json::Error> {
        let ops: Vec<CrdtOp> = serde_json::from_slice(bytes)?;
        let mut steps = Vec::new();

        for op in &ops {
            match op {
                CrdtOp::Text(block_id, text_op) => {
                    match text_op {
                        TextOp::Insert {
                            id: _,
                            pos,
                            ch,
                            marks,
                            ..
                        } => {
                            steps.push(Step::InsertText {
                                block_id: block_id.clone(),
                                offset: *pos,
                                text: ch.to_string(),
                                marks: marks.clone(),
                            });
                        }
                        TextOp::Delete { target_id, .. } => {
                            // Simplified: use position-based delete
                            if let Some(text_crdt) = self.texts.get_mut(&block_id.0) {
                                text_crdt.delete_remote(target_id);
                            }
                        }
                        TextOp::AddMark { from, to, mark } => {
                            steps.push(Step::AddMark {
                                block_id: block_id.clone(),
                                from: *from,
                                to: *to,
                                mark: mark.clone(),
                            });
                        }
                        TextOp::RemoveMark {
                            from,
                            to,
                            mark_type,
                        } => {
                            steps.push(Step::RemoveMark {
                                block_id: block_id.clone(),
                                from: *from,
                                to: *to,
                                mark_type: mark_type.clone(),
                            });
                        }
                    }
                }
                CrdtOp::Tree(tree_op) => match tree_op {
                    TreeOp::Insert {
                        parent_id,
                        index,
                        block_id,
                        block_type,
                        ..
                    } => {
                        let block =
                            Block::new_with_type(block_type, BlockContent::RichText(vec![]));
                        steps.push(Step::InsertBlock {
                            parent_id: parent_id.clone(),
                            index: *index,
                            block: Block {
                                id: block_id.clone(),
                                ..block
                            },
                        });
                    }
                    TreeOp::Move {
                        id,
                        block_id,
                        new_parent_id,
                        new_index,
                    } => {
                        let _ = self.tree.apply_remote_move(
                            id.clone(),
                            block_id,
                            new_parent_id.clone(),
                            *new_index,
                        );
                        steps.push(Step::MoveBlock {
                            block_id: block_id.clone(),
                            new_parent_id: new_parent_id.clone(),
                            new_index: *new_index,
                        });
                    }
                    TreeOp::Delete { block_id, .. } => {
                        let _ = self.tree.delete(block_id);
                        steps.push(Step::DeleteBlock {
                            block_id: block_id.clone(),
                        });
                    }
                },
                CrdtOp::Attrs(block_id, attrs) => {
                    steps.push(Step::SetBlockAttrs {
                        block_id: block_id.clone(),
                        attrs: attrs.clone(),
                    });
                }
                _ => {}
            }
        }

        Ok(steps)
    }

    /// Encode updates since a given version vector
    pub fn encode_update_since(&self, _since: &VersionVector) -> Vec<u8> {
        // Simplified: encode the full state
        self.encode_snapshot()
    }

    /// Encode full state snapshot
    pub fn encode_snapshot(&self) -> Vec<u8> {
        let doc = self.to_document();
        serde_json::to_vec(&doc).unwrap_or_default()
    }

    /// Convert CRDT state back to a Document
    pub fn to_document(&self) -> Document {
        let root_ids = self.tree.root_order();
        let blocks: Vec<Block> = root_ids.iter().map(|id| self.build_block(id)).collect();

        Document { blocks, version: 0 }
    }

    fn build_block(&self, block_id: &BlockId) -> Block {
        let block_type = self
            .block_types
            .get(&block_id.0)
            .cloned()
            .unwrap_or_else(|| "paragraph".into());

        let content = if let Some(text_crdt) = self.texts.get(&block_id.0) {
            BlockContent::RichText(text_crdt.to_spans())
        } else {
            BlockContent::Empty
        };

        let attrs = if let Some(lww) = self.attrs.get(&block_id.0) {
            lww.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
        } else {
            HashMap::new()
        };

        let children: Vec<Block> = self
            .tree
            .children(Some(block_id))
            .into_iter()
            .map(|node| self.build_block(&node.block_id))
            .collect();

        Block {
            id: block_id.clone(),
            block_type,
            attrs,
            content,
            children,
        }
    }

    pub fn version(&self) -> &VersionVector {
        &self.version
    }

    pub fn peer_id(&self) -> &str {
        &self.peer_id
    }

    pub fn history(&self) -> &CrdtHistory {
        &self.history
    }

    pub fn history_mut(&mut self) -> &mut CrdtHistory {
        &mut self.history
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gotipe_core::TextSpan;

    fn make_doc() -> Document {
        Document {
            blocks: vec![Block {
                id: BlockId("b1".into()),
                block_type: "paragraph".into(),
                attrs: HashMap::new(),
                content: BlockContent::RichText(vec![TextSpan {
                    text: "Hello".into(),
                    marks: vec![],
                }]),
                children: vec![],
            }],
            version: 0,
        }
    }

    #[test]
    fn test_new_imports_document() {
        let doc = make_doc();
        let crdt = CrdtDocument::new("peer_a", &doc);
        let restored = crdt.to_document();
        assert_eq!(restored.blocks.len(), 1);
        assert_eq!(restored.blocks[0].text_length(), 5);
    }

    #[test]
    fn test_apply_local_insert_text() {
        let doc = make_doc();
        let mut crdt = CrdtDocument::new("peer_a", &doc);

        let ops = crdt.apply_local(&[Step::InsertText {
            block_id: BlockId("b1".into()),
            offset: 5,
            text: "!".into(),
            marks: vec![],
        }]);

        assert!(!ops.is_empty());
        let restored = crdt.to_document();
        assert_eq!(restored.blocks[0].text_length(), 6);
    }

    #[test]
    fn test_apply_local_insert_block() {
        let doc = make_doc();
        let mut crdt = CrdtDocument::new("peer_a", &doc);

        let new_block = Block::new_with_type("paragraph", BlockContent::RichText(vec![]));
        let ops = crdt.apply_local(&[Step::InsertBlock {
            parent_id: None,
            index: 1,
            block: new_block,
        }]);

        assert!(!ops.is_empty());
        let restored = crdt.to_document();
        assert_eq!(restored.blocks.len(), 2);
    }

    #[test]
    fn test_encode_snapshot_roundtrip() {
        let doc = make_doc();
        let crdt = CrdtDocument::new("peer_a", &doc);
        let snapshot = crdt.encode_snapshot();
        let restored: Document = serde_json::from_slice(&snapshot).unwrap();
        assert_eq!(restored.blocks.len(), 1);
    }
}
