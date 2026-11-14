//! Incremental collaboration updates: what a transport sends instead of the full state.
use crate::WasmEditor;
use gotipe_crdt::CrdtDocument;
use wasm_bindgen::prelude::*;

/// The largest clock JavaScript holds exactly; operation identities start at 1.
const MAX_CLOCK: f64 = 9_007_199_254_740_991.0;

impl WasmEditor {
    fn replica(&self) -> Result<&CrdtDocument, JsError> {
        self.crdt
            .as_ref()
            .filter(|_| self.collaboration_enabled)
            .ok_or_else(|| JsError::new("Collaboration not enabled"))
    }
}
#[wasm_bindgen]
impl WasmEditor {
    /// This replica's own operations after the Lamport clock `after`, oldest
    /// first, as a `gotipe.crdt/2` update without the baseline. A positive
    /// `max_bytes` bounds the update (one operation is always included);
    /// `remaining` counts the later operations left out. Reading drains nothing.
    ///
    /// A transport reads from its confirmed clock or from the last clock of a
    /// part of the transaction it is sending; either way no frame starts at or
    /// below `after` again, so the ends of transactions up to it are forgotten.
    pub fn get_local_update_after(
        &mut self,
        after: f64,
        max_bytes: u32,
    ) -> Result<Vec<u8>, JsError> {
        if !(0.0..=MAX_CLOCK).contains(&after) || after.fract() != 0.0 {
            return Err(JsError::new("Invalid collaboration clock"));
        }
        self.replica()?;
        let replica = self.crdt.as_mut().expect("checked above");
        replica.forget_boundaries_through(after as u64);
        Ok(replica.encode_local_update_after(after as u64, max_bytes as usize))
    }

    /// Operations this replica holds and the full state `remote` lacks, except
    /// its own after `acknowledged`, the newest of them in `remote`.
    pub fn get_update_missing_from(&self, remote: &[u8]) -> Result<Vec<u8>, JsError> {
        self.replica()?
            .encode_missing_from(remote)
            .map_err(|e| JsError::new(&format!("CRDT error: {e}")))
    }
}

#[cfg(test)]
mod tests {
    use crate::WasmEditor;
    use gotipe_core::{Block, BlockContent, BlockId, Document, Mark, Step, TextSpan, Transaction};

    fn base() -> String {
        serde_json::to_string(&Document {
            blocks: vec![Block {
                id: BlockId("b1".into()),
                block_type: "paragraph".into(),
                attrs: Default::default(),
                content: BlockContent::RichText(vec![TextSpan {
                    text: "Привет 😀 мир".into(),
                    marks: vec![],
                }]),
                children: vec![],
            }],
            version: 0,
        })
        .unwrap()
    }
    fn peers() -> (WasmEditor, WasmEditor) {
        let mut a = WasmEditor::with_default_schema(&base()).unwrap();
        let mut b = WasmEditor::with_default_schema(&base()).unwrap();
        a.enable_collaboration("a").unwrap();
        b.enable_collaboration("b").unwrap();
        (a, b)
    }
    /// Exported blocks, byte for byte; `version` is each editor's own revision counter.
    fn blocks(editor: &WasmEditor) -> String {
        serde_json::to_string(&editor.state.doc().blocks).unwrap()
    }
    fn transaction(step: Step) -> String {
        serde_json::to_string(&Transaction::new().with_step(step)).unwrap()
    }
    fn mark(kind: &str, from: usize, to: usize) -> String {
        transaction(Step::AddMark {
            block_id: BlockId("b1".into()),
            from,
            to,
            mark: Mark::new(kind),
        })
    }
    fn insert(offset: usize, text: &str) -> String {
        transaction(Step::InsertText {
            block_id: BlockId("b1".into()),
            offset,
            text: text.into(),
            marks: vec![],
        })
    }

    #[test]
    fn local_updates_after_a_clock_replace_the_full_state_between_peers() {
        let (mut a, mut b) = peers();
        a.apply(&insert(6, "Ж")).unwrap();
        let first = a.get_local_update_after(0.0, 0).unwrap();
        assert!(first.len() < a.get_update().unwrap().len());
        assert!(!String::from_utf8_lossy(&first).contains("\"base\""));
        b.receive_update(&first).unwrap();
        assert_eq!(blocks(&a), blocks(&b));
        a.apply(&insert(0, "🦀")).unwrap();
        // The first edit took clock 1: only the second one is sent now.
        let second = a.get_local_update_after(1.0, 0).unwrap();
        assert!(String::from_utf8_lossy(&second).contains("\"remaining\":0"));
        assert!(!String::from_utf8_lossy(&second).contains("Ж"));
        b.receive_update(&second).unwrap();
        assert_eq!(blocks(&a), blocks(&b));
        let state = b.get_update().unwrap();
        let missing = a.get_update_missing_from(&state).unwrap();
        assert!(String::from_utf8_lossy(&missing).contains("\"operations\":[]"));
        assert!(String::from_utf8_lossy(&missing).contains("\"acknowledged\":2"));
    }

    #[test]
    fn peers_export_identical_json_after_formatting_in_any_order() {
        let (mut a, mut b) = peers();
        a.apply(&mark("italic", 0, 6)).unwrap();
        a.apply(&mark("bold", 0, 6)).unwrap();
        assert!(blocks(&a)
            .contains(r#"[{"mark_type":"italic","attrs":{}},{"mark_type":"bold","attrs":{}}]"#));
        b.receive_update(&a.get_local_update_after(0.0, 0).unwrap())
            .unwrap();
        assert_eq!(blocks(&a), blocks(&b));
        // Concurrent formatting of overlapping ranges.
        a.apply(&mark("underline", 2, 12)).unwrap();
        b.apply(&mark("code", 0, 9)).unwrap();
        let (from_a, from_b) = (a.get_update().unwrap(), b.get_update().unwrap());
        a.receive_update(&from_b).unwrap();
        b.receive_update(&from_a).unwrap();
        assert_eq!(blocks(&a), blocks(&b));
    }

    #[test]
    fn collaborative_undo_and_redo_keep_the_authors_mark_order() {
        let (mut a, mut b) = peers();
        a.apply(&mark("italic", 0, 6)).unwrap();
        a.apply(&mark("bold", 0, 6)).unwrap();
        let formatted = blocks(&a);
        a.undo_collaboration().unwrap().unwrap();
        assert!(!a.export_json().contains("bold"));
        a.redo_collaboration().unwrap().unwrap();
        assert_eq!(blocks(&a), formatted);
        b.receive_update(&a.get_update().unwrap()).unwrap();
        assert_eq!(blocks(&a), blocks(&b));
    }
}
