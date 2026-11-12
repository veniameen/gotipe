//! Reject unsupported document shapes before layout can discard their data.
use crate::ConvertError;
use gotipe_core::Document;

pub(crate) fn document(doc: &Document) -> Result<(), ConvertError> {
    let mut pending: Vec<_> = doc.blocks.iter().map(|block| (block, 0)).collect();
    let mut count = 0;
    while let Some((block, depth)) = pending.pop() {
        count += 1;
        if depth > 64 || count > 100_000 {
            return Err(ConvertError::Encoding(
                "PDF document complexity limit exceeded".into(),
            ));
        }
        let kind = block.block_type.as_str();
        if ![
            "paragraph",
            "heading",
            "bulletList",
            "orderedList",
            "todoList",
            "listItem",
            "todoItem",
            "table",
            "tableRow",
            "tableCell",
            "tableHeader",
            "codeBlock",
            "blockquote",
            "divider",
            "image",
            "toggle",
            "callout",
            "columns",
            "column",
            "math",
            "markdownRaw",
            "file",
            "embed",
        ]
        .contains(&kind)
        {
            return Err(ConvertError::UnsupportedBlockType(block.block_type.clone()));
        }
        if matches!(kind, "codeBlock" | "image" | "divider" | "file" | "embed")
            && !block.children.is_empty()
        {
            return Err(ConvertError::Encoding(format!(
                "PDF {kind} cannot contain child blocks"
            )));
        }
        if matches!(
            kind,
            "bulletList"
                | "orderedList"
                | "todoList"
                | "table"
                | "tableRow"
                | "columns"
                | "image"
                | "divider"
                | "file"
                | "embed"
        ) && !block.is_empty()
        {
            return Err(ConvertError::Encoding(format!(
                "PDF {kind} cannot contain its own text content"
            )));
        }
        pending.extend(block.children.iter().map(|child| (child, depth + 1)));
    }
    crate::document_checks::validate_marks(&doc.blocks)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::document_from_json;
    use serde_json::{json, Value};

    fn check(block: Value) -> Result<(), ConvertError> {
        document(&document_from_json(&json!({ "blocks": [block] }).to_string()).unwrap())
    }

    #[test]
    fn leaves_reject_known_children_instead_of_silently_losing_them() {
        for kind in ["codeBlock", "image", "divider", "file", "embed"] {
            let block = json!({
                "id": "leaf", "type": kind,
                "children": [{ "id": "child", "type": "paragraph", "content": "Keep me" }]
            });
            let message = check(block).unwrap_err().to_string();
            assert!(message.contains("child blocks"), "{kind}: {message}");
        }
    }

    #[test]
    fn non_text_blocks_reject_raw_and_rich_content_including_whitespace() {
        for kind in [
            "bulletList",
            "orderedList",
            "todoList",
            "table",
            "tableRow",
            "columns",
            "image",
            "divider",
            "file",
            "embed",
        ] {
            for content in [json!("Keep me"), json!([{ "text": "Keep me" }]), json!(" ")] {
                let message = check(json!({"id": "block", "type": kind, "content": content}))
                    .unwrap_err()
                    .to_string();
                assert!(message.contains("own text content"), "{kind}: {message}");
            }
        }
    }

    #[test]
    fn empty_content_encodings_remain_valid_for_structural_blocks() {
        for content in [Value::Null, json!(""), json!([]), json!([{ "text": "" }])] {
            check(json!({"id": "table", "type": "table", "content": content})).unwrap();
        }
    }

    #[test]
    fn supported_nested_text_and_container_shapes_are_preserved() {
        for kind in [
            "paragraph",
            "heading",
            "listItem",
            "todoItem",
            "tableCell",
            "tableHeader",
            "blockquote",
            "callout",
            "toggle",
            "column",
            "math",
            "markdownRaw",
        ] {
            check(json!({
                "id": "container", "type": kind, "content": [{"text": "Own text"}],
                "children": [{"id": "nested", "type": "paragraph", "content": "Nested text"}]
            }))
            .unwrap();
        }
        check(json!({
            "id": "columns", "type": "columns", "children": [{
                "id": "column", "type": "column", "children": [{
                    "id": "image", "type": "image", "attrs": {"caption": "Caption", "alt": "Alt"}
                }]
            }]
        }))
        .unwrap();
    }

    #[test]
    fn nested_unknown_blocks_and_marks_still_fail_before_layout() {
        assert!(matches!(
            check(json!({
                "id": "parent", "type": "callout", "children": [{"id": "child", "type": "custom"}]
            })),
            Err(ConvertError::UnsupportedBlockType(_))
        ));
        assert!(matches!(
            check(json!({
                "id": "paragraph", "type": "paragraph",
                "content": [{"text": "Keep me", "marks": [{"type": "custom"}]}]
            })),
            Err(ConvertError::UnsupportedMark(_))
        ));
    }
}
