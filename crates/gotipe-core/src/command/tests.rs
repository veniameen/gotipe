use super::*;
use crate::clipboard::ClipboardData;
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
