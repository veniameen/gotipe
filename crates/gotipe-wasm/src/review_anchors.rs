use gotipe_comments::{Comment, CommentAnchor};
use gotipe_core::AttrValue;
use gotipe_crdt::{replica::TextAnchor, CrdtDocument};
use wasm_bindgen::JsError;

const START: &str = "gotipe.anchor.start";
const END: &str = "gotipe.anchor.end";

pub(crate) fn attach(comment: &mut Comment, crdt: &CrdtDocument) -> Result<(), JsError> {
    let endpoints = match &comment.anchor {
        CommentAnchor::Inline { block_id, from, to } => Some(((block_id, *from), (block_id, *to))),
        CommentAnchor::Range {
            from_block_id,
            from_offset,
            to_block_id,
            to_offset,
        } => Some(((from_block_id, *from_offset), (to_block_id, *to_offset))),
        _ => None,
    };
    comment.metadata.remove(START);
    comment.metadata.remove(END);
    if let Some(((start_id, start), (end_id, end))) = endpoints {
        for (key, id, offset, prefer_right) in
            [(START, start_id, start, true), (END, end_id, end, false)]
        {
            let anchor = crdt
                .text_anchor(id, offset, prefer_right)
                .ok_or_else(|| JsError::new("Invalid comment anchor"))?;
            let value = serde_json::to_string(&anchor).map_err(|e| JsError::new(&e.to_string()))?;
            comment
                .metadata
                .insert(key.into(), AttrValue::String(value));
        }
    }
    Ok(())
}
pub(crate) fn resolve(comment: &Comment, crdt: &CrdtDocument) -> Comment {
    let mut comment = comment.clone();
    let endpoint = |key: &str| -> Option<_> {
        let AttrValue::String(value) = comment.metadata.get(key)? else {
            return None;
        };
        let anchor: TextAnchor = serde_json::from_str(value).ok()?;
        crdt.resolve_anchor(&anchor)
    };
    let start = endpoint(START);
    let end = endpoint(END);
    match (start, end) {
        (Some((from_block_id, from_offset)), Some((to_block_id, to_offset)))
            if from_block_id == to_block_id =>
        {
            comment.anchor = CommentAnchor::Inline {
                block_id: from_block_id,
                from: from_offset.min(to_offset),
                to: from_offset.max(to_offset),
            }
        }
        (Some((from_block_id, from_offset)), Some((to_block_id, to_offset))) => {
            comment.anchor = CommentAnchor::Range {
                from_block_id,
                from_offset,
                to_block_id,
                to_offset,
            }
        }
        _ if comment.metadata.contains_key(START) => {
            comment.anchor = CommentAnchor::Document;
            comment
                .metadata
                .insert("gotipe.anchor.orphaned".into(), AttrValue::Bool(true));
        }
        _ => {}
    }
    comment
}
