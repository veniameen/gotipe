use wasm_bindgen::prelude::*;

use gotipe_ai::PiiDetector;
use gotipe_comments::store::ReviewStore;
mod history;
mod review;
mod review_anchors;
mod updates;
use gotipe_core::{defaults, Document, EditorState, Schema, Transaction};
use gotipe_crdt::CrdtDocument;
use gotipe_versioning::manager::VersionManager;

/// Main WASM editor instance
#[wasm_bindgen]
pub struct WasmEditor {
    state: EditorState,
    schema: Schema,
    crdt: Option<CrdtDocument>,
    collaboration_enabled: bool,
    version_manager: VersionManager,
    suggestion_mode: bool,
    review: ReviewStore,
    pii_detector: PiiDetector,
}

#[wasm_bindgen]
impl WasmEditor {
    /// Create a new WasmEditor instance
    #[wasm_bindgen(constructor)]
    pub fn new(schema_json: &str, doc_json: &str) -> Result<WasmEditor, JsError> {
        let schema: Schema = serde_json::from_str(schema_json)
            .map_err(|e| JsError::new(&format!("Invalid schema JSON: {e}")))?;
        let doc: Document = serde_json::from_str(doc_json)
            .map_err(|e| JsError::new(&format!("Invalid document JSON: {e}")))?;

        if doc.duplicate_block_id().is_some() {
            return Err(JsError::new("Duplicate block ID"));
        }
        schema
            .validate(&doc)
            .map_err(|errors| JsError::new(&format!("Schema validation failed: {errors:?}")))?;
        let state = EditorState::new(doc, schema.clone());

        Ok(WasmEditor {
            state,
            schema,
            crdt: None,
            collaboration_enabled: false,
            version_manager: VersionManager::new("default"),
            suggestion_mode: false,
            review: ReviewStore::default(),
            pii_detector: PiiDetector::new(),
        })
    }

    /// Create with default schema
    #[wasm_bindgen(js_name = "withDefaultSchema")]
    pub fn with_default_schema(doc_json: &str) -> Result<WasmEditor, JsError> {
        let schema = defaults::default_block_editor();
        let schema_json = serde_json::to_string(&schema)
            .map_err(|e| JsError::new(&format!("Schema serialization failed: {e}")))?;
        WasmEditor::new(&schema_json, doc_json)
    }

    /// Apply a transaction (JSON-encoded)
    pub fn apply(&mut self, transaction_json: &str) -> Result<String, JsError> {
        let tr: Transaction = serde_json::from_str(transaction_json)
            .map_err(|e| JsError::new(&format!("Invalid transaction JSON: {e}")))?;

        if self.suggestion_mode && !tr.steps.is_empty() {
            let mut review = self.review.clone();
            review
                .propose(&self.state, tr)
                .map_err(|e| JsError::new(&e))?;
            let crdt = review::replicate_review(self.crdt.as_ref(), &review)?;
            self.review = review;
            self.crdt = crdt;
            return Ok(self.export_json());
        }

        let add_to_history = !matches!(
            tr.metadata.get("addToHistory"),
            Some(gotipe_core::AttrValue::Bool(false))
        );
        // Validate the complete transaction before publishing it to collaboration state.
        let (next_state, trace) = if self.crdt.is_some() {
            self.state.apply_with_trace(tr)
        } else {
            self.state.apply(tr).map(|state| (state, Vec::new()))
        }
        .map_err(|e| JsError::new(&format!("Transform error: {e}")))?;
        if let Some(mut crdt) = self.crdt.clone() {
            let before_selection =
                gotipe_crdt::selection::SelectionBookmark::capture(&crdt, self.state.selection());
            let mut operations = Vec::new();
            for (step, document) in next_state.last_steps().iter().zip(&trace) {
                operations.extend(
                    crdt.apply_local_steps_result(std::slice::from_ref(step), document)
                        .map_err(|e| JsError::new(&format!("CRDT error: {e}")))?,
                );
            }
            // Peers receive the whole transaction or nothing of it.
            crdt.end_transaction();
            if self.collaboration_enabled && add_to_history {
                if !history::same_typing_group(self.state.last_steps(), next_state.last_steps()) {
                    crdt.history_mut().end_group();
                }
                let after_selection = gotipe_crdt::selection::SelectionBookmark::capture(
                    &crdt,
                    next_state.selection(),
                );
                crdt.history_mut().record_bookmarked(
                    operations,
                    before_selection,
                    after_selection,
                    history::now_ms(),
                );
            }
            self.crdt = Some(crdt);
        }
        self.state = next_state;

        let doc_json = serde_json::to_string(self.state.doc())
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))?;
        Ok(doc_json)
    }

    /// Validate a document against the schema
    pub fn validate(&self, doc_json: &str) -> Result<bool, JsError> {
        let doc: Document = serde_json::from_str(doc_json)
            .map_err(|e| JsError::new(&format!("Invalid document JSON: {e}")))?;
        match self.schema.validate(&doc) {
            Ok(()) => Ok(true),
            Err(errors) => {
                let msg: Vec<String> = errors.iter().map(|e| e.to_string()).collect();
                Err(JsError::new(&msg.join("; ")))
            }
        }
    }

    // === Collaboration ===

    /// Enable collaboration with a peer ID
    pub fn enable_collaboration(&mut self, peer_id: &str) -> Result<(), JsError> {
        if self.collaboration_enabled {
            return if self
                .crdt
                .as_ref()
                .is_some_and(|crdt| crdt.peer_id() == peer_id)
            {
                Ok(())
            } else {
                Err(JsError::new(
                    "Collaboration is already enabled with another peer ID",
                ))
            };
        }
        if peer_id.trim().is_empty() || peer_id.starts_with("@base") || peer_id.len() > 256 {
            return Err(JsError::new("Invalid collaboration peer ID"));
        }
        let mut review = self.review.clone();
        if let Some(crdt) = &self.crdt {
            review.comments = review
                .comments
                .iter()
                .map(|(id, comment)| (id.clone(), review_anchors::resolve(comment, crdt)))
                .collect();
        }
        let crdt = CrdtDocument::new(peer_id, self.state.doc());
        for comment in review.comments.values_mut() {
            review_anchors::attach(comment, &crdt)?;
        }
        let crdt = review::replicate_review(Some(&crdt), &review)?;
        self.review = review;
        self.crdt = crdt;
        self.collaboration_enabled = true;
        Ok(())
    }

    /// Receive a binary CRDT update from a remote peer
    pub fn receive_update(&mut self, update: &[u8]) -> Result<String, JsError> {
        if !self.collaboration_enabled {
            return Err(JsError::new("Collaboration not enabled"));
        }
        let mut next_crdt = self
            .crdt
            .as_ref()
            .ok_or_else(|| JsError::new("Collaboration not enabled"))?
            .clone();
        let bookmark =
            gotipe_crdt::selection::SelectionBookmark::capture(&next_crdt, self.state.selection());
        let steps = next_crdt
            .apply_remote(update)
            .map_err(|e| JsError::new(&format!("CRDT error: {e}")))?;
        let tr = Transaction {
            steps,
            selection: Some(bookmark.resolve(&next_crdt)),
            metadata: std::collections::HashMap::new(),
        };
        let next_state = self
            .state
            .apply(tr)
            .map_err(|e| JsError::new(&format!("Transform error: {e}")))?;
        let review = review::read_review(&next_crdt)?;
        self.crdt = Some(next_crdt);
        self.state = next_state;
        self.review = review;

        let doc_json = serde_json::to_string(self.state.doc())
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))?;
        Ok(doc_json)
    }

    /// The full state: the baseline and every operation (`gotipe.crdt/1`).
    /// A transport sends `get_local_update_after` instead.
    pub fn get_update(&mut self) -> Result<Vec<u8>, JsError> {
        if !self.collaboration_enabled {
            return Err(JsError::new("Collaboration not enabled"));
        }
        let crdt = self
            .crdt
            .as_ref()
            .ok_or_else(|| JsError::new("Collaboration not enabled"))?;
        Ok(crdt.encode_update_since(&gotipe_crdt::VersionVector::new()))
    }

    // === Export ===
    // HTML and Markdown are serialized and HTML is sanitized by `@gotipe/core` in
    // TypeScript; `gotipe-export` serves native and server conversion.

    /// Export document as JSON
    pub fn export_json(&self) -> String {
        serde_json::to_string_pretty(self.state.doc()).unwrap_or_else(|_| "{}".into())
    }

    // === Versions ===

    /// Create a named version
    pub fn create_version(&mut self, name: &str) -> Result<String, JsError> {
        let state_vector = serde_json::to_vec(self.state.doc())
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))?;

        let version = self
            .version_manager
            .create_version(name, "local", state_vector);
        let version_json = serde_json::to_string(version)
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))?;
        Ok(version_json)
    }

    /// List all versions (JSON-encoded)
    pub fn list_versions(&self) -> Result<String, JsError> {
        let versions = self.version_manager.list_versions();
        serde_json::to_string(versions)
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
    }

    /// Restore a version
    pub fn restore_version(&mut self, version_id: &str) -> Result<String, JsError> {
        let vid = gotipe_versioning::VersionId(version_id.into());
        let state_bytes = self
            .version_manager
            .get_version(&vid)
            .ok_or_else(|| JsError::new("Version not found"))?
            .state_vector
            .clone();
        let mut doc: Document = serde_json::from_slice(&state_bytes)
            .map_err(|e| JsError::new(&format!("Failed to restore: {e}")))?;
        if doc.duplicate_block_id().is_some() {
            return Err(JsError::new("Duplicate block ID in stored version"));
        }
        self.schema
            .validate(&doc)
            .map_err(|errors| JsError::new(&format!("Schema validation failed: {errors:?}")))?;
        doc.version = self
            .state
            .doc()
            .version
            .checked_add(1)
            .ok_or_else(|| JsError::new("Document version exhausted"))?;
        let mut next_crdt = self.crdt.clone();
        if let Some(crdt) = &mut next_crdt {
            crdt.apply_local_document(&doc)
                .map_err(|e| JsError::new(&format!("CRDT error: {e}")))?;
        }
        let previous = serde_json::to_vec(self.state.doc())
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))?;
        self.version_manager.create_auto_save("local", previous);
        self.version_manager.restore_version(&vid, "local");
        self.state = EditorState::new(doc, self.schema.clone());
        self.crdt = next_crdt;

        let doc_json = serde_json::to_string(self.state.doc())
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))?;
        Ok(doc_json)
    }

    /// Compare two versions
    pub fn compare_versions(&self, from_json: &str, to_json: &str) -> Result<String, JsError> {
        let from_doc: Document = serde_json::from_str(from_json)
            .map_err(|e| JsError::new(&format!("Invalid from document: {e}")))?;
        let to_doc: Document = serde_json::from_str(to_json)
            .map_err(|e| JsError::new(&format!("Invalid to document: {e}")))?;

        let diff = self.version_manager.compare_versions(&from_doc, &to_doc);
        serde_json::to_string(&diff).map_err(|e| JsError::new(&format!("Serialization error: {e}")))
    }

    // === AI ===

    /// Detect PII in text
    pub fn detect_pii(&self, text: &str) -> Result<String, JsError> {
        let matches = self.pii_detector.detect_all(text);
        serde_json::to_string(&matches)
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
    }
}

#[cfg(test)]
mod tests;
