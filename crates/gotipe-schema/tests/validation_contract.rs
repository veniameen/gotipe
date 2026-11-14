use gotipe_schema::{defaults, AttrValue, Block, BlockContent, Document, Mark, TextSpan};
use std::collections::HashMap;

#[test]
fn native_validation_checks_node_mark_types_top_level_and_unique_ids() {
    let schema = defaults::default_block_editor();
    let mut heading = Block::new_with_type(
        "heading",
        BlockContent::RichText(vec![TextSpan {
            text: "Title".into(),
            marks: vec![],
        }]),
    );
    heading.attrs.insert("level".into(), AttrValue::Number(2.0));
    let mut doc = Document {
        version: 0,
        blocks: vec![heading],
    };
    assert!(schema.validate(&doc).is_ok());
    doc.blocks[0]
        .attrs
        .insert("level".into(), AttrValue::String("2".into()));
    assert!(schema.validate(&doc).is_err());
    doc.blocks[0]
        .attrs
        .insert("level".into(), AttrValue::Number(2.0));
    if let BlockContent::RichText(spans) = &mut doc.blocks[0].content {
        spans[0].marks.push(Mark {
            mark_type: "link".into(),
            attrs: HashMap::from([("href".into(), AttrValue::Bool(true))]),
        });
    }
    assert!(schema.validate(&doc).is_err());
    if let BlockContent::RichText(spans) = &mut doc.blocks[0].content {
        spans[0].marks.clear();
    }
    doc.blocks.push(doc.blocks[0].clone());
    assert!(schema.validate(&doc).is_err());
    doc.blocks = vec![Block::new_with_type("tableRow", BlockContent::Empty)];
    assert!(schema.validate(&doc).is_err());
}

#[test]
fn paragraphs_and_headings_take_one_of_four_alignments() {
    let schema = defaults::default_block_editor();
    let text = || {
        BlockContent::RichText(vec![TextSpan {
            text: "Текст".into(),
            marks: vec![],
        }])
    };
    let mut paragraph = Block::new_with_type("paragraph", text());
    let mut heading = Block::new_with_type("heading", text());
    heading.attrs.insert("level".into(), AttrValue::Number(1.0));
    for align in ["left", "center", "right", "justify"] {
        paragraph
            .attrs
            .insert("align".into(), AttrValue::String(align.into()));
        heading
            .attrs
            .insert("align".into(), AttrValue::String(align.into()));
        let doc = Document {
            version: 0,
            blocks: vec![paragraph.clone(), heading.clone()],
        };
        assert!(schema.validate(&doc).is_ok(), "{align}");
    }
    paragraph.attrs.insert("align".into(), AttrValue::Null);
    let unset = Document {
        version: 0,
        blocks: vec![paragraph.clone()],
    };
    assert!(schema.validate(&unset).is_ok());
    paragraph
        .attrs
        .insert("align".into(), AttrValue::String("middle".into()));
    let invalid = Document {
        version: 0,
        blocks: vec![paragraph],
    };
    assert!(schema.validate(&invalid).is_err());
    let mut item = Block::new_with_type("listItem", text());
    item.attrs
        .insert("align".into(), AttrValue::String("left".into()));
    let mut list = Block::new_with_type("bulletList", BlockContent::Empty);
    list.children.push(item);
    let undeclared = Document {
        version: 0,
        blocks: vec![list],
    };
    assert!(schema.validate(&undeclared).is_err());
}
