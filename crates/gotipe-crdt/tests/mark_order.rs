//! D-80: every replica projects marks in the order the local engine produced.
use gotipe_core::{Block, BlockContent, BlockId, Document, Mark, Selection, Step, TextSpan};
use gotipe_crdt::{CrdtDocument, VersionVector};
use std::collections::HashMap;

fn document(text: &str, marks: Vec<Mark>) -> Document {
    Document {
        blocks: vec![Block {
            id: BlockId("a".into()),
            block_type: "paragraph".into(),
            attrs: HashMap::new(),
            content: BlockContent::RichText(vec![TextSpan {
                text: text.into(),
                marks,
            }]),
            children: vec![],
        }],
        version: 0,
    }
}
fn add(kind: &str, from: usize, to: usize) -> Step {
    Step::AddMark {
        block_id: BlockId("a".into()),
        from,
        to,
        mark: Mark::new(kind),
    }
}
fn remove(kind: &str, from: usize, to: usize) -> Step {
    Step::RemoveMark {
        block_id: BlockId("a".into()),
        from,
        to,
        mark_type: kind.into(),
    }
}
/// The exact bytes a peer exports; `version` counts operations and is local.
fn json(replica: &CrdtDocument) -> String {
    serde_json::to_string(&replica.to_document().blocks).unwrap()
}
fn orders(replica: &CrdtDocument) -> Vec<Vec<String>> {
    let BlockContent::RichText(spans) = &replica.to_document().blocks[0].content else {
        panic!("rich text expected");
    };
    spans
        .iter()
        .map(|span| span.marks.iter().map(|m| m.mark_type.clone()).collect())
        .collect()
}
/// Applies each step like the editor does and requires the projection to equal
/// the local engine's result, mark order included.
fn edit(replica: &mut CrdtDocument, steps: &[Step]) -> Vec<gotipe_crdt::CrdtOp> {
    let mut operations = Vec::new();
    for step in steps {
        let target = step.apply(replica.to_document()).unwrap();
        operations.extend(
            replica
                .apply_local_steps_result(std::slice::from_ref(step), &target)
                .unwrap(),
        );
        assert_eq!(
            serde_json::to_string(&replica.to_document().blocks).unwrap(),
            serde_json::to_string(&target.blocks).unwrap(),
            "projection differs from the local engine after {step:?}"
        );
    }
    operations
}
fn send(from: &CrdtDocument, to: &mut CrdtDocument) {
    to.apply_remote(&from.encode_update_since(&VersionVector::new()))
        .unwrap();
}

#[test]
fn a_peer_receives_marks_in_the_order_they_were_applied() {
    let base = document("Жирный 😀", vec![]);
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    edit(&mut a, &[add("italic", 0, 6), add("bold", 0, 6)]);
    assert_eq!(orders(&a)[0], ["italic", "bold"]);
    send(&a, &mut b);
    assert_eq!(json(&a), json(&b));
    // One transaction adding both marks keeps its order too.
    let mut c = CrdtDocument::new("c", &base);
    let target = add("bold", 0, 6)
        .apply(add("italic", 0, 6).apply(base.clone()).unwrap())
        .unwrap();
    c.apply_local_document(&target).unwrap();
    assert_eq!(orders(&c)[0], ["italic", "bold"]);
    let mut d = CrdtDocument::new("d", &base);
    send(&c, &mut d);
    assert_eq!(json(&c), json(&d));
}

#[test]
fn baseline_and_inserted_text_keep_their_mark_order() {
    let base = document("ab", vec![Mark::new("underline"), Mark::new("bold")]);
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    assert_eq!(orders(&a)[0], ["underline", "bold"]);
    edit(
        &mut a,
        &[Step::InsertText {
            block_id: BlockId("a".into()),
            offset: 2,
            text: "😀".into(),
            marks: vec![Mark::new("italic"), Mark::new("bold")],
        }],
    );
    send(&a, &mut b);
    assert_eq!(json(&a), json(&b));
    assert_eq!(orders(&b), [["underline", "bold"], ["italic", "bold"]]);
}

#[test]
fn removing_and_applying_a_mark_again_moves_it_last_on_every_replica() {
    let base = document("text", vec![]);
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    edit(&mut a, &[add("bold", 0, 4), add("italic", 0, 4)]);
    send(&a, &mut b);
    // One transaction whose mark set is unchanged and whose order is not.
    let reordered = add("bold", 0, 4)
        .apply(remove("bold", 0, 4).apply(a.to_document()).unwrap())
        .unwrap();
    a.apply_local_document(&reordered).unwrap();
    assert_eq!(
        serde_json::to_string(&a.to_document().blocks).unwrap(),
        serde_json::to_string(&reordered.blocks).unwrap()
    );
    assert_eq!(orders(&a)[0], ["italic", "bold"]);
    send(&a, &mut b);
    assert_eq!(json(&a), json(&b));
}

#[test]
fn concurrent_formatting_converges_to_one_order_in_any_delivery_order() {
    let base = document("Привет", vec![]);
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    let mut c = CrdtDocument::new("c", &base);
    edit(&mut a, &[add("italic", 0, 6), add("bold", 2, 6)]);
    edit(&mut b, &[add("code", 1, 5), add("bold", 0, 3)]);
    let (from_a, from_b) = (
        a.encode_update_since(&VersionVector::new()),
        b.encode_update_since(&VersionVector::new()),
    );
    a.apply_remote(&from_b).unwrap();
    b.apply_remote(&from_a).unwrap();
    c.apply_remote(&from_b).unwrap();
    c.apply_remote(&from_a).unwrap();
    assert_eq!(json(&a), json(&b));
    assert_eq!(json(&a), json(&c));
    // A later local edit starts from the converged order and keeps it.
    edit(&mut a, &[add("underline", 0, 6)]);
    send(&a, &mut b);
    send(&a, &mut c);
    assert_eq!(json(&a), json(&b));
    assert_eq!(json(&a), json(&c));
}

#[test]
fn collaborative_undo_and_redo_restore_the_authors_own_order() {
    let base = document("text", vec![]);
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    edit(&mut a, &[add("italic", 0, 4)]);
    let bold = edit(&mut a, &[add("bold", 0, 4)]);
    let formatted = json(&a);
    a.history_mut()
        .record(bold, Selection::cursor(BlockId("a".into()), 0));
    let (undo, _) = a.history_mut().undo().unwrap();
    a.apply_local_operations(&undo).unwrap();
    assert_eq!(orders(&a)[0], ["italic"]);
    let (redo, _) = a.history_mut().redo().unwrap();
    a.apply_local_operations(&redo).unwrap();
    assert_eq!(json(&a), formatted);
    send(&a, &mut b);
    assert_eq!(json(&a), json(&b));
}
