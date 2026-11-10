use super::*;
use std::collections::HashMap;

fn make_doc_with_paragraph(text: &str) -> (Document, BlockId) {
    let id = BlockId("block1".into());
    let doc = Document {
        blocks: vec![Block {
            id: id.clone(),
            block_type: "paragraph".into(),
            attrs: HashMap::new(),
            content: BlockContent::RichText(vec![TextSpan {
                text: text.into(),
                marks: vec![],
            }]),
            children: vec![],
        }],
        version: 0,
    };
    (doc, id)
}

fn make_doc_with_two_paragraphs(text1: &str, text2: &str) -> (Document, BlockId, BlockId) {
    let id1 = BlockId("block1".into());
    let id2 = BlockId("block2".into());
    let doc = Document {
        blocks: vec![
            Block {
                id: id1.clone(),
                block_type: "paragraph".into(),
                attrs: HashMap::new(),
                content: BlockContent::RichText(vec![TextSpan {
                    text: text1.into(),
                    marks: vec![],
                }]),
                children: vec![],
            },
            Block {
                id: id2.clone(),
                block_type: "paragraph".into(),
                attrs: HashMap::new(),
                content: BlockContent::RichText(vec![TextSpan {
                    text: text2.into(),
                    marks: vec![],
                }]),
                children: vec![],
            },
        ],
        version: 0,
    };
    (doc, id1, id2)
}

#[test]
fn test_insert_text_into_empty_spans() {
    let (doc, id) = make_doc_with_paragraph("");
    let step = Step::InsertText {
        block_id: id.clone(),
        offset: 0,
        text: "Hello".into(),
        marks: vec![],
    };
    let result = step.apply(doc).unwrap();
    let block = result.find_block(&id).unwrap();
    assert_eq!(block.text_length(), 5);
}

#[test]
fn test_insert_text_at_middle() {
    let (doc, id) = make_doc_with_paragraph("Hello World");
    let step = Step::InsertText {
        block_id: id.clone(),
        offset: 5,
        text: " Beautiful".into(),
        marks: vec![],
    };
    let result = step.apply(doc).unwrap();
    let block = result.find_block(&id).unwrap();
    assert_eq!(block.text_length(), 21); // "Hello Beautiful World"
}

#[test]
fn test_delete_text_range() {
    let (doc, id) = make_doc_with_paragraph("Hello World");
    let step = Step::DeleteText {
        block_id: id.clone(),
        from: 5,
        to: 11,
    };
    let result = step.apply(doc).unwrap();
    let block = result.find_block(&id).unwrap();
    assert_eq!(block.text_length(), 5); // "Hello"
}

#[test]
fn test_delete_text_out_of_range_fails() {
    let (doc, id) = make_doc_with_paragraph("Hello");
    let step = Step::DeleteText {
        block_id: id,
        from: 0,
        to: 100,
    };
    assert!(step.apply(doc).is_err());
}

#[test]
fn test_insert_block_at_top_level() {
    let (doc, _) = make_doc_with_paragraph("First");
    let new_block = Block::new_paragraph();
    let step = Step::InsertBlock {
        parent_id: None,
        index: 1,
        block: new_block,
    };
    let result = step.apply(doc).unwrap();
    assert_eq!(result.blocks.len(), 2);
}

#[test]
fn test_delete_block() {
    let (doc, id) = make_doc_with_paragraph("Delete me");
    let step = Step::DeleteBlock { block_id: id };
    let result = step.apply(doc).unwrap();
    assert_eq!(result.blocks.len(), 0);
}

#[test]
fn test_delete_block_not_found() {
    let (doc, _) = make_doc_with_paragraph("Hello");
    let step = Step::DeleteBlock {
        block_id: BlockId("nonexistent".into()),
    };
    assert!(step.apply(doc).is_err());
}

#[test]
fn test_set_block_attrs() {
    let (doc, id) = make_doc_with_paragraph("Hello");
    let step = Step::SetBlockAttrs {
        block_id: id.clone(),
        attrs: HashMap::from([("level".into(), gotipe_schema::AttrValue::Number(2.0))]),
    };
    let result = step.apply(doc).unwrap();
    let block = result.find_block(&id).unwrap();
    assert!(block.attrs.contains_key("level"));
}

#[test]
fn test_set_block_type() {
    let (doc, id) = make_doc_with_paragraph("Hello");
    let step = Step::SetBlockType {
        block_id: id.clone(),
        new_type: "heading".into(),
        attrs: HashMap::from([("level".into(), gotipe_schema::AttrValue::Number(1.0))]),
    };
    let result = step.apply(doc).unwrap();
    let block = result.find_block(&id).unwrap();
    assert_eq!(block.block_type, "heading");
}

#[test]
fn test_add_mark_to_range() {
    let (doc, id) = make_doc_with_paragraph("Hello World");
    let step = Step::AddMark {
        block_id: id.clone(),
        from: 0,
        to: 5,
        mark: Mark::new("bold"),
    };
    let result = step.apply(doc).unwrap();
    let block = result.find_block(&id).unwrap();
    if let BlockContent::RichText(spans) = &block.content {
        assert!(spans[0].marks.iter().any(|m| m.mark_type == "bold"));
    } else {
        panic!("Expected RichText");
    }
}

#[test]
fn test_remove_mark_from_range() {
    let id = BlockId("b1".into());
    let doc = Document {
        blocks: vec![Block {
            id: id.clone(),
            block_type: "paragraph".into(),
            attrs: HashMap::new(),
            content: BlockContent::RichText(vec![TextSpan {
                text: "Bold text".into(),
                marks: vec![Mark::new("bold")],
            }]),
            children: vec![],
        }],
        version: 0,
    };
    let step = Step::RemoveMark {
        block_id: id.clone(),
        from: 0,
        to: 9,
        mark_type: "bold".into(),
    };
    let result = step.apply(doc).unwrap();
    let block = result.find_block(&id).unwrap();
    if let BlockContent::RichText(spans) = &block.content {
        assert!(spans.iter().all(|s| s.marks.is_empty()));
    } else {
        panic!("Expected RichText");
    }
}

#[test]
fn test_split_block() {
    let (doc, id) = make_doc_with_paragraph("Hello World");
    let step = Step::SplitBlock {
        block_id: id.clone(),
        offset: 5,
    };
    let result = step.apply(doc).unwrap();
    assert_eq!(result.blocks.len(), 2);
    assert_eq!(result.blocks[0].text_length(), 5);
    assert_eq!(result.blocks[1].text_length(), 6); // " World"
}

#[test]
fn test_merge_blocks() {
    let (doc, id1, id2) = make_doc_with_two_paragraphs("Hello", " World");
    let step = Step::MergeBlocks {
        block_id: id2,
        target_id: id1.clone(),
    };
    let result = step.apply(doc).unwrap();
    assert_eq!(result.blocks.len(), 1);
    assert_eq!(result.blocks[0].text_length(), 11); // "Hello World"
}

#[test]
fn test_move_block() {
    let (doc, _, id2) = make_doc_with_two_paragraphs("First", "Second");
    let step = Step::MoveBlock {
        block_id: id2,
        new_parent_id: None,
        new_index: 0,
    };
    let result = step.apply(doc).unwrap();
    assert_eq!(result.blocks.len(), 2);
    if let BlockContent::RichText(spans) = &result.blocks[0].content {
        assert_eq!(spans[0].text, "Second");
    }
}

#[test]
fn test_insert_text_into_raw_content() {
    let id = BlockId("code1".into());
    let doc = Document {
        blocks: vec![Block {
            id: id.clone(),
            block_type: "codeBlock".into(),
            attrs: HashMap::new(),
            content: BlockContent::Raw("fn main()".into()),
            children: vec![],
        }],
        version: 0,
    };
    let step = Step::InsertText {
        block_id: id.clone(),
        offset: 9,
        text: " {}".into(),
        marks: vec![],
    };
    let result = step.apply(doc).unwrap();
    let block = result.find_block(&id).unwrap();
    if let BlockContent::Raw(text) = &block.content {
        assert_eq!(text, "fn main() {}");
    } else {
        panic!("Expected Raw");
    }
}

#[test]
fn test_version_increments_on_apply() {
    let (doc, id) = make_doc_with_paragraph("Hello");
    assert_eq!(doc.version, 0);
    let step = Step::InsertText {
        block_id: id,
        offset: 5,
        text: "!".into(),
        marks: vec![],
    };
    let result = step.apply(doc).unwrap();
    assert_eq!(result.version, 1);
}
