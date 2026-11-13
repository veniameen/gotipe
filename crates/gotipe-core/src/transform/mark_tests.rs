use super::*;
use gotipe_schema::{defaults::default_block_editor, AttrValue};
use std::collections::HashMap;

fn paragraph(spans: Vec<TextSpan>) -> (Document, BlockId) {
    let id = BlockId("p".into());
    let doc = Document {
        blocks: vec![Block {
            id: id.clone(),
            block_type: "paragraph".into(),
            attrs: HashMap::new(),
            content: BlockContent::RichText(spans),
            children: vec![],
        }],
        version: 0,
    };
    (doc, id)
}

fn span(text: &str, marks: Vec<Mark>) -> TextSpan {
    TextSpan {
        text: text.into(),
        marks,
    }
}

fn link(href: &str) -> Mark {
    Mark::new("link").with_attr("href", AttrValue::String(href.into()))
}

fn spans(doc: &Document) -> Vec<(String, Vec<Mark>)> {
    let BlockContent::RichText(spans) = &doc.blocks[0].content else {
        panic!("expected rich text")
    };
    spans
        .iter()
        .map(|span| (span.text.clone(), span.marks.clone()))
        .collect()
}

fn add(id: &BlockId, from: usize, to: usize, mark: Mark) -> Step {
    Step::AddMark {
        block_id: id.clone(),
        from,
        to,
        mark,
    }
}

#[test]
fn add_mark_replaces_the_attributes_of_the_same_type_in_place() {
    let (doc, id) = paragraph(vec![
        span("Ссылка", vec![link("https://old.test"), Mark::new("bold")]),
        span(" 😀", vec![]),
    ]);
    let result = add(&id, 2, 9, link("https://new.test")).apply(doc).unwrap();
    assert_eq!(
        spans(&result),
        vec![
            (
                "Сс".into(),
                vec![link("https://old.test"), Mark::new("bold")]
            ),
            (
                "ылка".into(),
                vec![link("https://new.test"), Mark::new("bold")]
            ),
            (" 😀".into(), vec![link("https://new.test")]),
        ]
    );
}

#[test]
fn add_mark_with_equal_attributes_changes_nothing() {
    let (doc, id) = paragraph(vec![span("abc", vec![Mark::new("italic"), link("x")])]);
    let before = spans(&doc);
    let result = add(&id, 0, 3, link("x")).apply(doc).unwrap();
    assert_eq!(spans(&result), before);
}

#[test]
fn add_mark_removes_other_marks_of_its_exclusive_group() {
    let schema = default_block_editor();
    let (doc, id) = paragraph(vec![span("x2", vec![Mark::new("subscript")])]);
    let result = add(&id, 1, 2, Mark::new("superscript"))
        .apply_with_schema(doc, Some(&schema))
        .unwrap();
    assert_eq!(
        spans(&result),
        vec![
            ("x".into(), vec![Mark::new("subscript")]),
            ("2".into(), vec![Mark::new("superscript")]),
        ]
    );
    let schemaless = add(&id, 0, 2, Mark::new("superscript"))
        .apply(result)
        .unwrap();
    assert_eq!(
        spans(&schemaless)[0].1,
        vec![Mark::new("subscript"), Mark::new("superscript")]
    );
}

#[test]
fn add_mark_collapses_duplicate_marks_of_its_type() {
    let (doc, id) = paragraph(vec![span(
        "ab",
        vec![link("a"), Mark::new("bold"), link("b")],
    )]);
    let result = add(&id, 0, 2, link("c")).apply(doc).unwrap();
    assert_eq!(spans(&result)[0].1, vec![link("c"), Mark::new("bold")]);
}

#[test]
fn insert_text_applies_its_marks_in_order() {
    let schema = default_block_editor();
    let (doc, id) = paragraph(vec![span("H", vec![])]);
    let step = Step::InsertText {
        block_id: id,
        offset: 1,
        text: "2O".into(),
        marks: vec![
            Mark::new("superscript"),
            link("a"),
            Mark::new("subscript"),
            link("b"),
        ],
    };
    let result = step.apply_with_schema(doc, Some(&schema)).unwrap();
    assert_eq!(spans(&result)[1].1, vec![link("b"), Mark::new("subscript")]);
}

#[test]
fn editor_state_records_one_step_for_a_recolouring() {
    let schema = default_block_editor();
    let color =
        |value: &str| Mark::new("textColor").with_attr("color", AttrValue::String(value.into()));
    let (doc, id) = paragraph(vec![span("Цвет", vec![color("#c4382f")])]);
    let state = crate::EditorState::new(doc, schema);
    let next = state
        .apply(crate::Transaction::new().with_step(add(&id, 0, 4, color("#2c62d4"))))
        .unwrap();
    assert_eq!(
        spans(next.doc()),
        vec![("Цвет".into(), vec![color("#2c62d4")])]
    );
    assert_eq!(next.last_steps().len(), 1);
}
