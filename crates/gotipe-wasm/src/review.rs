use crate::WasmEditor;
use gotipe_comments::{
    store::{Proposal, ReviewStore},
    Comment,
};
use gotipe_crdt::CrdtDocument;
use wasm_bindgen::prelude::*;

pub(crate) fn replicate_review(
    replica: Option<&CrdtDocument>,
    review: &ReviewStore,
) -> Result<Option<CrdtDocument>, JsError> {
    let Some(mut crdt) = replica.cloned() else {
        return Ok(None);
    };
    for (key, comment) in &review.comments {
        let value = serde_json::to_string(comment).map_err(|e| JsError::new(&e.to_string()))?;
        if crdt.data("comments").and_then(|data| data.get(key)) != Some(&value) {
            crdt.try_set_data("comments", key, Some(value))
                .map_err(|e| JsError::new(&e.to_string()))?;
        }
    }
    for (key, proposal) in &review.proposals {
        let value = serde_json::to_string(proposal).map_err(|e| JsError::new(&e.to_string()))?;
        if crdt.data("suggestions").and_then(|data| data.get(key)) != Some(&value) {
            crdt.try_set_data("suggestions", key, Some(value))
                .map_err(|e| JsError::new(&e.to_string()))?;
        }
    }
    Ok(Some(crdt))
}
pub(crate) fn read_review(crdt: &CrdtDocument) -> Result<ReviewStore, JsError> {
    let mut review = ReviewStore::default();
    if let Some(data) = crdt.data("comments") {
        for (key, value) in data {
            let comment: Comment = serde_json::from_str(value)
                .map_err(|e| JsError::new(&format!("Invalid replicated comment: {e}")))?;
            if comment.id.0 != *key {
                return Err(JsError::new("Replicated comment identity mismatch"));
            }
            review.comments.insert(key.clone(), comment);
        }
    }
    if let Some(data) = crdt.data("suggestions") {
        for (key, value) in data {
            let proposal: Proposal = serde_json::from_str(value)
                .map_err(|e| JsError::new(&format!("Invalid replicated suggestion: {e}")))?;
            if proposal.suggestion.id.0 != *key {
                return Err(JsError::new("Replicated suggestion identity mismatch"));
            }
            review.proposals.insert(key.clone(), proposal);
        }
    }
    Ok(review)
}

#[wasm_bindgen]
impl WasmEditor {
    /// Add a comment or reply, validating its identity and UTF-16 anchor.
    pub fn add_comment(&mut self, comment_json: &str) -> Result<String, JsError> {
        let mut comment: Comment = serde_json::from_str(comment_json)
            .map_err(|e| JsError::new(&format!("Invalid comment JSON: {e}")))?;
        gotipe_comments::store::validate_anchor(&comment.anchor, self.state.doc())
            .map_err(|e| JsError::new(&e))?;
        let crdt = self
            .crdt
            .clone()
            .unwrap_or_else(|| CrdtDocument::new("local-review", self.state.doc()));
        crate::review_anchors::attach(&mut comment, &crdt)?;
        let mut review = self.review.clone();
        let id = review
            .add_comment(comment, self.state.doc())
            .map_err(|e| JsError::new(&e))?;
        let crdt = replicate_review(Some(&crdt), &review)?;
        self.review = review;
        self.crdt = crdt;
        Ok(id)
    }
    pub fn resolve_comment(&mut self, comment_id: &str) -> Result<(), JsError> {
        let mut review = self.review.clone();
        review
            .resolve(comment_id, "local")
            .map_err(|e| JsError::new(&e))?;
        let crdt = replicate_review(self.crdt.as_ref(), &review)?;
        self.review = review;
        self.crdt = crdt;
        Ok(())
    }
    pub fn reopen_comment(&mut self, comment_id: &str) -> Result<(), JsError> {
        let mut review = self.review.clone();
        review.reopen(comment_id).map_err(|e| JsError::new(&e))?;
        let crdt = replicate_review(self.crdt.as_ref(), &review)?;
        self.review = review;
        self.crdt = crdt;
        Ok(())
    }
    pub fn get_comments(&self) -> Result<String, JsError> {
        let comments: Vec<_> = self
            .review
            .comments
            .values()
            .map(|comment| {
                self.crdt
                    .as_ref()
                    .map(|crdt| crate::review_anchors::resolve(comment, crdt))
                    .unwrap_or_else(|| comment.clone())
            })
            .collect();
        serde_json::to_string(&comments).map_err(|e| JsError::new(&e.to_string()))
    }
    /// In suggestion mode, transactions become reviewable proposals; acceptance
    /// applies a proposal atomically, and stale proposals return an explicit error.
    pub fn set_suggestion_mode(&mut self, enabled: bool) {
        self.suggestion_mode = enabled;
    }
    pub fn get_suggestions(&self) -> Result<String, JsError> {
        serde_json::to_string(&self.review.proposals.values().collect::<Vec<_>>())
            .map_err(|e| JsError::new(&e.to_string()))
    }
    pub fn accept_suggestion(&mut self, suggestion_id: &str) -> Result<String, JsError> {
        let mut review = self.review.clone();
        let (next, trace) = review
            .accept_with_trace(suggestion_id, &self.state)
            .map_err(|e| JsError::new(&e))?;
        let mut crdt = self.crdt.clone();
        if let Some(replica) = &mut crdt {
            let before_selection =
                gotipe_crdt::selection::SelectionBookmark::capture(replica, self.state.selection());
            let mut operations = Vec::new();
            for (step, document) in next.last_steps().iter().zip(&trace) {
                operations.extend(
                    replica
                        .apply_local_steps_result(std::slice::from_ref(step), document)
                        .map_err(|e| JsError::new(&e.to_string()))?,
                );
            }
            if self.collaboration_enabled {
                replica.history_mut().end_group();
                let after_selection =
                    gotipe_crdt::selection::SelectionBookmark::capture(replica, next.selection());
                replica.history_mut().record_bookmarked(
                    operations,
                    before_selection,
                    after_selection,
                    crate::history::now_ms(),
                );
            }
        }
        let crdt = replicate_review(crdt.as_ref(), &review)?;
        self.state = next;
        self.review = review;
        self.crdt = crdt;
        Ok(self.export_json())
    }
    pub fn reject_suggestion(&mut self, suggestion_id: &str) -> Result<String, JsError> {
        let mut review = self.review.clone();
        review.reject(suggestion_id).map_err(|e| JsError::new(&e))?;
        let crdt = replicate_review(self.crdt.as_ref(), &review)?;
        self.review = review;
        self.crdt = crdt;
        Ok(self.export_json())
    }
}
