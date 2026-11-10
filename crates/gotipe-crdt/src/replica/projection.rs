use super::{Change, ContentKind, Position, ReplicaOp};
use crate::ops::OpId;
use gotipe_core::{AttrValue, Block, BlockContent, BlockId, Document, Mark, TextSpan};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone)]
pub(crate) struct Character {
    pub id: OpId,
    pub position: Position,
    pub value: char,
    pub marks: BTreeMap<String, Mark>,
    pub deleted: bool,
}
#[derive(Debug, Clone)]
pub(crate) struct Node {
    pub parent: Option<BlockId>,
    pub position: Position,
    pub block_type: String,
    pub kind: ContentKind,
    pub attrs: BTreeMap<String, AttrValue>,
    pub chars: BTreeMap<OpId, Character>,
    pub deleted: bool,
}
impl Node {
    pub fn visible_chars(&self) -> Vec<&Character> {
        let mut chars: Vec<_> = self.chars.values().filter(|ch| !ch.deleted).collect();
        chars.sort_by(|a, b| a.position.cmp(&b.position).then(a.id.cmp(&b.id)));
        chars
    }
}
#[derive(Debug, Clone, Default)]
pub(crate) struct ReplicaState {
    pub nodes: BTreeMap<String, Node>,
    pub data: BTreeMap<String, BTreeMap<String, String>>,
    pub(super) routes: Vec<super::routing::TextRoute>,
}

impl ReplicaState {
    pub fn from_document(doc: &Document) -> Self {
        let mut state = Self::default();
        state.seed(&doc.blocks, None);
        state
    }
    fn seed(&mut self, blocks: &[Block], parent: Option<BlockId>) {
        for (index, block) in blocks.iter().enumerate() {
            let spans = match &block.content {
                BlockContent::RichText(spans) => spans.clone(),
                BlockContent::Raw(text) => vec![TextSpan {
                    text: text.clone(),
                    marks: vec![],
                }],
                BlockContent::Empty => vec![],
            };
            let mut chars = BTreeMap::new();
            for (index, (value, marks)) in spans
                .iter()
                .flat_map(|s| s.text.chars().map(|ch| (ch, &s.marks)))
                .enumerate()
            {
                let id = OpId::new(index as u64 + 1, &format!("@base/{}", block.id.0));
                chars.insert(
                    id.clone(),
                    Character {
                        id,
                        position: Position::initial(index),
                        value,
                        marks: marks
                            .iter()
                            .map(|m| (m.mark_type.clone(), m.clone()))
                            .collect(),
                        deleted: false,
                    },
                );
            }
            self.nodes.insert(
                block.id.0.clone(),
                Node {
                    parent: parent.clone(),
                    position: Position::initial(index),
                    block_type: block.block_type.clone(),
                    kind: ContentKind::from(&block.content),
                    attrs: block.attrs.clone().into_iter().collect(),
                    chars,
                    deleted: false,
                },
            );
            self.seed(&block.children, Some(block.id.clone()));
        }
    }
    /// Replay in Lamport/peer order makes each field a deterministic last-writer register.
    pub fn apply(&mut self, op: &ReplicaOp) {
        match &op.change {
            Change::SetData {
                collection,
                key,
                value,
            } => {
                let data = self.data.entry(collection.clone()).or_default();
                if let Some(value) = value {
                    data.insert(key.clone(), value.clone());
                } else {
                    data.remove(key);
                }
            }
            Change::SetOperationActive { .. } => {}
            Change::MoveTextRange {
                source,
                target,
                from,
                to,
                prefix,
            } => self.move_text(source, target, from, to, prefix),
            Change::CreateBlock {
                block_id,
                parent,
                position,
                block_type,
                kind,
            } => {
                self.reset_routes(block_id);
                self.nodes.insert(
                    block_id.0.clone(),
                    Node {
                        parent: parent.clone(),
                        position: position.clone(),
                        block_type: block_type.clone(),
                        kind: kind.clone(),
                        attrs: BTreeMap::new(),
                        chars: BTreeMap::new(),
                        deleted: false,
                    },
                );
            }
            Change::DeleteBlock { block_id } => {
                if let Some(node) = self.nodes.get_mut(&block_id.0) {
                    node.deleted = true;
                }
            }
            Change::MoveBlock {
                block_id,
                parent,
                position,
            } => {
                if let Some(node) = self.nodes.get_mut(&block_id.0) {
                    node.parent = parent.clone();
                    node.position = position.clone();
                }
            }
            Change::SetType {
                block_id,
                block_type,
                kind,
            } => {
                if let Some(node) = self.nodes.get_mut(&block_id.0) {
                    node.block_type = block_type.clone();
                    node.kind = kind.clone();
                }
            }
            Change::SetAttr {
                block_id,
                key,
                value,
            } => {
                if let Some(node) = self.nodes.get_mut(&block_id.0) {
                    if let Some(value) = value {
                        node.attrs.insert(key.clone(), value.clone());
                    } else {
                        node.attrs.remove(key);
                    }
                }
            }
            Change::InsertChar {
                block_id,
                position,
                value,
                marks,
            } => {
                let (block_id, position) = self.route_insert(block_id, position);
                if let Some(node) = self.nodes.get_mut(&block_id.0) {
                    node.chars.insert(
                        op.id.clone(),
                        Character {
                            id: op.id.clone(),
                            position: position.clone(),
                            value: *value,
                            marks: marks
                                .iter()
                                .map(|m| (m.mark_type.clone(), m.clone()))
                                .collect(),
                            deleted: false,
                        },
                    );
                }
            }
            Change::DeleteChar {
                block_id: _,
                target,
            } => {
                if let Some(ch) = self
                    .nodes
                    .values_mut()
                    .find_map(|node| node.chars.get_mut(target))
                {
                    ch.deleted = true;
                }
            }
            Change::SetMark {
                block_id: _,
                target,
                mark_type,
                mark,
            } => {
                if let Some(ch) = self
                    .nodes
                    .values_mut()
                    .find_map(|node| node.chars.get_mut(target))
                {
                    if let Some(mark) = mark {
                        ch.marks.insert(mark_type.clone(), mark.clone());
                    } else {
                        ch.marks.remove(mark_type);
                    }
                }
            }
        }
    }
    pub fn document(&self, version: u64) -> Document {
        // Concurrent moves may form a cycle; expose its nodes at root instead of hiding data.
        let mut parents = BTreeMap::new();
        for (id, node) in &self.nodes {
            if node.deleted {
                continue;
            }
            let mut seen = BTreeSet::from([id.as_str()]);
            let mut cursor = node.parent.as_ref();
            let mut valid = true;
            while let Some(parent) = cursor {
                let Some(ancestor) = self.nodes.get(&parent.0).filter(|n| !n.deleted) else {
                    valid = false;
                    break;
                };
                if !seen.insert(parent.0.as_str()) {
                    valid = false;
                    break;
                }
                cursor = ancestor.parent.as_ref();
            }
            parents.insert(id.clone(), if valid { node.parent.clone() } else { None });
        }
        Document {
            blocks: self.children(None, &parents),
            version,
        }
    }
    fn children(
        &self,
        parent: Option<&BlockId>,
        parents: &BTreeMap<String, Option<BlockId>>,
    ) -> Vec<Block> {
        let mut nodes: Vec<_> = parents
            .iter()
            .filter(|(_, p)| p.as_ref() == parent)
            .map(|(id, _)| (id, &self.nodes[id]))
            .collect();
        nodes.sort_by(|(a, x), (b, y)| x.position.cmp(&y.position).then(a.cmp(b)));
        nodes
            .into_iter()
            .map(|(id, node)| {
                let chars = node.visible_chars();
                let content = match node.kind {
                    ContentKind::Empty => BlockContent::Empty,
                    ContentKind::Raw => {
                        BlockContent::Raw(chars.iter().map(|ch| ch.value).collect())
                    }
                    ContentKind::RichText => {
                        let mut spans: Vec<TextSpan> = vec![];
                        for ch in chars {
                            let marks: Vec<_> = ch.marks.values().cloned().collect();
                            if let Some(last) = spans.last_mut().filter(|last| last.marks == marks)
                            {
                                last.text.push(ch.value);
                            } else {
                                spans.push(TextSpan {
                                    text: ch.value.to_string(),
                                    marks,
                                });
                            }
                        }
                        BlockContent::RichText(spans)
                    }
                };
                let block_id = BlockId(id.clone());
                Block {
                    id: block_id.clone(),
                    block_type: node.block_type.clone(),
                    attrs: node.attrs.clone().into_iter().collect(),
                    content,
                    children: self.children(Some(&block_id), parents),
                }
            })
            .collect()
    }
}
