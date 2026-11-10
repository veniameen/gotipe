//! Selection recovery after document structure changes.
use crate::{Selection, Step};
use gotipe_schema::{Block, BlockContent, BlockId, Document};

#[derive(Clone)]
pub(crate) struct SelectionMap {
    selection: Selection,
    old_index: usize,
    split_location: Option<(Option<BlockId>, usize)>,
    merge_offset: usize,
}
impl SelectionMap {
    pub fn new(selection: &Selection, step: &Step, doc: &Document) -> Self {
        Self {
            selection: selection.clone(),
            old_index: doc
                .flatten()
                .position(|b| b.id == *selection.block_id())
                .unwrap_or(0),
            split_location: match step {
                Step::SplitBlock { block_id, .. } => doc.parent_and_index(block_id),
                _ => None,
            },
            merge_offset: match step {
                Step::MergeBlocks { target_id, .. } => {
                    doc.find_block(target_id).map_or(0, Block::text_length)
                }
                _ => 0,
            },
        }
    }
    pub fn finish(self, step: &Step, after: &Document) -> Selection {
        if let Selection::Range { anchor, head } = &self.selection {
            let mut anchor_map = self.clone();
            anchor_map.selection = Selection::cursor(anchor.block_id.clone(), anchor.offset);
            let mut head_map = self.clone();
            head_map.selection = Selection::cursor(head.block_id.clone(), head.offset);
            return range_from_cursors(
                anchor_map.finish(step, after),
                head_map.finish(step, after),
            );
        }
        let mapped = match (&self.selection, step) {
            (
                Selection::Cursor { block_id, offset },
                Step::SplitBlock {
                    block_id: split_id,
                    offset: split,
                },
            ) if block_id == split_id && offset >= split => {
                if let Some((parent, index)) = self.split_location {
                    let siblings = parent
                        .as_ref()
                        .and_then(|id| after.find_block(id))
                        .map(|b| &b.children)
                        .unwrap_or(&after.blocks);
                    siblings
                        .get(index + 1)
                        .map(|b| Selection::cursor(b.id.clone(), offset - split))
                        .unwrap_or(self.selection.clone())
                } else {
                    self.selection.clone()
                }
            }
            (
                Selection::Cursor { block_id, offset },
                Step::MergeBlocks {
                    block_id: source,
                    target_id,
                },
            ) if block_id == source => {
                Selection::cursor(target_id.clone(), self.merge_offset + offset)
            }
            (
                Selection::Text { block_id, from, to },
                Step::MergeBlocks {
                    block_id: source,
                    target_id,
                },
            ) if block_id == source => Selection::text(
                target_id.clone(),
                self.merge_offset + from,
                self.merge_offset + to,
            ),
            _ => self.selection.map_through(std::slice::from_ref(step)),
        };
        normalize(mapped, after, self.old_index)
    }
}
pub(crate) fn validate(selection: &Selection, doc: &Document) -> Result<(), crate::TransformError> {
    let point = |id: &BlockId, offset: usize| {
        let block = doc
            .find_block(id)
            .ok_or_else(|| crate::TransformError::BlockNotFound(id.clone()))?;
        if boundary(block, offset) != offset {
            return Err(crate::TransformError::OffsetOutOfRange);
        }
        Ok(())
    };
    match selection {
        Selection::Range { anchor, head } => {
            point(&anchor.block_id, anchor.offset)?;
            point(&head.block_id, head.offset)
        }
        Selection::Cursor { block_id, offset } => point(block_id, *offset),
        Selection::Text { block_id, from, to } => {
            if from > to {
                return Err(crate::TransformError::OffsetOutOfRange);
            }
            point(block_id, *from)?;
            point(block_id, *to)
        }
        Selection::Block { block_id } => point(block_id, 0),
        Selection::Multi { block_ids } => {
            for id in block_ids {
                point(id, 0)?;
            }
            Ok(())
        }
    }
}

pub(crate) fn normalize(selection: Selection, doc: &Document, fallback_index: usize) -> Selection {
    match selection {
        Selection::Range { anchor, head } => range_from_cursors(
            normalize(
                Selection::cursor(anchor.block_id, anchor.offset),
                doc,
                fallback_index,
            ),
            normalize(
                Selection::cursor(head.block_id, head.offset),
                doc,
                fallback_index,
            ),
        ),
        Selection::Multi { block_ids } => {
            let block_ids: Vec<_> = block_ids
                .into_iter()
                .filter(|id| doc.find_block(id).is_some())
                .collect();
            Selection::Multi { block_ids }
        }
        Selection::Cursor { block_id, offset } => doc
            .find_block(&block_id)
            .map(|b| Selection::cursor(block_id, boundary(b, offset)))
            .unwrap_or_else(|| fallback(doc, fallback_index)),
        Selection::Text { block_id, from, to } => doc
            .find_block(&block_id)
            .map(|b| Selection::text(block_id, boundary(b, from), boundary(b, to)))
            .unwrap_or_else(|| fallback(doc, fallback_index)),
        Selection::Block { block_id } => {
            if doc.find_block(&block_id).is_some() {
                Selection::Block { block_id }
            } else {
                fallback(doc, fallback_index)
            }
        }
    }
}
fn fallback(doc: &Document, index: usize) -> Selection {
    let blocks: Vec<_> = doc.flatten().collect();
    blocks
        .get(index.min(blocks.len().saturating_sub(1)))
        .map(|b| Selection::cursor(b.id.clone(), 0))
        .unwrap_or(Selection::Multi { block_ids: vec![] })
}
fn boundary(block: &Block, requested: usize) -> usize {
    let text: String = match &block.content {
        BlockContent::RichText(spans) => spans.iter().map(|s| s.text.as_str()).collect(),
        BlockContent::Raw(text) => text.clone(),
        BlockContent::Empty => String::new(),
    };
    let mut offset = 0;
    for ch in text.chars() {
        let next = offset + ch.len_utf16();
        if next > requested {
            break;
        }
        offset = next;
    }
    offset
}

pub(crate) fn range_from_cursors(anchor: Selection, head: Selection) -> Selection {
    match (anchor, head) {
        (
            Selection::Cursor {
                block_id: anchor_id,
                offset: anchor_offset,
            },
            Selection::Cursor {
                block_id: head_id,
                offset: head_offset,
            },
        ) => Selection::Range {
            anchor: crate::TextPosition {
                block_id: anchor_id,
                offset: anchor_offset,
            },
            head: crate::TextPosition {
                block_id: head_id,
                offset: head_offset,
            },
        },
        (selection, _) => selection,
    }
}
