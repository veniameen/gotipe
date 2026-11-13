use crate::ConvertError;
use gotipe_core::Document;
use serde_json::{json, Value};
use std::collections::HashSet;

/// Accept both the public JS document and Rust's tagged representation. Like
/// `decodeDocument` in @gotipe/core, block IDs and type names must be non-empty and IDs unique.
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
    let mut ids = HashSet::new();
    for block in blocks {
        normalize_block(block, 0, &mut ids)?
    }
    Ok(())
}
fn non_empty<'a>(value: Option<&'a Value>, label: &str) -> Result<&'a str, ConvertError> {
    value
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ConvertError::ParseError(format!("{label} must be a non-empty string")))
}
fn normalize_block(
    value: &mut Value,
    depth: usize,
    ids: &mut HashSet<String>,
) -> Result<(), ConvertError> {
    if depth > 128 {
        return Err(ConvertError::ParseError(
            "document is too deeply nested".into(),
        ));
    }
    let block = value
        .as_object_mut()
        .ok_or_else(|| ConvertError::ParseError("block must be an object".into()))?;
    let id = non_empty(block.get("id"), "Block ID")?;
    if !ids.insert(id.to_owned()) {
        return Err(ConvertError::ParseError(format!(
            "Duplicate block ID: {id}"
        )));
    }
    if let Some(kind) = block.remove("type") {
        block.entry("block_type").or_insert(kind);
    }
    non_empty(block.get("block_type"), "Block type")?;
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
                non_empty(mark.get("mark_type"), "Mark type")?;
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
        normalize_block(child, depth + 1, ids)?
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_what_the_editor_document_decoder_rejects() {
        for (input, message) in [
            (
                r#"{"blocks":[{"id":"","type":"paragraph"}]}"#,
                "Block ID must be a non-empty string",
            ),
            (
                r#"{"blocks":[{"type":"paragraph"}]}"#,
                "Block ID must be a non-empty string",
            ),
            (
                r#"{"blocks":[{"id":"a","type":""}]}"#,
                "Block type must be a non-empty string",
            ),
            (
                r#"{"blocks":[{"id":"a"}]}"#,
                "Block type must be a non-empty string",
            ),
            (
                r#"{"blocks":[{"id":"a","type":"paragraph","children":[{"id":"a","type":"paragraph"}]}]}"#,
                "Duplicate block ID: a",
            ),
            (
                r#"{"blocks":[{"id":"a","type":"paragraph","content":[{"text":"x","marks":[{"type":""}]}]}]}"#,
                "Mark type must be a non-empty string",
            ),
        ] {
            let error = document_from_json(input).unwrap_err().to_string();
            assert!(error.contains(message), "{input}: {error}");
        }
        assert!(document_from_json(
            r#"{"blocks":[{"id":"a","block_type":"paragraph","children":[{"id":"b","type":"paragraph"}]}]}"#
        )
        .is_ok());
    }
}
