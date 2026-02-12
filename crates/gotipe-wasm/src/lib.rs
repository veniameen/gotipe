use wasm_bindgen::prelude::*;

use gotipe_ai::PiiDetector;
use gotipe_comments::comment::Comment;
use gotipe_core::{defaults, Document, EditorState, Schema, Transaction};
use gotipe_crdt::CrdtDocument;
use gotipe_versioning::manager::VersionManager;

/// Main WASM editor instance
#[wasm_bindgen]
pub struct WasmEditor {
    state: EditorState,
    schema: Schema,
    crdt: Option<CrdtDocument>,
    version_manager: VersionManager,
    suggestion_mode: bool,
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

        let state = EditorState::new(doc, schema.clone());

        Ok(WasmEditor {
            state,
            schema,
            crdt: None,
            version_manager: VersionManager::new("default"),
            suggestion_mode: false,
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

        // Apply to CRDT if collaboration is enabled
        if let Some(ref mut crdt) = self.crdt {
            crdt.apply_local(&tr.steps);
        }

        self.state = self
            .state
            .apply(tr)
            .map_err(|e| JsError::new(&format!("Transform error: {e}")))?;

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
        self.crdt = Some(CrdtDocument::new(peer_id, self.state.doc()));
        Ok(())
    }

    /// Receive a binary CRDT update from a remote peer
    pub fn receive_update(&mut self, update: &[u8]) -> Result<String, JsError> {
        let crdt = self
            .crdt
            .as_mut()
            .ok_or_else(|| JsError::new("Collaboration not enabled"))?;

        let steps = crdt
            .apply_remote(update)
            .map_err(|e| JsError::new(&format!("CRDT error: {e}")))?;

        // Apply resulting steps to local state
        let tr = Transaction {
            steps,
            selection: None,
            metadata: std::collections::HashMap::new(),
        };

        if !tr.steps.is_empty() {
            self.state = self
                .state
                .apply(tr)
                .map_err(|e| JsError::new(&format!("Transform error: {e}")))?;
        }

        let doc_json = serde_json::to_string(self.state.doc())
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))?;
        Ok(doc_json)
    }

    /// Get pending CRDT update to send to peers
    pub fn get_update(&mut self) -> Result<Vec<u8>, JsError> {
        let crdt = self
            .crdt
            .as_ref()
            .ok_or_else(|| JsError::new("Collaboration not enabled"))?;
        Ok(crdt.encode_snapshot())
    }

    // === Export ===

    /// Export document as HTML
    pub fn export_html(&self) -> Result<String, JsError> {
        gotipe_export::to_html(self.state.doc())
            .map_err(|e| JsError::new(&format!("HTML export error: {e}")))
    }

    /// Export document as Markdown
    pub fn export_markdown(&self) -> String {
        gotipe_export::to_markdown(self.state.doc())
    }

    /// Export document as JSON
    pub fn export_json(&self) -> String {
        gotipe_export::to_json(self.state.doc())
    }

    /// Sanitize HTML using the strict sanitizer
    pub fn sanitize_html(&self, html: &str) -> String {
        gotipe_export::html::HtmlSanitizer::sanitize(html)
    }

    // === Comments ===

    /// Add a comment (JSON-encoded)
    pub fn add_comment(&mut self, comment_json: &str) -> Result<String, JsError> {
        let comment: Comment = serde_json::from_str(comment_json)
            .map_err(|e| JsError::new(&format!("Invalid comment JSON: {e}")))?;
        let id = comment.id.0.clone();
        // In a full implementation, this would integrate with CRDT
        Ok(id)
    }

    /// Resolve a comment
    pub fn resolve_comment(&mut self, _comment_id: &str) -> Result<(), JsError> {
        // In a full implementation, this would update CRDT state
        Ok(())
    }

    /// Get all comments (JSON-encoded)
    pub fn get_comments(&self) -> Result<String, JsError> {
        // In a full implementation, this would query CRDT state
        Ok("[]".into())
    }

    // === Suggestions ===

    /// Enable/disable suggestion mode
    pub fn set_suggestion_mode(&mut self, enabled: bool) {
        self.suggestion_mode = enabled;
    }

    /// Accept a suggestion
    pub fn accept_suggestion(&mut self, _suggestion_id: &str) -> Result<String, JsError> {
        let doc_json = serde_json::to_string(self.state.doc())
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))?;
        Ok(doc_json)
    }

    /// Reject a suggestion
    pub fn reject_suggestion(&mut self, _suggestion_id: &str) -> Result<String, JsError> {
        let doc_json = serde_json::to_string(self.state.doc())
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))?;
        Ok(doc_json)
    }

    // === Versions ===

    /// Create a named version
    pub fn create_version(&mut self, name: &str) -> Result<String, JsError> {
        let state_vector = self
            .crdt
            .as_ref()
            .map(|c| c.encode_snapshot())
            .unwrap_or_else(|| serde_json::to_vec(self.state.doc()).unwrap_or_default());

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
            .restore_version(&vid, "local")
            .ok_or_else(|| JsError::new("Version not found"))?;

        let doc: Document = serde_json::from_slice(&state_bytes)
            .map_err(|e| JsError::new(&format!("Failed to restore: {e}")))?;

        self.state = EditorState::new(doc, self.schema.clone());

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

// Non-WASM tests
#[cfg(test)]
mod tests {
    use super::*;

    fn default_schema_json() -> String {
        let schema = defaults::default_block_editor();
        serde_json::to_string(&schema).unwrap()
    }

    fn empty_doc_json() -> String {
        let doc = Document::new();
        serde_json::to_string(&doc).unwrap()
    }

    fn simple_doc_json() -> String {
        let doc = Document {
            blocks: vec![gotipe_core::Block {
                id: gotipe_core::BlockId("b1".into()),
                block_type: "paragraph".into(),
                attrs: std::collections::HashMap::new(),
                content: gotipe_core::BlockContent::RichText(vec![gotipe_core::TextSpan {
                    text: "Hello World".into(),
                    marks: vec![],
                }]),
                children: vec![],
            }],
            version: 0,
        };
        serde_json::to_string(&doc).unwrap()
    }

    #[test]
    fn test_create_editor() {
        let editor = WasmEditor::new(&default_schema_json(), &empty_doc_json());
        assert!(editor.is_ok());
    }

    #[test]
    fn test_export_json() {
        let editor = WasmEditor::new(&default_schema_json(), &simple_doc_json()).unwrap();
        let json = editor.export_json();
        assert!(json.contains("Hello World"));
    }

    #[test]
    fn test_validate_valid_doc() {
        let editor = WasmEditor::new(&default_schema_json(), &simple_doc_json()).unwrap();
        let result = editor.validate(&simple_doc_json());
        assert!(result.is_ok());
    }

    #[test]
    fn test_enable_collaboration() {
        let mut editor = WasmEditor::new(&default_schema_json(), &simple_doc_json()).unwrap();
        assert!(editor.enable_collaboration("peer_a").is_ok());
    }

    #[test]
    fn test_create_and_list_versions() {
        let mut editor = WasmEditor::new(&default_schema_json(), &simple_doc_json()).unwrap();
        editor.create_version("Draft 1").unwrap();
        let versions_json = editor.list_versions().unwrap();
        assert!(versions_json.contains("Draft 1"));
    }

    #[test]
    fn test_detect_pii() {
        let editor = WasmEditor::new(&default_schema_json(), &empty_doc_json()).unwrap();
        let result = editor.detect_pii("Email: hello@example.com").unwrap();
        assert!(result.contains("Email"));
    }
}
