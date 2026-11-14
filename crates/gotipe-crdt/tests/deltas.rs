//! D-41: edits travel as `gotipe.crdt/2` operations after an acknowledged clock;
//! only the full state repeats the baseline.
use gotipe_core::{Block, BlockContent, BlockId, Document, Step, TextSpan};
use gotipe_crdt::{CrdtDocument, VersionVector};
use serde_json::Value;
use std::collections::HashMap;

/// Cloud accepts WebSocket messages up to 1 MiB.
const MESSAGE_LIMIT: usize = 1 << 20;

fn document(text: &str) -> Document {
    Document {
        blocks: vec![Block {
            id: BlockId("a".into()),
            block_type: "paragraph".into(),
            attrs: HashMap::new(),
            content: BlockContent::RichText(vec![TextSpan {
                text: text.into(),
                marks: vec![],
            }]),
            children: vec![],
        }],
        version: 0,
    }
}
fn insert(offset: usize, text: &str) -> Step {
    Step::InsertText {
        block_id: BlockId("a".into()),
        offset,
        text: text.into(),
        marks: vec![],
    }
}
fn full(replica: &CrdtDocument) -> Vec<u8> {
    replica.encode_update_since(&VersionVector::new())
}
fn json(bytes: &[u8]) -> Value {
    serde_json::from_slice(bytes).unwrap()
}
fn clocks(update: &Value) -> Vec<(u64, String)> {
    update["operations"]
        .as_array()
        .unwrap()
        .iter()
        .map(|op| {
            (
                op["id"]["lamport"].as_u64().unwrap(),
                op["id"]["peer_id"].as_str().unwrap().to_string(),
            )
        })
        .collect()
}
fn blocks(replica: &CrdtDocument) -> String {
    serde_json::to_string(&replica.to_document().blocks).unwrap()
}
/// Sends everything after `after` in frames of at most `budget` bytes, as a
/// transport does: the next frame starts at the last clock of the one before.
fn drain(from: &CrdtDocument, to: &mut CrdtDocument, mut after: u64, budget: usize) -> Vec<usize> {
    let mut sizes = vec![];
    loop {
        let frame = from.encode_local_update_after(after, budget);
        let update = json(&frame);
        let sent = clocks(&update);
        let Some((last, _)) = sent.last() else {
            assert_eq!(update["remaining"], 0);
            return sizes;
        };
        assert!(sent.windows(2).all(|pair| pair[0].0 < pair[1].0));
        assert!(sent.iter().all(|(clock, _)| *clock > after));
        to.apply_remote(&frame).unwrap();
        sizes.push(frame.len());
        after = *last;
    }
}

#[test]
fn one_edit_in_a_large_document_is_a_small_frame_without_the_baseline() {
    // Text plus an embedded image: more than the limit before any edit.
    let mut base = document(&"Большой документ 😀 ".repeat(2_000));
    base.blocks[0].attrs.insert(
        "src".into(),
        gotipe_core::AttrValue::String(format!(
            "data:image/png;base64,{}",
            "A".repeat(MESSAGE_LIMIT)
        )),
    );
    let mut a = CrdtDocument::new("a", &base);
    a.try_apply_local(&[insert(3, "x")]).unwrap();
    // The full state cannot pass the server limit; before deltas every edit sent it.
    assert!(full(&a).len() > MESSAGE_LIMIT);
    let frame = a.encode_local_update_after(0, 0);
    assert!(frame.len() < 1024, "{} bytes", frame.len());
    let update = json(&frame);
    assert_eq!(update["protocol"], "gotipe.crdt/2");
    assert!(update.get("base").is_none());
    assert_eq!(clocks(&update), [(1, "a".to_string())]);
    assert_eq!(update["remaining"], 0);
    let mut b = CrdtDocument::new("b", &base);
    b.apply_remote(&frame).unwrap();
    assert_eq!(blocks(&a), blocks(&b));
}

#[test]
fn a_long_offline_session_drains_in_bounded_ordered_frames() {
    let base = document("начало");
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    for index in 0..40 {
        a.try_apply_local(&[insert(index % 6, &"офлайн 😀 правка ".repeat(10))])
            .unwrap();
    }
    assert!(full(&a).len() > MESSAGE_LIMIT);
    let budget = 64 * 1024;
    let total = json(&a.encode_local_update_after(0, 1));
    assert_eq!(clocks(&total).len(), 1);
    assert_eq!(total["remaining"], 400 * 16 - 1);
    let sizes = drain(&a, &mut b, 0, budget);
    assert!(sizes.len() > 10);
    assert!(sizes.iter().all(|size| *size <= budget), "{sizes:?}");
    assert_eq!(blocks(&a), blocks(&b));
    // Nothing is left after the last acknowledged clock, and nothing repeats.
    let last = clocks(&json(&full(&a))).last().unwrap().0;
    assert_eq!(clocks(&json(&a.encode_local_update_after(last, 0))), []);
    a.try_apply_local(&[insert(0, "!")]).unwrap();
    assert_eq!(
        clocks(&json(&a.encode_local_update_after(last, 0))),
        [(last + 1, "a".to_string())]
    );
}

#[test]
fn an_operation_larger_than_the_budget_still_goes_alone() {
    let base = document("");
    let mut a = CrdtDocument::new("a", &base);
    a.set_data("comments", "one", Some("ж".repeat(4096)));
    a.set_data("comments", "two", Some("short".into()));
    let frame = json(&a.encode_local_update_after(0, 64));
    assert_eq!(clocks(&frame), [(1, "a".to_string())]);
    assert_eq!(frame["remaining"], 1);
}

#[test]
fn a_delta_never_repeats_operations_received_from_peers() {
    let base = document("AB");
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    b.try_apply_local(&[insert(1, "remote")]).unwrap();
    a.apply_remote(&b.encode_local_update_after(0, 0)).unwrap();
    a.try_apply_local(&[insert(0, "L")]).unwrap();
    let sent = clocks(&json(&a.encode_local_update_after(0, 0)));
    assert_eq!(sent.len(), 1);
    assert!(sent.iter().all(|(clock, peer)| peer == "a" && *clock > 6));
    b.apply_remote(&a.encode_local_update_after(0, 0)).unwrap();
    assert_eq!(blocks(&a), blocks(&b));
}

#[test]
fn envelope_rules_are_checked_before_anything_changes() {
    let base = document("AB");
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    a.try_apply_local(&[insert(1, "x")]).unwrap();
    let mut delta = json(&a.encode_local_update_after(0, 0));
    let before = blocks(&b);
    let mut with_base = delta.clone();
    with_base["base"] = serde_json::to_value(&base).unwrap();
    let mut legacy = delta.clone();
    legacy["protocol"] = "gotipe.crdt/1".into();
    let mut unknown = delta.clone();
    unknown["protocol"] = "gotipe.crdt/3".into();
    for invalid in [with_base, legacy, unknown] {
        assert!(b
            .apply_remote(&serde_json::to_vec(&invalid).unwrap())
            .is_err());
        assert_eq!(blocks(&b), before);
    }
    // Transport fields are not the engine's: a generation token is accepted as is.
    delta["generation"] = "0123abcd".into();
    b.apply_remote(&serde_json::to_vec(&delta).unwrap())
        .unwrap();
    assert_eq!(blocks(&a), blocks(&b));
    // The first protocol still works: a full state from a peer on the same baseline.
    let mut c = CrdtDocument::new("c", &base);
    c.apply_remote(&full(&a)).unwrap();
    assert_eq!(blocks(&a), blocks(&c));
    assert!(c.apply_remote(&full(&a)).unwrap().is_empty());
}

#[test]
fn operations_restored_under_another_peer_are_found_against_the_server_state() {
    let base = document("AB");
    // A closed tab: five edits, of which the server saved three.
    let mut old = CrdtDocument::new("old-tab", &base);
    let mut server = CrdtDocument::new("server", &base);
    for index in 0..5 {
        old.try_apply_local(&[insert(index, "x")]).unwrap();
        if index == 2 {
            server
                .apply_remote(&old.encode_local_update_after(0, 0))
                .unwrap();
        }
    }
    // The new tab restores the local copy under its own peer ID and edits.
    let mut tab = CrdtDocument::new("new-tab", &base);
    tab.apply_remote(&full(&old)).unwrap();
    tab.try_apply_local(&[insert(0, "n")]).unwrap();
    let missing = json(&tab.encode_missing_from(&full(&server)).unwrap());
    assert_eq!(missing["protocol"], "gotipe.crdt/2");
    assert_eq!(missing["acknowledged"], 0);
    assert_eq!(
        clocks(&missing),
        [(4, "old-tab".to_string()), (5, "old-tab".to_string())]
    );
    server
        .apply_remote(&serde_json::to_vec(&missing).unwrap())
        .unwrap();
    server
        .apply_remote(&tab.encode_local_update_after(0, 0))
        .unwrap();
    assert_eq!(blocks(&tab), blocks(&server));
    // Now the server has everything: nothing is restored, the own clock is known.
    tab.try_apply_local(&[insert(0, "later")]).unwrap();
    let missing = json(&tab.encode_missing_from(&full(&server)).unwrap());
    assert_eq!(clocks(&missing), []);
    assert_eq!(missing["acknowledged"], 6);
    assert_eq!(clocks(&json(&tab.encode_local_update_after(6, 0))).len(), 5);
    assert!(tab
        .encode_missing_from(b"{\"protocol\":\"other\",\"operations\":[]}")
        .is_err());
}

fn heading(id: &str, text: &str) -> Step {
    let mut attrs = HashMap::new();
    attrs.insert("level".into(), gotipe_core::AttrValue::Number(2.0));
    Step::InsertBlock {
        parent_id: None,
        index: 1,
        block: Block {
            id: BlockId(id.into()),
            block_type: "heading".into(),
            attrs,
            content: BlockContent::RichText(vec![TextSpan {
                text: text.into(),
                marks: vec![],
            }]),
            children: vec![],
        },
    }
}

#[test]
fn frames_end_only_after_a_whole_transaction() {
    let base = document("x");
    let mut author = CrdtDocument::new("author", &base);
    for offset in 1..4 {
        author.try_apply_local(&[insert(offset, "y")]).unwrap();
    }
    // One transaction: CreateBlock, SetAttr(level) and 60 characters.
    author
        .try_apply_local(&[heading("h", &"z".repeat(60))])
        .unwrap();
    let typing = json(&author.encode_local_update_after(0, 0));
    let typed = clocks(&typing)[2].0;
    let budget = 2_000;

    // The heading does not fit after the typing: the frame stops before it.
    let first = json(&author.encode_local_update_after(0, budget));
    assert_eq!(clocks(&first).last().unwrap().0, typed);
    assert_eq!(first["continues"], false);
    assert_eq!(first["remaining"], 62);

    // Alone it exceeds the budget too: parts that continue, then its end.
    let mut after = typed;
    let mut parts = vec![];
    loop {
        let part = json(&author.encode_local_update_after(after, budget));
        after = clocks(&part).last().unwrap().0;
        let continues = part["continues"] == true;
        parts.push(part);
        if !continues {
            break;
        }
    }
    assert!(parts.len() > 1);
    assert!(parts[..parts.len() - 1]
        .iter()
        .all(|part| part["continues"] == true));
    let sent: usize = parts.iter().map(|part| clocks(part).len()).sum();
    assert_eq!(sent, 62);
    assert_eq!(parts.last().unwrap()["remaining"], 0);

    // Large enough for the transaction: it goes whole, never split after CreateBlock.
    let whole = json(&author.encode_local_update_after(typed, MESSAGE_LIMIT / 2));
    assert_eq!(clocks(&whole).len(), 62);
    assert_eq!(whole["continues"], false);
}

#[test]
fn operations_without_an_ended_transaction_travel_with_the_next_one() {
    let base = document("x");
    let mut author = CrdtDocument::new("author", &base);
    let step = |author: &mut CrdtDocument, offset, text| {
        let target = insert(offset, text).apply(author.to_document()).unwrap();
        author
            .apply_local_steps_result(&[insert(offset, text)], &target)
            .unwrap();
    };
    // A caller combining steps itself has not ended its transaction yet.
    step(&mut author, 1, "ab");
    let one = json(&author.encode_local_update_after(0, 0))["operations"][0].to_string();
    let budget = one.len() * 2 + 200;
    let open = json(&author.encode_local_update_after(0, budget));
    // The newest operation always ends a frame, so nothing waits for an end.
    assert_eq!(
        (clocks(&open).len(), &open["continues"]),
        (2, &Value::Bool(false))
    );
    step(&mut author, 3, "c");
    author.end_transaction();
    // All three are one transaction now: two fit, so the frame is a part.
    let part = json(&author.encode_local_update_after(0, budget));
    assert_eq!(
        (clocks(&part).len(), &part["continues"]),
        (2, &Value::Bool(true))
    );
}
