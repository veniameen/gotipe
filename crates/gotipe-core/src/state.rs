use gotipe_schema::{Document, Schema};

use crate::selection::Selection;
use crate::transaction::{Step, Transaction, TransformError};

/// EditorState is immutable — apply(Transaction) returns a new EditorState.
#[derive(Debug, Clone)]
pub struct EditorState {
    doc: Document,
    selection: Selection,
    schema: Schema,
    last_steps: Vec<Step>,
}

impl EditorState {
    pub fn new(doc: Document, schema: Schema) -> Self {
        let selection = if let Some(first_block) = doc.blocks.first() {
            Selection::Cursor {
                block_id: first_block.id.clone(),
                offset: 0,
            }
        } else {
            Selection::default()
        };

        EditorState {
            doc,
            selection,
            schema,
            last_steps: Vec::new(),
        }
    }

    pub fn with_selection(mut self, selection: Selection) -> Self {
        self.selection = selection;
        self
    }

    /// Set an explicit selection without changing document or transaction history.
    /// A text point inside an inline atom moves to the atom's edge in the direction of
    /// movement from the current selection.
    pub fn with_valid_selection(mut self, selection: Selection) -> Result<Self, TransformError> {
        crate::selection_mapping::validate(&selection, &self.doc)?;
        self.selection =
            crate::atoms::snap_selection(selection, Some(&self.selection), &self.doc, &self.schema);
        Ok(self)
    }

    /// Apply a transaction to produce a new EditorState.
    /// Validate and apply each step against the staged document, then map selection.
    pub fn apply(&self, tr: Transaction) -> Result<EditorState, TransformError> {
        self.apply_inner(tr, false).map(|(state, _)| state)
    }

    /// Validated intermediate documents retain generated structural identities for
    /// collaboration. No intermediate result escapes a failed transaction.
    pub fn apply_with_trace(
        &self,
        tr: Transaction,
    ) -> Result<(EditorState, Vec<Document>), TransformError> {
        self.apply_inner(tr, true)
    }

    fn apply_inner(
        &self,
        tr: Transaction,
        capture: bool,
    ) -> Result<(EditorState, Vec<Document>), TransformError> {
        if self.doc.duplicate_block_id().is_some() {
            return Err(TransformError::InvalidStep("Duplicate block ID".into()));
        }
        let mut doc = self.doc.clone();
        let mut selection = self.selection.clone();
        let mut trace = Vec::new();
        let mut steps = Vec::with_capacity(tr.steps.len());

        // Later steps can refer to blocks inserted or converted earlier in this transaction.
        // Nothing is committed to the original state if any step fails. A step that touches
        // an inline atom is applied, mapped and recorded as it acts: on whole atoms.
        for step in &tr.steps {
            self.validate_step(step, &doc)?;
            let step = crate::atoms::normalize_step(step, &doc, &self.schema);
            let mapping = crate::selection_mapping::SelectionMap::new(&selection, &step, &doc);
            doc = step.apply_with_schema(doc, Some(&self.schema))?;
            selection = mapping.finish(&step, &doc);
            if capture {
                trace.push(doc.clone());
            }
            steps.push(step);
        }

        // The complete staged document must satisfy the declared schema, even when
        // several individually valid steps alter structural or attribute constraints.
        if !self.schema.nodes.is_empty() || !self.schema.marks.is_empty() {
            self.schema.validate(&doc).map_err(|errors| {
                TransformError::InvalidStep(format!("Schema validation failed: {errors:?}"))
            })?;
        }

        // 3) Map selection through the steps
        if let Some(explicit) = tr.selection {
            crate::selection_mapping::validate(&explicit, &doc)?;
            selection =
                crate::atoms::snap_selection(explicit, Some(&selection), &doc, &self.schema);
        }

        Ok((
            EditorState {
                doc,
                selection,
                schema: self.schema.clone(),
                last_steps: steps,
            },
            trace,
        ))
    }

    fn validate_step(&self, step: &Step, doc: &Document) -> Result<(), TransformError> {
        if self.schema.nodes.is_empty() && self.schema.marks.is_empty() {
            return Ok(());
        }
        match step {
            Step::InsertBlock { block, .. } => {
                if !self.schema.nodes.contains_key(&block.block_type) {
                    return Err(TransformError::InvalidStep(format!(
                        "Unknown block type: {}",
                        block.block_type
                    )));
                }
                Ok(())
            }
            Step::AddMark { mark, block_id, .. } => {
                let block = doc
                    .find_block(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
                self.schema.validate_mark(block, mark).map_err(|errors| {
                    TransformError::InvalidStep(format!("Schema validation failed: {errors:?}"))
                })
            }
            Step::InsertText {
                block_id, marks, ..
            } => {
                let block = doc
                    .find_block(block_id)
                    .ok_or(TransformError::BlockNotFound(block_id.clone()))?;
                for mark in marks {
                    self.schema.validate_mark(block, mark).map_err(|errors| {
                        TransformError::InvalidStep(format!("Schema validation failed: {errors:?}"))
                    })?;
                }
                Ok(())
            }
            Step::SetBlockType { new_type, .. } => {
                if !self.schema.nodes.contains_key(new_type) {
                    return Err(TransformError::InvalidStep(format!(
                        "Unknown block type: {}",
                        new_type
                    )));
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }

    pub fn doc(&self) -> &Document {
        &self.doc
    }

    pub fn selection(&self) -> &Selection {
        &self.selection
    }

    pub fn schema(&self) -> &Schema {
        &self.schema
    }

    pub fn last_steps(&self) -> &[Step] {
        &self.last_steps
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gotipe_schema::{Block, BlockContent, BlockId, Mark, TextSpan};
    use std::collections::HashMap;

    fn test_state() -> EditorState {
        let schema = gotipe_schema::defaults::default_block_editor();
        let doc = Document {
            blocks: vec![Block {
                id: BlockId("b1".into()),
                block_type: "paragraph".into(),
                attrs: HashMap::new(),
                content: BlockContent::RichText(vec![TextSpan {
                    text: "Hello World".into(),
                    marks: vec![],
                }]),
                children: vec![],
            }],
            version: 0,
        };
        EditorState::new(doc, schema)
    }

    #[test]
    fn test_apply_insert_text() {
        let state = test_state();
        let tr = Transaction::new().with_step(Step::InsertText {
            block_id: BlockId("b1".into()),
            offset: 5,
            text: "!".into(),
            marks: vec![],
        });
        let new_state = state.apply(tr).unwrap();
        assert_eq!(new_state.doc().blocks[0].text_length(), 12);
    }

    #[test]
    fn test_apply_preserves_schema() {
        let state = test_state();
        let tr = Transaction::new().with_step(Step::InsertText {
            block_id: BlockId("b1".into()),
            offset: 0,
            text: "X".into(),
            marks: vec![],
        });
        let new_state = state.apply(tr).unwrap();
        assert_eq!(new_state.schema().nodes.len(), state.schema().nodes.len());
    }

    #[test]
    fn test_apply_validates_mark_on_code_block() {
        let schema = gotipe_schema::defaults::default_block_editor();
        let doc = Document {
            blocks: vec![Block {
                id: BlockId("code1".into()),
                block_type: "codeBlock".into(),
                attrs: HashMap::from([(
                    "language".into(),
                    gotipe_schema::AttrValue::String("rust".into()),
                )]),
                content: BlockContent::Raw("fn main() {}".into()),
                children: vec![],
            }],
            version: 0,
        };
        let state = EditorState::new(doc, schema);

        // Trying to add bold mark to a codeBlock should fail
        let tr = Transaction::new().with_step(Step::AddMark {
            block_id: BlockId("code1".into()),
            from: 0,
            to: 5,
            mark: Mark::new("bold"),
        });
        assert!(state.apply(tr).is_err());
    }

    #[test]
    fn test_selection_maps_through_steps() {
        let state = test_state().with_selection(Selection::Cursor {
            block_id: BlockId("b1".into()),
            offset: 5,
        });

        let tr = Transaction::new().with_step(Step::InsertText {
            block_id: BlockId("b1".into()),
            offset: 2,
            text: "XY".into(),
            marks: vec![],
        });

        let new_state = state.apply(tr).unwrap();
        if let Selection::Cursor { offset, .. } = new_state.selection() {
            assert_eq!(*offset, 7); // 5 + 2 inserted
        } else {
            panic!("Expected Cursor selection");
        }
    }
}
