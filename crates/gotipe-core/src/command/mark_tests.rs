use super::*;
use crate::selection::TextPosition;
use gotipe_schema::{defaults::default_block_editor, Document, Mark, TextSpan};

fn text(id: &str, block_type: &str, value: &str, marks: Vec<Mark>) -> Block {
    Block {
        id: BlockId(id.into()),
        block_type: block_type.into(),
        attrs: HashMap::new(),
        content: BlockContent::RichText(if value.is_empty() {
            vec![]
        } else {
            vec![TextSpan {
                text: value.into(),
                marks,
            }]
        }),
        children: vec![],
    }
}

fn structure(id: &str, block_type: &str, children: Vec<Block>) -> Block {
    Block {
        id: BlockId(id.into()),
        block_type: block_type.into(),
        attrs: HashMap::new(),
        content: BlockContent::Empty,
        children,
    }
}

/// Paragraph, list, table, divider and code: blocks with and without text.
fn mixed(marks: Vec<Mark>) -> Document {
    let mut code = text("code", "codeBlock", "", vec![]);
    code.content = BlockContent::Raw("let a = 1;".into());
    Document {
        blocks: vec![
            text("p", "paragraph", "Абзац😀", marks.clone()),
            structure(
                "list",
                "bulletList",
                vec![text("item", "listItem", "пункт", marks.clone())],
            ),
            structure(
                "table",
                "table",
                vec![structure(
                    "row",
                    "tableRow",
                    vec![text("cell", "tableCell", "ячейка", marks.clone())],
                )],
            ),
            structure("hr", "divider", vec![]),
            code,
            text("last", "paragraph", "конец", marks),
        ],
        version: 0,
    }
}

fn state(doc: Document, selection: Selection) -> EditorState {
    EditorState::new(doc, default_block_editor()).with_selection(selection)
}

fn range(from: (&str, usize), to: (&str, usize)) -> Selection {
    Selection::Range {
        anchor: TextPosition {
            block_id: BlockId(from.0.into()),
            offset: from.1,
        },
        head: TextPosition {
            block_id: BlockId(to.0.into()),
            offset: to.1,
        },
    }
}

fn targets(tr: &Transaction) -> Vec<(String, usize, usize, bool)> {
    tr.steps
        .iter()
        .map(|step| match step {
            Step::AddMark {
                block_id, from, to, ..
            } => (block_id.0.clone(), *from, *to, true),
            Step::RemoveMark {
                block_id, from, to, ..
            } => (block_id.0.clone(), *from, *to, false),
            other => panic!("unexpected step {other:?}"),
        })
        .collect()
}

#[test]
fn toggle_covers_every_text_block_of_a_reverse_range_and_applies() {
    let state = state(mixed(vec![]), range(("last", 3), ("p", 2)));
    let tr = toggle_bold(&state).unwrap();
    assert_eq!(
        targets(&tr),
        vec![
            ("p".into(), 2, 7, true),
            ("item".into(), 0, 5, true),
            ("cell".into(), 0, 6, true),
            ("last".into(), 0, 3, true),
        ]
    );
    assert!(state.apply(tr).is_ok());
}

#[test]
fn toggle_removes_a_mark_only_when_every_selected_character_has_it() {
    let bold = || vec![Mark::new("bold")];
    let all = state(
        mixed(bold()),
        Selection::Multi {
            block_ids: vec![
                BlockId("p".into()),
                BlockId("list".into()),
                BlockId("table".into()),
            ],
        },
    );
    let tr = toggle_bold(&all).unwrap();
    assert_eq!(
        targets(&tr),
        vec![
            ("p".into(), 0, 7, false),
            ("item".into(), 0, 5, false),
            ("cell".into(), 0, 6, false),
        ]
    );
    let mut partly = mixed(bold());
    partly.blocks[0] = text("p", "paragraph", "Абзац😀", vec![]);
    let tr = toggle_bold(&state(
        partly,
        Selection::Block {
            block_id: BlockId("table".into()),
        },
    ))
    .unwrap();
    assert_eq!(targets(&tr), vec![("cell".into(), 0, 6, false)]);
    assert!(toggle_bold(&state(
        mixed(vec![]),
        Selection::cursor(BlockId("p".into()), 1)
    ))
    .is_none());
}

#[test]
fn set_link_replaces_an_existing_address_with_defaults() {
    let old = Mark::new("link").with_attr("href", AttrValue::String("https://old.test".into()));
    let state = state(mixed(vec![old]), Selection::text(BlockId("p".into()), 0, 5));
    let next = state
        .apply(set_link(&state, "https://new.test").unwrap())
        .unwrap();
    let BlockContent::RichText(spans) = &next.doc().blocks[0].content else {
        panic!("expected rich text")
    };
    let link = &spans[0].marks[0];
    assert_eq!(
        link.attrs.get("href"),
        Some(&AttrValue::String("https://new.test".into()))
    );
    assert_eq!(
        link.attrs.get("target"),
        Some(&AttrValue::String("_blank".into()))
    );
    assert_eq!(
        spans[1].marks[0].attrs.get("href"),
        Some(&AttrValue::String("https://old.test".into()))
    );
}

#[test]
fn block_commands_write_declared_defaults() {
    let state = state(mixed(vec![]), Selection::cursor(BlockId("p".into()), 0));
    let tr = insert_block_after(&state, "heading").unwrap();
    let Step::InsertBlock { block, .. } = &tr.steps[0] else {
        panic!("expected InsertBlock")
    };
    assert_eq!(block.attrs.get("level"), Some(&AttrValue::Number(1.0)));
    assert!(state.apply(tr).is_ok());
    let tr = set_block_type(&state, "codeBlock", HashMap::new()).unwrap();
    let Step::SetBlockType { attrs, .. } = &tr.steps[0] else {
        panic!("expected SetBlockType")
    };
    // Plain text is the empty language, written as a bare fence.
    assert_eq!(
        attrs.get("language"),
        Some(&AttrValue::String(String::new()))
    );
    let tr = set_block_type(&state, "paragraph", HashMap::new()).unwrap();
    let Step::SetBlockType { attrs, .. } = &tr.steps[0] else {
        panic!("expected SetBlockType")
    };
    assert!(attrs.is_empty());
}
