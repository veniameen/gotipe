use gotipe_core::{
    defaults, AttrValue, Block, BlockContent, BlockId, Document, EditorState, Mark, MarksRule,
    Schema, Step, TextSpan, Transaction,
};
use std::collections::HashMap;

fn paragraph() -> Block {
    Block {
        id: BlockId("p".into()),
        block_type: "paragraph".into(),
        attrs: HashMap::new(),
        content: BlockContent::RichText(vec![TextSpan {
            text: "Ж😀".into(),
            marks: vec![],
        }]),
        children: vec![],
    }
}
fn state(schema: Schema) -> EditorState {
    EditorState::new(
        Document {
            version: 0,
            blocks: vec![paragraph()],
        },
        schema,
    )
}

#[test]
fn explicit_empty_schema_keeps_custom_blocks_and_marks_editable() {
    let state = state(Schema::new());
    let mut second = paragraph();
    second.id = BlockId("custom".into());
    second.block_type = "customText".into();
    let changed = state
        .apply(
            Transaction::new()
                .with_step(Step::InsertBlock {
                    parent_id: None,
                    index: 1,
                    block: second,
                })
                .with_step(Step::SetBlockType {
                    block_id: BlockId("p".into()),
                    new_type: "customText".into(),
                    attrs: HashMap::new(),
                })
                .with_step(Step::AddMark {
                    block_id: BlockId("p".into()),
                    from: 1,
                    to: 3,
                    mark: Mark::new("customMark"),
                }),
        )
        .unwrap();
    assert_eq!(changed.doc().blocks.len(), 2);
    assert_eq!(changed.doc().blocks[0].block_type, "customText");
    let BlockContent::RichText(spans) = &changed.doc().blocks[0].content else {
        panic!("rich text lost")
    };
    assert_eq!(spans[1].text, "😀");
    assert_eq!(spans[1].marks[0].mark_type, "customMark");
}

#[test]
fn collapsed_mark_steps_validate_attributes_and_block_permissions_atomically() {
    let schema = defaults::default_block_editor();
    let mut missing_link = Mark::new("link");
    missing_link
        .attrs
        .insert("title".into(), AttrValue::Number(12.0));
    for mark in [Mark::new("unknownMark"), missing_link] {
        for insert in [false, true] {
            let state = state(schema.clone());
            let mark_step = if insert {
                Step::InsertText {
                    block_id: BlockId("p".into()),
                    offset: 0,
                    text: String::new(),
                    marks: vec![mark.clone()],
                }
            } else {
                Step::AddMark {
                    block_id: BlockId("p".into()),
                    from: 0,
                    to: 0,
                    mark: mark.clone(),
                }
            };
            let result = state.apply(
                Transaction::new()
                    .with_step(Step::InsertText {
                        block_id: BlockId("p".into()),
                        offset: 0,
                        text: "rollback".into(),
                        marks: vec![],
                    })
                    .with_step(mark_step),
            );
            assert!(result.is_err());
            assert_eq!(state.doc().version, 0);
            assert_eq!(state.doc().blocks[0].text_length(), 3);
        }
    }
    let mut restrictive = schema;
    restrictive
        .nodes
        .get_mut("paragraph")
        .unwrap()
        .marks_allowed = MarksRule::None;
    assert!(state(restrictive)
        .apply(Transaction::new().with_step(Step::AddMark {
            block_id: BlockId("p".into()),
            from: 0,
            to: 0,
            mark: Mark::new("bold"),
        }))
        .is_err());
}

#[test]
fn final_schema_validation_rejects_invalid_structural_batches() {
    let state = state(defaults::default_block_editor());
    let mut row = paragraph();
    row.id = BlockId("row".into());
    row.block_type = "tableRow".into();
    row.content = BlockContent::Empty;
    let result = state.apply(
        Transaction::new()
            .with_step(Step::InsertText {
                block_id: BlockId("p".into()),
                offset: 0,
                text: "rollback".into(),
                marks: vec![],
            })
            .with_step(Step::InsertBlock {
                parent_id: None,
                index: 1,
                block: row,
            }),
    );
    assert!(result.is_err());
    assert_eq!(state.doc().blocks.len(), 1);
    assert_eq!(state.doc().version, 0);
}
