use std::collections::HashMap;

use gotipe_schema::{AttrValue, Block, BlockContent, BlockId, Mark, TextSpan};

mod clipboard;
use crate::selection::Selection;
use crate::state::EditorState;
use crate::transaction::{Step, Transaction};
pub use clipboard::{copy, cut, paste};

// === Text formatting commands ===

pub fn toggle_mark(state: &EditorState, mark_type: &str) -> Option<Transaction> {
    let (block_id, from, to) = state.selection().as_text()?;
    let block = state.doc().find_block(block_id)?;

    let has_mark = if let BlockContent::RichText(spans) = &block.content {
        spans_have_mark_in_range(spans, from, to, mark_type)
    } else {
        return None;
    };

    let step = if has_mark {
        Step::RemoveMark {
            block_id: block_id.clone(),
            from,
            to,
            mark_type: mark_type.into(),
        }
    } else {
        Step::AddMark {
            block_id: block_id.clone(),
            from,
            to,
            mark: Mark::new(mark_type),
        }
    };

    Some(Transaction::new().with_step(step))
}

pub fn toggle_bold(state: &EditorState) -> Option<Transaction> {
    toggle_mark(state, "bold")
}

pub fn toggle_italic(state: &EditorState) -> Option<Transaction> {
    toggle_mark(state, "italic")
}

pub fn toggle_underline(state: &EditorState) -> Option<Transaction> {
    toggle_mark(state, "underline")
}

pub fn toggle_strikethrough(state: &EditorState) -> Option<Transaction> {
    toggle_mark(state, "strikethrough")
}

pub fn toggle_code(state: &EditorState) -> Option<Transaction> {
    toggle_mark(state, "code")
}

pub fn toggle_highlight(state: &EditorState, color: &str) -> Option<Transaction> {
    let (block_id, from, to) = state.selection().as_text()?;
    let block = state.doc().find_block(block_id)?;

    let has_mark = if let BlockContent::RichText(spans) = &block.content {
        spans_have_mark_in_range(spans, from, to, "highlight")
    } else {
        return None;
    };

    let step = if has_mark {
        Step::RemoveMark {
            block_id: block_id.clone(),
            from,
            to,
            mark_type: "highlight".into(),
        }
    } else {
        Step::AddMark {
            block_id: block_id.clone(),
            from,
            to,
            mark: Mark::new("highlight").with_attr("color", AttrValue::String(color.into())),
        }
    };

    Some(Transaction::new().with_step(step))
}

pub fn set_link(state: &EditorState, href: &str) -> Option<Transaction> {
    let (block_id, from, to) = state.selection().as_text()?;
    let step = Step::AddMark {
        block_id: block_id.clone(),
        from,
        to,
        mark: Mark::new("link").with_attr("href", AttrValue::String(href.into())),
    };
    Some(Transaction::new().with_step(step))
}

pub fn remove_link(state: &EditorState) -> Option<Transaction> {
    let (block_id, from, to) = state.selection().as_text()?;
    let step = Step::RemoveMark {
        block_id: block_id.clone(),
        from,
        to,
        mark_type: "link".into(),
    };
    Some(Transaction::new().with_step(step))
}

// === Block operations ===

pub fn set_block_type(
    state: &EditorState,
    block_type: &str,
    attrs: HashMap<String, AttrValue>,
) -> Option<Transaction> {
    let block_id = state.selection().block_id();
    let step = Step::SetBlockType {
        block_id: block_id.clone(),
        new_type: block_type.into(),
        attrs,
    };
    Some(Transaction::new().with_step(step))
}

pub fn insert_block_after(state: &EditorState, block_type: &str) -> Option<Transaction> {
    let block_id = state.selection().block_id();
    let (parent_id, index) = state.doc().parent_and_index(block_id)?;
    let new_block = Block::new_with_type(block_type, default_content_for_type(state, block_type)?);
    let new_block_id = new_block.id.clone();
    let step = Step::InsertBlock {
        parent_id,
        index: index + 1,
        block: new_block,
    };
    Some(
        Transaction::new()
            .with_step(step)
            .with_selection(Selection::Cursor {
                block_id: new_block_id,
                offset: 0,
            }),
    )
}

pub fn insert_block_before(state: &EditorState, block_type: &str) -> Option<Transaction> {
    let block_id = state.selection().block_id();
    let (parent_id, index) = state.doc().parent_and_index(block_id)?;
    let new_block = Block::new_with_type(block_type, default_content_for_type(state, block_type)?);
    let new_block_id = new_block.id.clone();
    let step = Step::InsertBlock {
        parent_id,
        index,
        block: new_block,
    };
    Some(
        Transaction::new()
            .with_step(step)
            .with_selection(Selection::Cursor {
                block_id: new_block_id,
                offset: 0,
            }),
    )
}

pub fn delete_block(state: &EditorState) -> Option<Transaction> {
    let block_id = state.selection().block_id();
    let step = Step::DeleteBlock {
        block_id: block_id.clone(),
    };
    Some(Transaction::new().with_step(step))
}

pub fn move_block_up(state: &EditorState) -> Option<Transaction> {
    let block_id = state.selection().block_id();
    let (parent_id, index) = state.doc().parent_and_index(block_id)?;
    if index == 0 {
        return None;
    }
    let step = Step::MoveBlock {
        block_id: block_id.clone(),
        new_parent_id: parent_id,
        new_index: index - 1,
    };
    Some(Transaction::new().with_step(step))
}

pub fn move_block_down(state: &EditorState) -> Option<Transaction> {
    let block_id = state.selection().block_id();
    let (parent_id, index) = state.doc().parent_and_index(block_id)?;

    let sibling_count = if let Some(ref pid) = parent_id {
        state.doc().find_block(pid)?.children.len()
    } else {
        state.doc().blocks.len()
    };

    if index + 1 >= sibling_count {
        return None;
    }

    let step = Step::MoveBlock {
        block_id: block_id.clone(),
        new_parent_id: parent_id,
        new_index: index + 1,
    };
    Some(Transaction::new().with_step(step))
}

pub fn duplicate_block(state: &EditorState) -> Option<Transaction> {
    let block_id = state.selection().block_id();
    let block = state.doc().find_block(block_id)?;
    let (parent_id, index) = state.doc().parent_and_index(block_id)?;

    let mut new_block = block.clone();
    new_block.id = BlockId::new();
    reassign_ids(&mut new_block);

    let step = Step::InsertBlock {
        parent_id,
        index: index + 1,
        block: new_block,
    };
    Some(Transaction::new().with_step(step))
}

// === List operations ===

pub fn toggle_bullet_list(state: &EditorState) -> Option<Transaction> {
    toggle_list_type(state, "bulletList")
}

pub fn toggle_ordered_list(state: &EditorState) -> Option<Transaction> {
    toggle_list_type(state, "orderedList")
}

pub fn toggle_todo_list(state: &EditorState) -> Option<Transaction> {
    let block_id = state.selection().block_id();
    let block = state.doc().find_block(block_id)?;

    if block.block_type == "listItem" && block.attrs.contains_key("checked") {
        // Remove checked attr — convert back to regular list item
        let mut attrs = block.attrs.clone();
        attrs.remove("checked");
        Some(Transaction::new().with_step(Step::SetBlockType {
            block_id: block_id.clone(),
            new_type: "listItem".into(),
            attrs,
        }))
    } else if block.block_type == "listItem" {
        // Add checked attr
        Some(Transaction::new().with_step(Step::SetBlockAttrs {
            block_id: block_id.clone(),
            attrs: HashMap::from([("checked".into(), AttrValue::Bool(false))]),
        }))
    } else {
        // Wrap in bulletList + listItem with checked=false
        wrap_in_list(
            state,
            "bulletList",
            Some(("checked", AttrValue::Bool(false))),
        )
    }
}

pub fn indent(state: &EditorState) -> Option<Transaction> {
    let block_id = state.selection().block_id();
    let block = state.doc().find_block(block_id)?;
    let (parent_id, index) = state.doc().parent_and_index(block_id)?;

    // For list items: move into previous sibling's children
    if block.block_type == "listItem" && index > 0 {
        let siblings = if let Some(ref pid) = parent_id {
            &state.doc().find_block(pid)?.children
        } else {
            &state.doc().blocks
        };
        let prev_sibling_id = siblings.get(index - 1)?.id.clone();

        return Some(Transaction::new().with_step(Step::MoveBlock {
            block_id: block_id.clone(),
            new_parent_id: Some(prev_sibling_id),
            new_index: 0,
        }));
    }
    None
}

pub fn outdent(state: &EditorState) -> Option<Transaction> {
    let block_id = state.selection().block_id();
    let (parent_id, _index) = state.doc().parent_and_index(block_id)?;

    // Move block up one level
    if let Some(parent_id) = parent_id {
        let (grandparent_id, parent_index) = state.doc().parent_and_index(&parent_id)?;
        return Some(Transaction::new().with_step(Step::MoveBlock {
            block_id: block_id.clone(),
            new_parent_id: grandparent_id,
            new_index: parent_index + 1,
        }));
    }
    None
}

// === Block splitting / merging ===

pub fn split_block(state: &EditorState) -> Option<Transaction> {
    let (block_id, offset) = match state.selection() {
        Selection::Cursor { block_id, offset } => (block_id.clone(), *offset),
        Selection::Text { block_id, to, .. } => (block_id.clone(), *to),
        _ => return None,
    };

    let step = Step::SplitBlock { block_id, offset };
    Some(Transaction::new().with_step(step))
}

pub fn merge_with_previous(state: &EditorState) -> Option<Transaction> {
    let block_id = state.selection().block_id();
    let (parent_id, index) = state.doc().parent_and_index(block_id)?;
    if index == 0 {
        return None;
    }

    let siblings = if let Some(ref pid) = parent_id {
        &state.doc().find_block(pid)?.children
    } else {
        &state.doc().blocks
    };

    let prev_block = siblings.get(index - 1)?;
    let target_offset = prev_block.text_length();
    let target_id = prev_block.id.clone();

    let step = Step::MergeBlocks {
        block_id: block_id.clone(),
        target_id: target_id.clone(),
    };
    Some(
        Transaction::new()
            .with_step(step)
            .with_selection(Selection::Cursor {
                block_id: target_id,
                offset: target_offset,
            }),
    )
}

pub fn insert_hard_break(state: &EditorState) -> Option<Transaction> {
    let (block_id, offset) = state.selection().as_cursor()?;
    let step = Step::InsertText {
        block_id: block_id.clone(),
        offset,
        text: "\n".into(),
        marks: vec![],
    };
    Some(
        Transaction::new()
            .with_step(step)
            .with_selection(Selection::Cursor {
                block_id: block_id.clone(),
                offset: offset + 1,
            }),
    )
}

// === Selection ===

pub fn select_all(state: &EditorState) -> Option<Transaction> {
    let block_ids: Vec<BlockId> = state.doc().blocks.iter().map(|b| b.id.clone()).collect();
    if block_ids.is_empty() {
        return None;
    }
    Some(Transaction::new().with_selection(Selection::Multi { block_ids }))
}

pub fn select_block(state: &EditorState) -> Option<Transaction> {
    let block_id = state.selection().block_id().clone();
    Some(Transaction::new().with_selection(Selection::Block { block_id }))
}

// === Clipboard ===

// === Helpers ===

fn spans_have_mark_in_range(spans: &[TextSpan], from: usize, to: usize, mark_type: &str) -> bool {
    let mut offset = 0;
    for span in spans {
        let span_end = offset + span.text.encode_utf16().count();
        if span_end > from && offset < to && span.marks.iter().any(|m| m.mark_type == mark_type) {
            return true;
        }
        offset = span_end;
    }
    false
}

fn default_content_for_type(state: &EditorState, block_type: &str) -> Option<BlockContent> {
    use gotipe_schema::ContentRule;
    Some(match state.schema().nodes.get(block_type)?.content {
        ContentRule::RawText => BlockContent::Raw(String::new()),
        ContentRule::Empty => BlockContent::Empty,
        ContentRule::RichText => BlockContent::RichText(Vec::new()),
    })
}

fn reassign_ids(block: &mut Block) {
    block.id = BlockId::new();
    for child in &mut block.children {
        reassign_ids(child);
    }
}

fn toggle_list_type(state: &EditorState, list_type: &str) -> Option<Transaction> {
    let block_id = state.selection().block_id();
    let (parent_id, _) = state.doc().parent_and_index(block_id)?;
    if let Some(parent_id) = parent_id {
        let parent = state.doc().find_block(&parent_id)?;
        if parent.block_type == list_type {
            let (grandparent, index) = state.doc().parent_and_index(&parent_id)?;
            let selected_index = parent
                .children
                .iter()
                .position(|item| &item.id == block_id)?;
            let mut paragraph = parent.children[selected_index].clone();
            paragraph.block_type = "paragraph".into();
            let paragraph_spec = state.schema().nodes.get("paragraph")?;
            paragraph
                .attrs
                .retain(|key, _| paragraph_spec.attrs.contains_key(key));
            let children = if paragraph_spec.allows_children {
                Vec::new()
            } else {
                std::mem::take(&mut paragraph.children)
            };
            let mut replacement = Vec::new();
            if selected_index > 0 {
                let mut before = parent.clone();
                before.children.truncate(selected_index);
                replacement.push(before);
            }
            replacement.push(paragraph);
            replacement.extend(children);
            if selected_index + 1 < parent.children.len() {
                let mut after = parent.clone();
                if selected_index > 0 {
                    after.id = BlockId::new();
                }
                after.children = parent.children[selected_index + 1..].to_vec();
                if after.block_type == "orderedList" {
                    let start = match parent.attrs.get("start") {
                        Some(AttrValue::Number(value)) => *value,
                        _ => 1.0,
                    };
                    after.attrs.insert(
                        "start".into(),
                        AttrValue::Number(start + selected_index as f64 + 1.0),
                    );
                }
                replacement.push(after);
            }
            let mut tr = Transaction::new().with_step(Step::DeleteBlock {
                block_id: parent_id,
            });
            tr.steps
                .extend(replacement.into_iter().enumerate().map(|(offset, block)| {
                    Step::InsertBlock {
                        parent_id: grandparent.clone(),
                        index: index + offset,
                        block,
                    }
                }));
            tr.selection = Some(state.selection().clone());
            return Some(tr);
        }
        if parent.block_type == "bulletList" || parent.block_type == "orderedList" {
            return Some(Transaction::new().with_step(Step::SetBlockType {
                block_id: parent_id,
                new_type: list_type.into(),
                attrs: HashMap::new(),
            }));
        }
    }
    wrap_in_list(state, list_type, None)
}

fn wrap_in_list(
    state: &EditorState,
    list_type: &str,
    extra_attr: Option<(&str, AttrValue)>,
) -> Option<Transaction> {
    let block_id = state.selection().block_id();
    let block = state.doc().find_block(block_id)?;
    if matches!(
        state.schema().nodes.get(&block.block_type)?.content,
        gotipe_schema::ContentRule::Empty
    ) {
        return None;
    }
    let (parent_id, index) = state.doc().parent_and_index(block_id)?;
    let mut attrs = HashMap::new();
    if let Some((key, value)) = extra_attr {
        attrs.insert(key.into(), value);
    }
    let list = Block::new_with_type(list_type, BlockContent::Empty);
    let list_id = list.id.clone();
    Some(
        Transaction::new()
            .with_step(Step::InsertBlock {
                parent_id,
                index,
                block: list,
            })
            .with_step(Step::MoveBlock {
                block_id: block_id.clone(),
                new_parent_id: Some(list_id),
                new_index: 0,
            })
            .with_step(Step::SetBlockType {
                block_id: block_id.clone(),
                new_type: "listItem".into(),
                attrs,
            }),
    )
}

#[cfg(test)]
mod tests;
