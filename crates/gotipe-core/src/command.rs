use std::collections::HashMap;

use gotipe_schema::{AttrValue, Block, BlockContent, BlockId};

mod clipboard;
mod marks;
use crate::selection::Selection;
use crate::state::EditorState;
use crate::transaction::{Step, Transaction};
pub use clipboard::{copy, cut, paste};
pub use marks::{
    add_mark, remove_link, remove_mark, set_link, toggle_bold, toggle_code, toggle_highlight,
    toggle_italic, toggle_mark, toggle_mark_with, toggle_strikethrough, toggle_underline,
};

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
        attrs: state.schema().node_attrs_with_defaults(block_type, attrs),
    };
    Some(Transaction::new().with_step(step))
}

pub fn insert_block_after(state: &EditorState, block_type: &str) -> Option<Transaction> {
    let block_id = state.selection().block_id();
    let (parent_id, index) = state.doc().parent_and_index(block_id)?;
    let new_block = new_block(state, block_type)?;
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
    let new_block = new_block(state, block_type)?;
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

/// An empty block of `block_type` with its declared attribute defaults.
fn new_block(state: &EditorState, block_type: &str) -> Option<Block> {
    let mut block = Block::new_with_type(block_type, default_content_for_type(state, block_type)?);
    block.attrs = state
        .schema()
        .node_attrs_with_defaults(block_type, Default::default());
    Some(block)
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
    let mut list = Block::new_with_type(list_type, BlockContent::Empty);
    list.attrs = state
        .schema()
        .node_attrs_with_defaults(list_type, Default::default());
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
                attrs: state.schema().node_attrs_with_defaults("listItem", attrs),
            }),
    )
}

#[cfg(test)]
mod mark_tests;
#[cfg(test)]
mod tests;
