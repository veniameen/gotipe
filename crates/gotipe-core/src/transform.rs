use gotipe_schema::{Block, BlockContent, BlockId, Document, Mark, TextSpan};

use crate::transaction::{Step, TransformError};

impl Step {
    /// Apply step to document, return new document
    pub fn apply(&self, mut doc: Document) -> Result<Document, TransformError> {
        match self {
            Step::InsertText {
                block_id,
                offset,
                text,
                marks,
            } => {
                let block = doc
                    .find_block_mut(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;

                match &mut block.content {
                    BlockContent::RichText(spans) => {
                        insert_text_at(spans, *offset, text, marks)?;
                    }
                    BlockContent::Raw(raw) => {
                        if *offset > raw.len() {
                            return Err(TransformError::OffsetOutOfRange);
                        }
                        raw.insert_str(*offset, text);
                    }
                    BlockContent::Empty => {
                        return Err(TransformError::InvalidContentType);
                    }
                }
                doc.version += 1;
                Ok(doc)
            }

            Step::DeleteText { block_id, from, to } => {
                if from >= to {
                    return Ok(doc);
                }
                let block = doc
                    .find_block_mut(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;

                match &mut block.content {
                    BlockContent::RichText(spans) => {
                        delete_text_range(spans, *from, *to)?;
                    }
                    BlockContent::Raw(raw) => {
                        if *to > raw.len() {
                            return Err(TransformError::OffsetOutOfRange);
                        }
                        raw.drain(*from..*to);
                    }
                    BlockContent::Empty => {
                        return Err(TransformError::InvalidContentType);
                    }
                }
                doc.version += 1;
                Ok(doc)
            }

            Step::InsertBlock {
                parent_id,
                index,
                block,
            } => {
                if let Some(parent_id) = parent_id {
                    let parent = doc
                        .find_block_mut(parent_id)
                        .ok_or(TransformError::BlockNotFound(parent_id.clone()))?;
                    let idx = (*index).min(parent.children.len());
                    parent.children.insert(idx, block.clone());
                } else {
                    let idx = (*index).min(doc.blocks.len());
                    doc.blocks.insert(idx, block.clone());
                }
                doc.version += 1;
                Ok(doc)
            }

            Step::DeleteBlock { block_id } => {
                doc.remove_block(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
                doc.version += 1;
                Ok(doc)
            }

            Step::MoveBlock {
                block_id,
                new_parent_id,
                new_index,
            } => {
                let block = doc
                    .remove_block(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;

                if let Some(parent_id) = new_parent_id {
                    let parent = doc
                        .find_block_mut(parent_id)
                        .ok_or(TransformError::BlockNotFound(parent_id.clone()))?;
                    let idx = (*new_index).min(parent.children.len());
                    parent.children.insert(idx, block);
                } else {
                    let idx = (*new_index).min(doc.blocks.len());
                    doc.blocks.insert(idx, block);
                }
                doc.version += 1;
                Ok(doc)
            }

            Step::SetBlockAttrs { block_id, attrs } => {
                let block = doc
                    .find_block_mut(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
                for (k, v) in attrs {
                    block.attrs.insert(k.clone(), v.clone());
                }
                doc.version += 1;
                Ok(doc)
            }

            Step::SetBlockType {
                block_id,
                new_type,
                attrs,
            } => {
                let block = doc
                    .find_block_mut(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
                block.block_type.clone_from(new_type);
                block.attrs = attrs.clone();
                doc.version += 1;
                Ok(doc)
            }

            Step::AddMark {
                block_id,
                from,
                to,
                mark,
            } => {
                let block = doc
                    .find_block_mut(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
                if let BlockContent::RichText(spans) = &mut block.content {
                    add_mark_to_range(spans, *from, *to, mark)?;
                }
                doc.version += 1;
                Ok(doc)
            }

            Step::RemoveMark {
                block_id,
                from,
                to,
                mark_type,
            } => {
                let block = doc
                    .find_block_mut(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
                if let BlockContent::RichText(spans) = &mut block.content {
                    remove_mark_from_range(spans, *from, *to, mark_type)?;
                }
                doc.version += 1;
                Ok(doc)
            }

            Step::SplitBlock { block_id, offset } => {
                split_block_at(&mut doc, block_id, *offset)?;
                doc.version += 1;
                Ok(doc)
            }

            Step::MergeBlocks {
                block_id,
                target_id,
            } => {
                merge_blocks(&mut doc, target_id, block_id)?;
                doc.version += 1;
                Ok(doc)
            }
        }
    }
}

/// Helper: insert text into spans at a character offset
fn insert_text_at(
    spans: &mut Vec<TextSpan>,
    offset: usize,
    text: &str,
    marks: &[Mark],
) -> Result<(), TransformError> {
    if spans.is_empty() {
        spans.push(TextSpan {
            text: text.to_string(),
            marks: marks.to_vec(),
        });
        return Ok(());
    }

    let mut current_offset = 0;

    for i in 0..spans.len() {
        let span_len = spans[i].text.len();

        if current_offset + span_len >= offset {
            let local_offset = offset - current_offset;

            // Check if marks match — if so, just insert into existing span
            if spans[i].marks == *marks {
                spans[i].text.insert_str(local_offset, text);
                return Ok(());
            }

            // Otherwise, split span and insert new one
            let after = spans[i].text.split_off(local_offset);
            let new_span = TextSpan {
                text: text.to_string(),
                marks: marks.to_vec(),
            };

            let after_span = TextSpan {
                text: after,
                marks: spans[i].marks.clone(),
            };

            spans.insert(i + 1, new_span);
            spans.insert(i + 2, after_span);
            normalize_spans(spans);
            return Ok(());
        }

        current_offset += span_len;
    }

    // Append at end
    spans.push(TextSpan {
        text: text.to_string(),
        marks: marks.to_vec(),
    });
    normalize_spans(spans);
    Ok(())
}

/// Helper: delete text range from spans
fn delete_text_range(
    spans: &mut Vec<TextSpan>,
    from: usize,
    to: usize,
) -> Result<(), TransformError> {
    if from >= to {
        return Ok(());
    }

    let total_len: usize = spans.iter().map(|s| s.text.len()).sum();
    if to > total_len {
        return Err(TransformError::OffsetOutOfRange);
    }

    let mut new_spans = Vec::new();
    let mut current_offset = 0;

    for span in spans.iter() {
        let span_start = current_offset;
        let span_end = current_offset + span.text.len();

        if span_end <= from || span_start >= to {
            // Span is completely outside the delete range
            new_spans.push(span.clone());
        } else {
            // Span overlaps with delete range
            let keep_start = if from > span_start {
                &span.text[..from - span_start]
            } else {
                ""
            };
            let keep_end = if to < span_end {
                &span.text[to - span_start..]
            } else {
                ""
            };

            if !keep_start.is_empty() {
                new_spans.push(TextSpan {
                    text: keep_start.to_string(),
                    marks: span.marks.clone(),
                });
            }
            if !keep_end.is_empty() {
                new_spans.push(TextSpan {
                    text: keep_end.to_string(),
                    marks: span.marks.clone(),
                });
            }
        }

        current_offset = span_end;
    }

    *spans = new_spans;
    normalize_spans(spans);
    Ok(())
}

/// Helper: add a mark to a text range
fn add_mark_to_range(
    spans: &mut Vec<TextSpan>,
    from: usize,
    to: usize,
    mark: &Mark,
) -> Result<(), TransformError> {
    if from >= to {
        return Ok(());
    }

    let mut new_spans = Vec::new();
    let mut current_offset = 0;

    for span in spans.iter() {
        let span_start = current_offset;
        let span_end = current_offset + span.text.len();

        if span_end <= from || span_start >= to {
            // Outside range — keep as-is
            new_spans.push(span.clone());
        } else {
            // Before the range
            if span_start < from {
                new_spans.push(TextSpan {
                    text: span.text[..from - span_start].to_string(),
                    marks: span.marks.clone(),
                });
            }

            // The overlapping part — add the mark
            let overlap_start = from.max(span_start) - span_start;
            let overlap_end = to.min(span_end) - span_start;
            let mut new_marks = span.marks.clone();
            // Remove existing marks in the same exclusive group if applicable
            if !new_marks.iter().any(|m| m.mark_type == mark.mark_type) {
                new_marks.push(mark.clone());
            }
            new_spans.push(TextSpan {
                text: span.text[overlap_start..overlap_end].to_string(),
                marks: new_marks,
            });

            // After the range
            if span_end > to {
                new_spans.push(TextSpan {
                    text: span.text[to - span_start..].to_string(),
                    marks: span.marks.clone(),
                });
            }
        }

        current_offset = span_end;
    }

    *spans = new_spans;
    normalize_spans(spans);
    Ok(())
}

/// Helper: remove a mark type from a text range
fn remove_mark_from_range(
    spans: &mut Vec<TextSpan>,
    from: usize,
    to: usize,
    mark_type: &str,
) -> Result<(), TransformError> {
    if from >= to {
        return Ok(());
    }

    let mut new_spans = Vec::new();
    let mut current_offset = 0;

    for span in spans.iter() {
        let span_start = current_offset;
        let span_end = current_offset + span.text.len();

        if span_end <= from || span_start >= to {
            // Outside range — keep as-is
            new_spans.push(span.clone());
        } else {
            // Before the range
            if span_start < from {
                new_spans.push(TextSpan {
                    text: span.text[..from - span_start].to_string(),
                    marks: span.marks.clone(),
                });
            }

            // The overlapping part — remove the mark
            let overlap_start = from.max(span_start) - span_start;
            let overlap_end = to.min(span_end) - span_start;
            let new_marks: Vec<Mark> = span
                .marks
                .iter()
                .filter(|m| m.mark_type != mark_type)
                .cloned()
                .collect();
            new_spans.push(TextSpan {
                text: span.text[overlap_start..overlap_end].to_string(),
                marks: new_marks,
            });

            // After the range
            if span_end > to {
                new_spans.push(TextSpan {
                    text: span.text[to - span_start..].to_string(),
                    marks: span.marks.clone(),
                });
            }
        }

        current_offset = span_end;
    }

    *spans = new_spans;
    normalize_spans(spans);
    Ok(())
}

/// Helper: split a block at a text offset, creating a new block after it
fn split_block_at(
    doc: &mut Document,
    block_id: &BlockId,
    offset: usize,
) -> Result<(), TransformError> {
    let (parent_id, index) = doc
        .parent_and_index(block_id)
        .ok_or(TransformError::BlockNotFound(block_id.clone()))?;

    let block = doc
        .find_block_mut(block_id)
        .ok_or(TransformError::BlockNotFound(block_id.clone()))?;

    let new_block_id = BlockId::new();
    let new_content = match &mut block.content {
        BlockContent::RichText(spans) => {
            let total_len: usize = spans.iter().map(|s| s.text.len()).sum();
            if offset > total_len {
                return Err(TransformError::OffsetOutOfRange);
            }

            // Split spans at offset
            let mut before_spans = Vec::new();
            let mut after_spans = Vec::new();
            let mut current_offset = 0;

            for span in spans.iter() {
                let span_end = current_offset + span.text.len();
                if span_end <= offset {
                    before_spans.push(span.clone());
                } else if current_offset >= offset {
                    after_spans.push(span.clone());
                } else {
                    // Split this span
                    let local_offset = offset - current_offset;
                    before_spans.push(TextSpan {
                        text: span.text[..local_offset].to_string(),
                        marks: span.marks.clone(),
                    });
                    after_spans.push(TextSpan {
                        text: span.text[local_offset..].to_string(),
                        marks: span.marks.clone(),
                    });
                }
                current_offset = span_end;
            }

            *spans = before_spans;
            BlockContent::RichText(after_spans)
        }
        BlockContent::Raw(raw) => {
            if offset > raw.len() {
                return Err(TransformError::OffsetOutOfRange);
            }
            let after = raw.split_off(offset);
            BlockContent::Raw(after)
        }
        BlockContent::Empty => {
            return Err(TransformError::InvalidContentType);
        }
    };

    let block_type = block.block_type.clone();
    let new_block = Block {
        id: new_block_id,
        block_type,
        attrs: std::collections::HashMap::new(),
        content: new_content,
        children: Vec::new(),
    };

    // Insert new block after the current one
    if let Some(parent_id) = parent_id {
        let parent = doc
            .find_block_mut(&parent_id)
            .ok_or(TransformError::BlockNotFound(parent_id.clone()))?;
        parent.children.insert(index + 1, new_block);
    } else {
        doc.blocks.insert(index + 1, new_block);
    }

    Ok(())
}

/// Helper: merge source block into target block
fn merge_blocks(
    doc: &mut Document,
    target_id: &BlockId,
    source_id: &BlockId,
) -> Result<(), TransformError> {
    let source = doc
        .remove_block(source_id)
        .ok_or(TransformError::BlockNotFound(source_id.clone()))?;

    let target = doc
        .find_block_mut(target_id)
        .ok_or(TransformError::BlockNotFound(target_id.clone()))?;

    match (&mut target.content, source.content) {
        (BlockContent::RichText(target_spans), BlockContent::RichText(source_spans)) => {
            target_spans.extend(source_spans);
            normalize_spans(target_spans);
        }
        (BlockContent::Raw(target_raw), BlockContent::Raw(source_raw)) => {
            target_raw.push_str(&source_raw);
        }
        _ => {
            return Err(TransformError::InvalidContentType);
        }
    }

    Ok(())
}

/// Normalize spans: merge adjacent spans with the same marks, remove empty spans
fn normalize_spans(spans: &mut Vec<TextSpan>) {
    // Remove empty spans
    spans.retain(|s| !s.text.is_empty());

    // Merge adjacent spans with the same marks
    let mut i = 0;
    while i + 1 < spans.len() {
        if spans[i].marks == spans[i + 1].marks {
            let next_text = spans[i + 1].text.clone();
            spans[i].text.push_str(&next_text);
            spans.remove(i + 1);
        } else {
            i += 1;
        }
    }
}

#[cfg(test)]
mod tests {
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
}
