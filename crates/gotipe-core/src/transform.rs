use gotipe_schema::{Block, BlockContent, BlockId, ContentRule, Document, Mark, Schema, TextSpan};

use crate::transaction::{Step, TransformError};

mod marks;

impl Step {
    /// Apply step to document, return new document. Without a schema, marks have
    /// no exclusive groups; `EditorState::apply` passes the editor's schema.
    pub fn apply(&self, doc: Document) -> Result<Document, TransformError> {
        self.apply_with_schema(doc, None)
    }

    pub(crate) fn apply_with_schema(
        &self,
        mut doc: Document,
        schema: Option<&Schema>,
    ) -> Result<Document, TransformError> {
        let next_version = doc
            .version
            .checked_add(1)
            .ok_or_else(|| TransformError::InvalidStep("Document revision exhausted".into()))?;
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

                promote_empty_content(block, schema);
                match &mut block.content {
                    BlockContent::RichText(spans) => {
                        let marks = marks::normalize_marks(marks, schema);
                        insert_text_at(spans, *offset, text, &marks)?;
                    }
                    BlockContent::Raw(raw) => {
                        let byte_offset = byte_offset(raw, *offset)?;
                        raw.insert_str(byte_offset, text);
                    }
                    BlockContent::Empty => {
                        return Err(TransformError::InvalidContentType);
                    }
                }
                doc.version = next_version;
                Ok(doc)
            }

            Step::DeleteText { block_id, from, to } => {
                let block = doc
                    .find_block_mut(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;

                match &mut block.content {
                    BlockContent::RichText(spans) => {
                        delete_text_range(spans, *from, *to)?;
                    }
                    BlockContent::Raw(raw) => {
                        if from > to {
                            return Err(TransformError::OffsetOutOfRange);
                        }
                        let start = byte_offset(raw, *from)?;
                        let end = byte_offset(raw, *to)?;
                        raw.drain(start..end);
                    }
                    BlockContent::Empty => {
                        return Err(TransformError::InvalidContentType);
                    }
                }
                doc.version = next_version;
                Ok(doc)
            }

            Step::InsertBlock {
                parent_id,
                index,
                block,
            } => {
                let subtree = Document {
                    blocks: vec![block.clone()],
                    version: 0,
                };
                if subtree.duplicate_block_id().is_some()
                    || subtree
                        .flatten()
                        .any(|node| doc.find_block(&node.id).is_some())
                {
                    return Err(TransformError::InvalidStep("Duplicate block ID".into()));
                }
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
                doc.version = next_version;
                Ok(doc)
            }

            Step::DeleteBlock { block_id } => {
                doc.remove_block(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
                doc.version = next_version;
                Ok(doc)
            }

            Step::MoveBlock {
                block_id,
                new_parent_id,
                new_index,
            } => {
                let source = doc
                    .find_block(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
                if let Some(parent_id) = new_parent_id {
                    if contains_block(source, parent_id) {
                        return Err(TransformError::CycleDetected);
                    }
                    if doc.find_block(parent_id).is_none() {
                        return Err(TransformError::BlockNotFound(parent_id.clone()));
                    }
                }
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
                doc.version = next_version;
                Ok(doc)
            }

            Step::SetBlockAttrs { block_id, attrs } => {
                let block = doc
                    .find_block_mut(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
                for (k, v) in attrs {
                    block.attrs.insert(k.clone(), v.clone());
                }
                doc.version = next_version;
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
                if let Some(rule) = content_rule(new_type, schema) {
                    convert_content(block, &rule);
                }
                block.block_type.clone_from(new_type);
                block.attrs = attrs.clone();
                doc.version = next_version;
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
                    map_marks_in_range(spans, *from, *to, |marks| {
                        marks::apply_mark(marks, mark, schema)
                    })?;
                } else {
                    return Err(TransformError::InvalidContentType);
                }
                doc.version = next_version;
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
                } else {
                    return Err(TransformError::InvalidContentType);
                }
                doc.version = next_version;
                Ok(doc)
            }

            Step::SplitBlock { block_id, offset } => {
                split_block_at(&mut doc, block_id, *offset, schema)?;
                doc.version = next_version;
                Ok(doc)
            }

            Step::MergeBlocks {
                block_id,
                target_id,
            } => {
                merge_blocks(&mut doc, target_id, block_id, schema)?;
                doc.version = next_version;
                Ok(doc)
            }
        }
    }
}

/// Translate a DOM/JavaScript UTF-16 offset into a Rust string boundary.
/// An offset inside a surrogate pair is invalid; never slice a UTF-8 string with it.
pub(crate) fn byte_offset(text: &str, offset: usize) -> Result<usize, TransformError> {
    let mut units = 0;
    for (byte, ch) in text.char_indices() {
        if units == offset {
            return Ok(byte);
        }
        units += ch.len_utf16();
        if units > offset {
            return Err(TransformError::OffsetOutOfRange);
        }
    }
    if units == offset {
        Ok(text.len())
    } else {
        Err(TransformError::OffsetOutOfRange)
    }
}

fn content_rule(block_type: &str, schema: Option<&Schema>) -> Option<ContentRule> {
    if let Some(schema) = schema {
        schema
            .nodes
            .get(block_type)
            .map(|spec| spec.content.clone())
    } else {
        gotipe_schema::defaults::default_block_editor()
            .nodes
            .get(block_type)
            .map(|spec| spec.content.clone())
    }
}

fn convert_content(block: &mut Block, rule: &ContentRule) {
    block.content = match (
        rule,
        std::mem::replace(&mut block.content, BlockContent::Empty),
    ) {
        (ContentRule::Empty, _) => BlockContent::Empty,
        (ContentRule::RawText, BlockContent::RichText(spans)) => {
            BlockContent::Raw(spans.into_iter().map(|span| span.text).collect())
        }
        (ContentRule::RawText, BlockContent::Empty) => BlockContent::Raw(String::new()),
        (ContentRule::RichText, BlockContent::Raw(text)) => {
            BlockContent::RichText(if text.is_empty() {
                vec![]
            } else {
                vec![TextSpan {
                    text,
                    marks: vec![],
                }]
            })
        }
        (ContentRule::RichText, BlockContent::Empty) => BlockContent::RichText(vec![]),
        (_, content) => content,
    };
}

fn promote_empty_content(block: &mut Block, schema: Option<&Schema>) {
    if matches!(block.content, BlockContent::Empty) {
        if let Some(rule) = content_rule(&block.block_type, schema) {
            convert_content(block, &rule);
        }
    }
}

fn contains_block(block: &Block, id: &BlockId) -> bool {
    block.id == *id || block.children.iter().any(|child| contains_block(child, id))
}

fn split_spans_at(
    spans: &[TextSpan],
    offset: usize,
) -> Result<(Vec<TextSpan>, Vec<TextSpan>), TransformError> {
    let mut before = Vec::new();
    let mut after = Vec::new();
    let mut position = 0;
    for span in spans {
        let end = position + span.text.encode_utf16().count();
        if end <= offset {
            before.push(span.clone());
        } else if position >= offset {
            after.push(span.clone());
        } else {
            let byte = byte_offset(&span.text, offset - position)?;
            before.push(TextSpan {
                text: span.text[..byte].into(),
                marks: span.marks.clone(),
            });
            after.push(TextSpan {
                text: span.text[byte..].into(),
                marks: span.marks.clone(),
            });
        }
        position = end;
    }
    if offset > position {
        return Err(TransformError::OffsetOutOfRange);
    }
    Ok((before, after))
}

fn insert_text_at(
    spans: &mut Vec<TextSpan>,
    offset: usize,
    text: &str,
    marks: &[Mark],
) -> Result<(), TransformError> {
    let (mut before, after) = split_spans_at(spans, offset)?;
    before.push(TextSpan {
        text: text.into(),
        marks: marks.to_vec(),
    });
    before.extend(after);
    normalize_spans(&mut before);
    *spans = before;
    Ok(())
}

fn delete_text_range(
    spans: &mut Vec<TextSpan>,
    from: usize,
    to: usize,
) -> Result<(), TransformError> {
    if from > to {
        return Err(TransformError::OffsetOutOfRange);
    }
    let (mut before, rest) = split_spans_at(spans, from)?;
    let (_, after) = split_spans_at(&rest, to - from)?;
    before.extend(after);
    normalize_spans(&mut before);
    *spans = before;
    Ok(())
}

fn map_marks_in_range(
    spans: &mut Vec<TextSpan>,
    from: usize,
    to: usize,
    mut map: impl FnMut(&mut Vec<Mark>),
) -> Result<(), TransformError> {
    if from > to {
        return Err(TransformError::OffsetOutOfRange);
    }
    let (mut before, rest) = split_spans_at(spans, from)?;
    let (mut middle, after) = split_spans_at(&rest, to - from)?;
    for span in &mut middle {
        map(&mut span.marks);
    }
    before.extend(middle);
    before.extend(after);
    normalize_spans(&mut before);
    *spans = before;
    Ok(())
}

fn remove_mark_from_range(
    spans: &mut Vec<TextSpan>,
    from: usize,
    to: usize,
    mark_type: &str,
) -> Result<(), TransformError> {
    map_marks_in_range(spans, from, to, |marks| {
        marks.retain(|mark| mark.mark_type != mark_type)
    })
}

/// Helper: split a block at a text offset, creating a new block after it
fn split_block_at(
    doc: &mut Document,
    block_id: &BlockId,
    offset: usize,
    schema: Option<&Schema>,
) -> Result<(), TransformError> {
    let (parent_id, index) = doc
        .parent_and_index(block_id)
        .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
    let block = doc
        .find_block_mut(block_id)
        .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
    promote_empty_content(block, schema);
    let new_content = match &mut block.content {
        BlockContent::RichText(spans) => {
            let (before, after) = split_spans_at(spans, offset)?;
            *spans = before;
            BlockContent::RichText(after)
        }
        BlockContent::Raw(raw) => {
            let byte = byte_offset(raw, offset)?;
            BlockContent::Raw(raw.split_off(byte))
        }
        BlockContent::Empty => return Err(TransformError::InvalidContentType),
    };
    let is_heading = block.block_type == "heading";
    let new_block = Block {
        id: BlockId::new(),
        block_type: if is_heading {
            "paragraph".into()
        } else {
            block.block_type.clone()
        },
        attrs: if is_heading {
            Default::default()
        } else {
            block.attrs.clone()
        },
        content: new_content,
        children: Vec::new(),
    };
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
    schema: Option<&Schema>,
) -> Result<(), TransformError> {
    let source = doc
        .find_block(source_id)
        .ok_or(TransformError::BlockNotFound(source_id.clone()))?;
    let target = doc
        .find_block(target_id)
        .ok_or(TransformError::BlockNotFound(target_id.clone()))?;
    if contains_block(source, target_id) || contains_block(target, source_id) {
        return Err(TransformError::CycleDetected);
    }
    let mut source = doc
        .remove_block(source_id)
        .ok_or(TransformError::BlockNotFound(source_id.clone()))?;

    let target = doc
        .find_block_mut(target_id)
        .ok_or(TransformError::BlockNotFound(target_id.clone()))?;

    promote_empty_content(&mut source, schema);
    promote_empty_content(target, schema);
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

    target.children.extend(source.children);
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
mod mark_tests;
#[cfg(test)]
mod tests;
