use crate::WasmEditor;
use gotipe_core::{AttrValue, EditorState};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

pub(crate) fn now_ms() -> u64 {
    #[cfg(target_arch = "wasm32")]
    {
        js_sys::Date::now() as u64
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}
/// The editor marks typing that goes on with its open typing step with `metadata.typing`:
/// `"insert"` for text typed at the caret, `"delete"` for text deleted with Backspace or Delete.
/// It decides that by one rule with and without collaboration (`typing-group.ts` in
/// `@gotipe/core`): a pause of 500 ms, a selection change, another block, a switch between
/// typing and deleting and any other change end the step. `"group"` marks a change after the
/// first one of an `editor.batch`, which is one undo step. Only a marked transaction joins the
/// undo step before it, within the history's 500 ms window; any other one starts a new step.
pub(crate) fn continues_typing(metadata: &HashMap<String, AttrValue>) -> bool {
    matches!(
        metadata.get("typing"),
        Some(AttrValue::String(kind)) if kind == "insert" || kind == "delete" || kind == "group"
    )
}
impl WasmEditor {
    fn apply_collaboration_history(&mut self, redo: bool) -> Result<Option<String>, JsError> {
        if !self.collaboration_enabled {
            return Err(JsError::new("Collaboration not enabled"));
        }
        let mut crdt = self
            .crdt
            .as_ref()
            .ok_or_else(|| JsError::new("Collaboration not enabled"))?
            .clone();
        let item = if redo {
            crdt.history_mut().redo_bookmarked()
        } else {
            crdt.history_mut().undo_bookmarked()
        };
        let Some((operations, selection)) = item else {
            return Ok(None);
        };
        crdt.apply_local_operations(&operations)
            .map_err(|e| JsError::new(&e.to_string()))?;
        crdt.history_mut().end_group();
        let doc = crdt.to_document();
        self.schema
            .validate(&doc)
            .map_err(|errors| JsError::new(&format!("Schema validation failed: {errors:?}")))?;
        let selection = selection.resolve(&crdt);
        let review = crate::review::read_review(&crdt)?;
        self.state = EditorState::new(doc, self.schema.clone()).with_selection(selection);
        self.review = review;
        self.crdt = Some(crdt);
        Ok(Some(self.export_json()))
    }
}
#[wasm_bindgen]
impl WasmEditor {
    pub fn export_selection(&self) -> Result<String, JsError> {
        serde_json::to_string(self.state.selection()).map_err(|e| JsError::new(&e.to_string()))
    }
    pub fn set_selection(&mut self, selection_json: &str) -> Result<(), JsError> {
        let selection = serde_json::from_str(selection_json)
            .map_err(|e| JsError::new(&format!("Invalid selection: {e}")))?;
        self.state = self
            .state
            .clone()
            .with_valid_selection(selection)
            .map_err(|e| JsError::new(&e.to_string()))?;
        Ok(())
    }
    pub fn undo_collaboration(&mut self) -> Result<Option<String>, JsError> {
        self.apply_collaboration_history(false)
    }
    pub fn redo_collaboration(&mut self) -> Result<Option<String>, JsError> {
        self.apply_collaboration_history(true)
    }
    pub fn clear_collaboration_history(&mut self) {
        if let Some(crdt) = &mut self.crdt {
            crdt.history_mut().clear();
        }
    }
    pub fn can_undo_collaboration(&self) -> bool {
        self.collaboration_enabled && self.crdt.as_ref().is_some_and(|c| c.history().can_undo())
    }
    pub fn can_redo_collaboration(&self) -> bool {
        self.collaboration_enabled && self.crdt.as_ref().is_some_and(|c| c.history().can_redo())
    }
}
