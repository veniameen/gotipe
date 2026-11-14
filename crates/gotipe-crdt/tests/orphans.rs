//! A block added concurrently inside a block another peer deleted (a cell in a
//! deleted row) is deleted with it on every replica, never hoisted to the root
//! where no schema accepts a row or a cell, and comes back when the delete is
//! undone.
use gotipe_core::{Block, BlockContent, BlockId, Document, Selection, Step, TextSpan};
use gotipe_crdt::{CrdtDocument, CrdtOp, VersionVector};
use std::collections::HashMap;

fn block(id: &str, kind: &str, text: Option<&str>, children: Vec<Block>) -> Block {
    Block {
        id: BlockId(id.into()),
        block_type: kind.into(),
        attrs: HashMap::new(),
        content: match text {
            Some(text) => BlockContent::RichText(vec![TextSpan {
                text: text.into(),
                marks: vec![],
            }]),
            None => BlockContent::Empty,
        },
        children,
    }
}
fn table() -> Document {
    let row = |id: &str, cells: &[&str]| {
        block(
            id,
            "tableRow",
            None,
            cells
                .iter()
                .map(|cell| block(cell, "tableCell", Some(cell), vec![]))
                .collect(),
        )
    };
    Document {
        blocks: vec![
            block("p", "paragraph", Some("x"), vec![]),
            block(
                "t",
                "table",
                None,
                vec![row("r1", &["a1", "b1"]), row("r2", &["a2", "b2"])],
            ),
        ],
        version: 0,
    }
}
fn edit(replica: &mut CrdtDocument, step: Step) -> Vec<CrdtOp> {
    replica.try_apply_local(&[step]).unwrap()
}
fn send(from: &CrdtDocument, to: &mut CrdtDocument) {
    to.apply_remote(&from.encode_update_since(&VersionVector::new()))
        .unwrap();
}
fn json(replica: &CrdtDocument) -> String {
    serde_json::to_string(&replica.to_document().blocks).unwrap()
}
fn top_level(replica: &CrdtDocument) -> Vec<String> {
    replica
        .to_document()
        .blocks
        .iter()
        .map(|block| block.id.0.clone())
        .collect()
}

#[test]
fn a_cell_added_to_a_row_deleted_meanwhile_is_deleted_with_it() {
    let base = table();
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    let delete = edit(
        &mut a,
        Step::DeleteBlock {
            block_id: BlockId("r2".into()),
        },
    );
    // Concurrently, like insertColumn or splitCell: a new cell in that row.
    edit(
        &mut b,
        Step::InsertBlock {
            parent_id: Some(BlockId("r2".into())),
            index: 2,
            block: block("c2", "tableCell", Some("new"), vec![]),
        },
    );
    send(&a, &mut b);
    send(&b, &mut a);
    assert_eq!(json(&a), json(&b));
    assert_eq!(top_level(&a), ["p", "t"]);
    assert!(!json(&a).contains("c2"));

    // A later edit does not delete the hidden cell for good…
    let later = edit(
        &mut a,
        Step::InsertText {
            block_id: BlockId("p".into()),
            offset: 1,
            text: "y".into(),
            marks: vec![],
        },
    );
    assert!(later
        .iter()
        .all(|op| !format!("{op:?}").contains("DeleteBlock")));
    // …so undoing the delete brings the row back with the new cell.
    a.history_mut()
        .record(delete, Selection::cursor(BlockId("p".into()), 0));
    let (undo, _) = a.history_mut().undo().unwrap();
    a.apply_local_operations(&undo).unwrap();
    send(&a, &mut b);
    assert_eq!(json(&a), json(&b));
    let restored = serde_json::to_string(&a.to_document().blocks[1]).unwrap();
    assert!(restored.contains("\"r2\"") && restored.contains("\"c2\""));
}

#[test]
fn rows_deleted_by_both_peers_leave_no_block_at_the_root() {
    let base = table();
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    let mut c = CrdtDocument::new("c", &base);
    edit(
        &mut a,
        Step::DeleteBlock {
            block_id: BlockId("r1".into()),
        },
    );
    edit(
        &mut b,
        Step::DeleteBlock {
            block_id: BlockId("r2".into()),
        },
    );
    edit(
        &mut c,
        Step::InsertBlock {
            parent_id: Some(BlockId("r1".into())),
            index: 0,
            block: block("n", "tableCell", Some("n"), vec![]),
        },
    );
    for _ in 0..2 {
        for (from, to) in [(0, 1), (1, 2), (2, 0), (0, 2), (2, 1), (1, 0)] {
            let replicas = [a.clone(), b.clone(), c.clone()];
            let target = [&mut a, &mut b, &mut c];
            send(&replicas[from], target.into_iter().nth(to).unwrap());
        }
    }
    assert_eq!(json(&a), json(&b));
    assert_eq!(json(&b), json(&c));
    assert_eq!(top_level(&a), ["p", "t"]);
}
