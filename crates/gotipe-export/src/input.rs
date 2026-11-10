use crate::ConvertError;
use gotipe_core::Document;
use serde_json::{json, Value};

/// Accept both the public JS document and Rust's tagged representation.
pub fn document_from_json(input: &str) -> Result<Document, ConvertError> {
    let mut value: Value =
        serde_json::from_str(input).map_err(|e| ConvertError::ParseError(e.to_string()))?;
    normalize_document(&mut value)?;
    serde_json::from_value(value).map_err(|e| ConvertError::ParseError(e.to_string()))
}
fn normalize_document(doc: &mut Value) -> Result<(), ConvertError> {
    let object = doc
        .as_object_mut()
        .ok_or_else(|| ConvertError::ParseError("document must be an object".into()))?;
    object.entry("version").or_insert(json!(0));
    let blocks = object
        .get_mut("blocks")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| ConvertError::ParseError("blocks must be an array".into()))?;
    for block in blocks {
        normalize_block(block, 0)?
    }
    Ok(())
}
fn normalize_block(value: &mut Value, depth: usize) -> Result<(), ConvertError> {
    if depth > 128 {
        return Err(ConvertError::ParseError(
            "document is too deeply nested".into(),
        ));
    }
    let block = value
        .as_object_mut()
        .ok_or_else(|| ConvertError::ParseError("block must be an object".into()))?;
    if let Some(kind) = block.remove("type") {
        block.entry("block_type").or_insert(kind);
    }
    block.entry("attrs").or_insert(json!({}));
    let content = block.entry("content").or_insert(json!({"type":"Empty"}));
    if content.is_array() {
        *content = json!({"type":"RichText","value":content.take()})
    } else if content.is_string() {
        *content = json!({"type":"Raw","value":content.take()})
    } else if content.is_null() {
        *content = json!({"type":"Empty"})
    }
    if content.get("type").and_then(Value::as_str) == Some("RichText") {
        let spans = content
            .get_mut("value")
            .and_then(Value::as_array_mut)
            .ok_or_else(|| ConvertError::ParseError("rich text must contain spans".into()))?;
        for span in spans {
            let span = span
                .as_object_mut()
                .ok_or_else(|| ConvertError::ParseError("span must be an object".into()))?;
            let marks = span
                .entry("marks")
                .or_insert(json!([]))
                .as_array_mut()
                .ok_or_else(|| ConvertError::ParseError("marks must be an array".into()))?;
            for mark in marks {
                let mark = mark
                    .as_object_mut()
                    .ok_or_else(|| ConvertError::ParseError("mark must be an object".into()))?;
                if let Some(kind) = mark.remove("type") {
                    mark.entry("mark_type").or_insert(kind);
                }
                mark.entry("attrs").or_insert(json!({}));
            }
        }
    }
    let children = block
        .entry("children")
        .or_insert(json!([]))
        .as_array_mut()
        .ok_or_else(|| ConvertError::ParseError("children must be an array".into()))?;
    for child in children {
        normalize_block(child, depth + 1)?
    }
    Ok(())
}

pub fn public_document(doc: &Document) -> Value {
    fn convert(block: &mut Value) {
        if let Some(object) = block.as_object_mut() {
            if let Some(kind) = object.remove("block_type") {
                object.insert("type".into(), kind);
            }
            if let Some(content) = object.get_mut("content") {
                let kind = content
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or("Empty")
                    .to_owned();
                *content = if kind == "Empty" {
                    Value::Null
                } else {
                    content
                        .get_mut("value")
                        .map(Value::take)
                        .unwrap_or(Value::Null)
                };
                if let Some(spans) = content.as_array_mut() {
                    for span in spans {
                        if let Some(marks) = span.get_mut("marks").and_then(Value::as_array_mut) {
                            for mark in marks {
                                if let Some(mark) = mark.as_object_mut() {
                                    if let Some(kind) = mark.remove("mark_type") {
                                        mark.insert("type".into(), kind);
                                    }
                                    if mark
                                        .get("attrs")
                                        .and_then(Value::as_object)
                                        .is_some_and(|attrs| attrs.is_empty())
                                    {
                                        mark.remove("attrs");
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if let Some(children) = object.get_mut("children").and_then(Value::as_array_mut) {
                for child in children {
                    convert(child)
                }
            }
        }
    }
    let mut value = serde_json::to_value(doc).expect("Document has only serializable JSON fields");
    if let Some(blocks) = value.get_mut("blocks").and_then(Value::as_array_mut) {
        for block in blocks {
            convert(block)
        }
    }
    value
}
