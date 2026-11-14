use super::{Change, ContentKind, Position, ReplicaOp, ReplicaState};
use crate::ops::OpId;
use gotipe_core::{Block, BlockContent, BlockId, Document, Mark, TransformError};
use std::collections::BTreeSet;

struct Writer<'a> {
    state: &'a mut ReplicaState,
    peer: &'a str,
    clock: &'a mut u64,
    ops: Vec<ReplicaOp>,
}
impl Writer<'_> {
    fn next_id(&self) -> Result<OpId, TransformError> {
        crate::clock::next_id(*self.clock, self.peer)
    }
    fn emit(&mut self, change: Change) -> Result<OpId, TransformError> {
        let id = self.next_id()?;
        *self.clock = id.lamport;
        let op = ReplicaOp { id, change };
        self.state.apply(&op);
        let id = op.id.clone();
        self.ops.push(op);
        Ok(id)
    }
    fn blocks(&mut self, blocks: &[Block], parent: Option<BlockId>) -> Result<(), TransformError> {
        let mut previous: Option<Position> = None;
        for (index, block) in blocks.iter().enumerate() {
            let existing = self
                .state
                .nodes
                .get(&block.id.0)
                .filter(|n| !n.deleted)
                .cloned();
            let keep_position = existing.as_ref().filter(|node| {
                node.parent == parent && previous.as_ref().is_none_or(|p| node.position > *p)
            });
            let position = if let Some(node) = keep_position {
                node.position.clone()
            } else {
                let next = blocks[index + 1..]
                    .iter()
                    .filter_map(|b| self.state.nodes.get(&b.id.0))
                    .find(|n| {
                        !n.deleted
                            && n.parent == parent
                            && previous.as_ref().is_none_or(|p| n.position > *p)
                    });
                Position::between(
                    previous.as_ref(),
                    next.map(|n| &n.position),
                    &self.next_id()?,
                )
            };
            let kind = ContentKind::from(&block.content);
            if let Some(node) = &existing {
                if node.parent != parent || node.position != position {
                    self.emit(Change::MoveBlock {
                        block_id: block.id.clone(),
                        parent: parent.clone(),
                        position: position.clone(),
                    })?;
                }
                if node.block_type != block.block_type || node.kind != kind {
                    self.emit(Change::SetType {
                        block_id: block.id.clone(),
                        block_type: block.block_type.clone(),
                        kind,
                    })?;
                }
            } else {
                self.emit(Change::CreateBlock {
                    block_id: block.id.clone(),
                    parent: parent.clone(),
                    position: position.clone(),
                    block_type: block.block_type.clone(),
                    kind,
                })?;
            }
            previous = Some(position);
            let old_attrs = self.state.nodes[&block.id.0].attrs.clone();
            let keys: BTreeSet<_> = old_attrs.keys().chain(block.attrs.keys()).collect();
            for key in keys {
                if old_attrs.get(key) != block.attrs.get(key) {
                    self.emit(Change::SetAttr {
                        block_id: block.id.clone(),
                        key: key.clone(),
                        value: block.attrs.get(key).cloned(),
                    })?;
                }
            }
            self.text(block)?;
            self.blocks(&block.children, Some(block.id.clone()))?;
        }
        Ok(())
    }
    fn text(&mut self, block: &Block) -> Result<(), TransformError> {
        let desired: Vec<(char, Vec<Mark>)> = match &block.content {
            BlockContent::RichText(spans) => spans
                .iter()
                .flat_map(|s| s.text.chars().map(|ch| (ch, s.marks.clone())))
                .collect(),
            BlockContent::Raw(text) => text.chars().map(|ch| (ch, vec![])).collect(),
            BlockContent::Empty => vec![],
        };
        let old: Vec<_> = self.state.nodes[&block.id.0]
            .visible_chars()
            .into_iter()
            .cloned()
            .collect();
        let prefix = old
            .iter()
            .zip(&desired)
            .take_while(|(a, b)| a.value == b.0)
            .count();
        let suffix = old[prefix..]
            .iter()
            .rev()
            .zip(desired[prefix..].iter().rev())
            .take_while(|(a, b)| a.value == b.0)
            .count();
        for ch in &old[prefix..old.len() - suffix] {
            self.emit(Change::DeleteChar {
                block_id: block.id.clone(),
                target: ch.id.clone(),
            })?;
        }
        let mut left = prefix.checked_sub(1).map(|i| old[i].position.clone());
        let right = if suffix > 0 {
            Some(&old[old.len() - suffix].position)
        } else {
            None
        };
        let mut run_start: Option<Position> = None;
        for (index, (value, marks)) in desired[prefix..desired.len() - suffix].iter().enumerate() {
            let position = match &run_start {
                Some(start) => start.in_run(index, &self.next_id()?),
                None => Position::between(left.as_ref(), right, &self.next_id()?),
            };
            if run_start.is_none() {
                run_start = Some(position.clone());
            }
            self.emit(Change::InsertChar {
                block_id: block.id.clone(),
                position: position.clone(),
                value: *value,
                marks: marks.clone(),
            })?;
            left = Some(position);
        }
        let retained = old[..prefix].iter().zip(&desired[..prefix]).chain(
            old[old.len() - suffix..]
                .iter()
                .zip(&desired[desired.len() - suffix..]),
        );
        // Mark writes follow the target's order, so the projection keeps it too.
        for (ch, (_, marks)) in retained {
            for (mark_type, mark) in ch.marks.changes_to(marks) {
                self.emit(Change::SetMark {
                    block_id: block.id.clone(),
                    target: ch.id.clone(),
                    mark_type,
                    mark,
                })?;
            }
        }
        Ok(())
    }
}

pub(crate) fn reconcile(
    state: &mut ReplicaState,
    target: &Document,
    peer: &str,
    clock: &mut u64,
) -> Result<Vec<ReplicaOp>, TransformError> {
    let mut writer = Writer {
        state,
        peer,
        clock,
        ops: vec![],
    };
    writer.blocks(&target.blocks, None)?;
    let ids: BTreeSet<_> = target.flatten().map(|b| b.id.0.clone()).collect();
    let removed: Vec<_> = writer
        .state
        .nodes
        .iter()
        .filter(|(id, n)| !n.deleted && !ids.contains(*id))
        .map(|(id, _)| BlockId(id.clone()))
        .collect();
    for block_id in removed {
        writer.emit(Change::DeleteBlock { block_id })?;
    }
    Ok(writer.ops)
}
