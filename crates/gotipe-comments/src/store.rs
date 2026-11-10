//! Review state and proposal application, independent of WASM or UI transport.
use crate::{Comment, CommentAnchor, Suggestion, SuggestionType};
use gotipe_core::{BlockContent, Document, EditorState, Step, Transaction};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Proposal {
    pub suggestion: Suggestion,
    pub transaction: Transaction,
    pub base: Document,
}
#[derive(Debug, Clone, Default)]
pub struct ReviewStore {
    pub comments: BTreeMap<String, Comment>,
    pub proposals: BTreeMap<String, Proposal>,
}
impl ReviewStore {
    pub fn add_comment(&mut self, comment: Comment, doc: &Document) -> Result<String, String> {
        if self.comments.contains_key(&comment.id.0) {
            return Err("Comment ID already exists".into());
        }
        validate_anchor(&comment.anchor, doc)?;
        if let Some(parent) = &comment.parent_id {
            if !self.comments.contains_key(&parent.0) {
                return Err("Parent comment not found".into());
            }
        }
        let id = comment.id.0.clone();
        self.comments.insert(id.clone(), comment);
        Ok(id)
    }
    pub fn resolve(&mut self, id: &str, author: &str) -> Result<(), String> {
        self.comments
            .get_mut(id)
            .ok_or("Comment not found")?
            .resolve(author);
        Ok(())
    }
    pub fn reopen(&mut self, id: &str) -> Result<(), String> {
        self.comments
            .get_mut(id)
            .ok_or("Comment not found")?
            .reopen();
        Ok(())
    }
    pub fn propose(
        &mut self,
        state: &EditorState,
        transaction: Transaction,
    ) -> Result<String, String> {
        if transaction.steps.is_empty() {
            return Err("A proposal must contain a change".into());
        }
        state
            .apply(transaction.clone())
            .map_err(|e| e.to_string())?;
        let (kind, anchor) = proposal_kind(&transaction.steps[0]);
        let suggestion = Suggestion::new("local", kind, anchor);
        let id = suggestion.id.0.clone();
        self.proposals.insert(
            id.clone(),
            Proposal {
                suggestion,
                transaction,
                base: state.doc().clone(),
            },
        );
        Ok(id)
    }
    pub fn accept(&mut self, id: &str, state: &EditorState) -> Result<EditorState, String> {
        self.accept_with_trace(id, state).map(|(state, _)| state)
    }
    pub fn accept_with_trace(
        &mut self,
        id: &str,
        state: &EditorState,
    ) -> Result<(EditorState, Vec<Document>), String> {
        let proposal = self.proposals.get(id).ok_or("Suggestion not found")?;
        if !proposal.suggestion.is_pending() {
            return Err("Suggestion has already been decided".into());
        }
        if serde_json::to_value(&proposal.base.blocks).map_err(|e| e.to_string())?
            != serde_json::to_value(&state.doc().blocks).map_err(|e| e.to_string())?
        {
            return Err("Suggestion is stale because the document changed".into());
        }
        let next = state
            .apply_with_trace(proposal.transaction.clone())
            .map_err(|e| e.to_string())?;
        self.proposals.get_mut(id).unwrap().suggestion.accept();
        Ok(next)
    }
    pub fn reject(&mut self, id: &str) -> Result<(), String> {
        let proposal = self.proposals.get_mut(id).ok_or("Suggestion not found")?;
        if !proposal.suggestion.is_pending() {
            return Err("Suggestion has already been decided".into());
        }
        proposal.suggestion.reject();
        Ok(())
    }
}
fn proposal_kind(step: &Step) -> (SuggestionType, CommentAnchor) {
    match step {
        Step::InsertText {
            block_id, offset, ..
        } => (
            SuggestionType::Insert,
            CommentAnchor::Inline {
                block_id: block_id.clone(),
                from: *offset,
                to: *offset,
            },
        ),
        Step::DeleteText { block_id, from, to } => (
            SuggestionType::Delete,
            CommentAnchor::Inline {
                block_id: block_id.clone(),
                from: *from,
                to: *to,
            },
        ),
        Step::AddMark {
            block_id,
            from,
            to,
            mark,
        } => (
            SuggestionType::Format {
                old_marks: vec![],
                new_marks: vec![mark.clone()],
            },
            CommentAnchor::Inline {
                block_id: block_id.clone(),
                from: *from,
                to: *to,
            },
        ),
        _ => (SuggestionType::Replace, CommentAnchor::Document),
    }
}
pub fn validate_anchor(anchor: &CommentAnchor, doc: &Document) -> Result<(), String> {
    let (id, range) = match anchor {
        CommentAnchor::Document => return Ok(()),
        CommentAnchor::Range {
            from_block_id,
            from_offset,
            to_block_id,
            to_offset,
        } => {
            validate_anchor(
                &CommentAnchor::Inline {
                    block_id: from_block_id.clone(),
                    from: *from_offset,
                    to: *from_offset,
                },
                doc,
            )?;
            return validate_anchor(
                &CommentAnchor::Inline {
                    block_id: to_block_id.clone(),
                    from: *to_offset,
                    to: *to_offset,
                },
                doc,
            );
        }
        CommentAnchor::Block { block_id } => (block_id, None),
        CommentAnchor::Inline { block_id, from, to } => (block_id, Some((*from, *to))),
    };
    let block = doc.find_block(id).ok_or("Comment block not found")?;
    if let Some((from, to)) = range {
        let text: String = match &block.content {
            BlockContent::RichText(spans) => spans.iter().map(|s| s.text.as_str()).collect(),
            BlockContent::Raw(text) => text.clone(),
            BlockContent::Empty => String::new(),
        };
        let boundaries: Vec<_> = std::iter::once(0)
            .chain(text.chars().scan(0, |units, ch| {
                *units += ch.len_utf16();
                Some(*units)
            }))
            .collect();
        if from > to || !boundaries.contains(&from) || !boundaries.contains(&to) {
            return Err("Invalid UTF-16 comment range".into());
        }
    }
    Ok(())
}
