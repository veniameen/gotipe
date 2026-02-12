use std::collections::HashMap;

use gotipe_schema::{AttrValue, Block, BlockContent, BlockId, Mark, TextSpan};

use crate::clipboard::ClipboardData;
use crate::selection::Selection;
use crate::state::EditorState;
use crate::transaction::{Step, Transaction};

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
    let new_block = Block::new_with_type(block_type, default_content_for_type(block_type));
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
    let new_block = Block::new_with_type(block_type, default_content_for_type(block_type));
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
        Some(Transaction::new().with_step(Step::SetBlockAttrs {
            block_id: block_id.clone(),
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
                let text = extract_text_range(spans, *from, *to);
                Some(ClipboardData {
                    plain_text: text.clone(),
                    html: None,
                    internal_json: None,
                })
            } else if let BlockContent::Raw(raw) = &block.content {
                let text = raw[*from..*to].to_string();
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

// === Helpers ===

fn spans_have_mark_in_range(spans: &[TextSpan], from: usize, to: usize, mark_type: &str) -> bool {
    let mut offset = 0;
    for span in spans {
        let span_end = offset + span.text.len();
        if span_end > from && offset < to && span.marks.iter().any(|m| m.mark_type == mark_type) {
            return true;
        }
        offset = span_end;
    }
    false
}

fn extract_text_range(spans: &[TextSpan], from: usize, to: usize) -> String {
    let full_text: String = spans.iter().map(|s| s.text.as_str()).collect();
    full_text.get(from..to).unwrap_or("").to_string()
}

fn block_to_plain_text(block: &Block) -> String {
    match &block.content {
        BlockContent::RichText(spans) => spans.iter().map(|s| s.text.as_str()).collect(),
        BlockContent::Raw(s) => s.clone(),
        BlockContent::Empty => String::new(),
    }
}

fn default_content_for_type(block_type: &str) -> BlockContent {
    match block_type {
        "codeBlock" | "math" => BlockContent::Raw(String::new()),
        "divider" | "image" | "embed" | "file" | "bulletList" | "orderedList" | "table"
        | "columns" => BlockContent::Empty,
        _ => BlockContent::RichText(Vec::new()),
    }
}

fn reassign_ids(block: &mut Block) {
    block.id = BlockId::new();
    for child in &mut block.children {
        reassign_ids(child);
    }
}

fn toggle_list_type(state: &EditorState, list_type: &str) -> Option<Transaction> {
    let block_id = state.selection().block_id();
    let _block = state.doc().find_block(block_id)?;

    // If already in a list of this type, convert back to paragraph
    let (parent_id, _) = state.doc().parent_and_index(block_id)?;
    if let Some(ref pid) = parent_id {
        let parent = state.doc().find_block(pid)?;
        if parent.block_type == list_type {
            // Unwrap: move the block out of the list
            return Some(Transaction::new().with_step(Step::SetBlockType {
                block_id: block_id.clone(),
                new_type: "paragraph".into(),
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
    let (parent_id, index) = state.doc().parent_and_index(block_id)?;

    // Create list item from the current block content
    let mut list_item_attrs = HashMap::new();
    if let Some((k, v)) = extra_attr {
        list_item_attrs.insert(k.into(), v);
    }
    let list_item = Block {
        id: BlockId::new(),
        block_type: "listItem".into(),
        attrs: list_item_attrs,
        content: block.content.clone(),
        children: vec![],
    };

    let list_block = Block {
        id: BlockId::new(),
        block_type: list_type.into(),
        attrs: HashMap::new(),
        content: BlockContent::Empty,
        children: vec![list_item],
    };

    let mut tr = Transaction::new();
    tr.steps.push(Step::DeleteBlock {
        block_id: block_id.clone(),
    });
    tr.steps.push(Step::InsertBlock {
        parent_id,
        index,
        block: list_block,
    });
    Some(tr)
}

#[cfg(test)]
mod tests {
    use super::*;
    use gotipe_schema::{Block, BlockContent, BlockId, TextSpan};

    fn test_state_with_selection(from: usize, to: usize) -> EditorState {
        let schema = gotipe_schema::defaults::default_block_editor();
        let doc = gotipe_schema::Document {
            blocks: vec![Block {
                id: BlockId("b1".into()),
                block_type: "paragraph".into(),
                attrs: HashMap::new(),
                content: BlockContent::RichText(vec![TextSpan {
                    text: "Hello World".into(),
                    marks: vec![],
                }]),
                children: vec![],
            }],
            version: 0,
        };
        EditorState::new(doc, schema).with_selection(Selection::Text {
            block_id: BlockId("b1".into()),
            from,
            to,
        })
    }

    fn test_state_cursor(offset: usize) -> EditorState {
        let schema = gotipe_schema::defaults::default_block_editor();
        let doc = gotipe_schema::Document {
            blocks: vec![Block {
                id: BlockId("b1".into()),
                block_type: "paragraph".into(),
                attrs: HashMap::new(),
                content: BlockContent::RichText(vec![TextSpan {
                    text: "Hello World".into(),
                    marks: vec![],
                }]),
                children: vec![],
            }],
            version: 0,
        };
        EditorState::new(doc, schema).with_selection(Selection::Cursor {
            block_id: BlockId("b1".into()),
            offset,
        })
    }

    #[test]
    fn test_toggle_bold_creates_add_mark() {
        let state = test_state_with_selection(0, 5);
        let tr = toggle_bold(&state).unwrap();
        assert_eq!(tr.steps.len(), 1);
        assert!(matches!(&tr.steps[0], Step::AddMark { mark, .. } if mark.mark_type == "bold"));
    }

    #[test]
    fn test_split_block_from_cursor() {
        let state = test_state_cursor(5);
        let tr = split_block(&state).unwrap();
        assert!(matches!(&tr.steps[0], Step::SplitBlock { offset: 5, .. }));
    }

    #[test]
    fn test_insert_block_after() {
        let state = test_state_cursor(0);
        let tr = insert_block_after(&state, "paragraph").unwrap();
        assert!(matches!(&tr.steps[0], Step::InsertBlock { index: 1, .. }));
    }

    #[test]
    fn test_copy_returns_clipboard_data() {
        let state = test_state_with_selection(0, 5);
        let data = copy(&state).unwrap();
        assert_eq!(data.plain_text, "Hello");
    }

    #[test]
    fn test_paste_inserts_text_at_cursor() {
        let state = test_state_cursor(5);
        let data = ClipboardData {
            plain_text: " Beautiful".into(),
            html: None,
            internal_json: None,
        };
        let tr = paste(&state, &data).unwrap();
        assert!(matches!(&tr.steps[0], Step::InsertText { text, .. } if text == " Beautiful"));
    }

    #[test]
    fn test_select_all_returns_multi_selection() {
        let state = test_state_cursor(0);
        let tr = select_all(&state).unwrap();
        assert!(matches!(tr.selection, Some(Selection::Multi { .. })));
    }
}
