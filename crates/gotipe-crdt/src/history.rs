use crate::ops::CrdtOp;
use gotipe_core::Selection;

fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Debug, Clone)]
struct HistoryItem {
    /// CRDT operations to undo
    operations: Vec<CrdtOp>,
    /// Inverse operations (to apply for undo)
    inverse: Vec<CrdtOp>,
    /// Timestamp (used for grouping decisions)
    _timestamp: u64,
    /// Selection before the operation
    selection: Selection,
}

/// CRDT-based undo/redo history
#[derive(Debug, Clone)]
pub struct CrdtHistory {
    undo_stack: Vec<HistoryItem>,
    redo_stack: Vec<HistoryItem>,
    max_items: usize,
    group_timeout_ms: u64,
    last_operation_time: u64,
}

impl CrdtHistory {
    pub fn new() -> Self {
        CrdtHistory {
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            max_items: 100,
            group_timeout_ms: 500,
            last_operation_time: 0,
        }
    }

    pub fn with_max_items(mut self, max: usize) -> Self {
        self.max_items = max;
        self
    }

    pub fn with_group_timeout(mut self, timeout_ms: u64) -> Self {
        self.group_timeout_ms = timeout_ms;
        self
    }

    /// Record a local operation (only local ops are undoable)
    pub fn record(&mut self, ops: Vec<CrdtOp>, selection: Selection) {
        let now = current_time_ms();
        let inverse: Vec<CrdtOp> = ops.iter().map(|op| op.inverse()).collect();

        // Group with previous if within timeout
        if now - self.last_operation_time < self.group_timeout_ms {
            if let Some(last) = self.undo_stack.last_mut() {
                last.operations.extend(ops);
                last.inverse.extend(inverse);
                self.last_operation_time = now;
                return;
            }
        }

        self.undo_stack.push(HistoryItem {
            operations: ops,
            inverse,
            _timestamp: now,
            selection,
        });

        // Clear redo stack on new operation
        self.redo_stack.clear();

        // Trim undo stack
        if self.undo_stack.len() > self.max_items {
            self.undo_stack.remove(0);
        }

        self.last_operation_time = now;
    }

    /// Undo: return inverse operations to apply
    pub fn undo(&mut self) -> Option<(Vec<CrdtOp>, Selection)> {
        let item = self.undo_stack.pop()?;
        let inverse = item.inverse.clone();
        let selection = item.selection.clone();
        self.redo_stack.push(item);
        Some((inverse, selection))
    }

    /// Redo: return original operations to re-apply
    pub fn redo(&mut self) -> Option<(Vec<CrdtOp>, Selection)> {
        let item = self.redo_stack.pop()?;
        let ops = item.operations.clone();
        let selection = item.selection.clone();
        self.undo_stack.push(item);
        Some((ops, selection))
    }

    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    pub fn undo_count(&self) -> usize {
        self.undo_stack.len()
    }

    pub fn redo_count(&self) -> usize {
        self.redo_stack.len()
    }

    pub fn clear(&mut self) {
        self.undo_stack.clear();
        self.redo_stack.clear();
    }
}

impl Default for CrdtHistory {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ops::{CrdtOp, OpId, TextOp};
    use gotipe_core::BlockId;

    fn make_insert_op() -> CrdtOp {
        CrdtOp::Text(
            BlockId("b1".into()),
            TextOp::Insert {
                id: OpId::new(1, "peer_a"),
                pos: 0,
                ch: 'X',
                marks: vec![],
                left_origin: None,
                right_origin: None,
            },
        )
    }

    #[test]
    fn test_record_and_undo() {
        let mut history = CrdtHistory::new().with_group_timeout(0);
        let sel = Selection::default();

        history.record(vec![make_insert_op()], sel.clone());
        assert!(history.can_undo());
        assert!(!history.can_redo());

        let (ops, _) = history.undo().unwrap();
        assert_eq!(ops.len(), 1);
        assert!(!history.can_undo());
        assert!(history.can_redo());
    }

    #[test]
    fn test_redo() {
        let mut history = CrdtHistory::new().with_group_timeout(0);
        let sel = Selection::default();

        history.record(vec![make_insert_op()], sel.clone());
        history.undo();
        let (ops, _) = history.redo().unwrap();
        assert_eq!(ops.len(), 1);
        assert!(history.can_undo());
        assert!(!history.can_redo());
    }

    #[test]
    fn test_new_operation_clears_redo() {
        let mut history = CrdtHistory::new().with_group_timeout(0);
        let sel = Selection::default();

        history.record(vec![make_insert_op()], sel.clone());
        history.undo();
        assert!(history.can_redo());

        history.record(vec![make_insert_op()], sel.clone());
        assert!(!history.can_redo()); // redo stack cleared
    }

    #[test]
    fn test_max_items_trimming() {
        let mut history = CrdtHistory::new().with_max_items(5).with_group_timeout(0);
        let sel = Selection::default();

        for _ in 0..10 {
            history.record(vec![make_insert_op()], sel.clone());
        }

        assert_eq!(history.undo_count(), 5);
    }

    #[test]
    fn test_empty_undo_returns_none() {
        let mut history = CrdtHistory::new();
        assert!(history.undo().is_none());
    }
}
