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
