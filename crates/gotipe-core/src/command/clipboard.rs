use super::*;
use crate::clipboard::{block_to_plain_text, ClipboardData};

pub fn cut(state: &EditorState) -> Option<(Transaction, ClipboardData)> {
    let clipboard_data = copy(state)?;

    let tr = match state.selection() {
        Selection::Text { block_id, from, to } => Transaction::new()
            .with_step(Step::DeleteText {
                block_id: block_id.clone(),
                from: *from,
                to: *to,
            })
            .with_selection(Selection::Cursor {
                block_id: block_id.clone(),
                offset: *from,
            }),
        Selection::Block { block_id } => Transaction::new().with_step(Step::DeleteBlock {
            block_id: block_id.clone(),
        }),
        _ => return None,
    };

    Some((tr, clipboard_data))
}

pub fn copy(state: &EditorState) -> Option<ClipboardData> {
    match state.selection() {
        Selection::Text { block_id, from, to } => {
            let block = state.doc().find_block(block_id)?;
            if let BlockContent::RichText(spans) = &block.content {
                let full_text: String = spans.iter().map(|s| s.text.as_str()).collect();
                let text = text_range(&full_text, *from, *to)?;
                Some(ClipboardData {
                    plain_text: text.clone(),
                    html: None,
                    internal_json: None,
                })
            } else if let BlockContent::Raw(raw) = &block.content {
                let text = text_range(raw, *from, *to)?;
                Some(ClipboardData {
                    plain_text: text,
                    html: None,
                    internal_json: None,
                })
            } else {
                None
            }
        }
        Selection::Block { block_id } => {
            let block = state.doc().find_block(block_id)?;
            let json = serde_json::to_string(block).ok()?;
            Some(ClipboardData {
                plain_text: block_to_plain_text(block),
                html: None,
                internal_json: Some(json),
            })
        }
        _ => None,
    }
}

pub fn paste(state: &EditorState, data: &ClipboardData) -> Option<Transaction> {
    // If we have internal JSON, insert it as a block
    if let Some(json) = &data.internal_json {
        if let Ok(block) = serde_json::from_str::<Block>(json) {
            let current_id = state.selection().block_id();
            let (parent_id, index) = state.doc().parent_and_index(current_id)?;
            let mut new_block = block;
            new_block.id = BlockId::new();
            reassign_ids(&mut new_block);
            return Some(Transaction::new().with_step(Step::InsertBlock {
                parent_id,
                index: index + 1,
                block: new_block,
            }));
        }
    }

    // Otherwise, insert as plain text
    let text = &data.plain_text;
    match state.selection() {
        Selection::Cursor { block_id, offset } => {
            Some(Transaction::new().with_step(Step::InsertText {
                block_id: block_id.clone(),
                offset: *offset,
                text: text.clone(),
                marks: vec![],
            }))
        }
        Selection::Text { block_id, from, to } => {
            // Delete selection then insert
            Some(
                Transaction::new()
                    .with_step(Step::DeleteText {
                        block_id: block_id.clone(),
                        from: *from,
                        to: *to,
                    })
                    .with_step(Step::InsertText {
                        block_id: block_id.clone(),
                        offset: *from,
                        text: text.clone(),
                        marks: vec![],
                    }),
            )
        }
        _ => None,
    }
}

fn text_range(text: &str, from: usize, to: usize) -> Option<String> {
    if from > to {
        return None;
    }
    let start = crate::transform::byte_offset(text, from).ok()?;
    let end = crate::transform::byte_offset(text, to).ok()?;
    Some(text[start..end].to_owned())
}
