use gotipe_core::{
    AttrValue, Block, BlockContent, BlockId, Document, Mark, Selection, Step, TextSpan,
};
use gotipe_crdt::{ops::encode_ops, CrdtDocument, VersionVector};
use std::collections::HashMap;

fn block(id: &str, text: &str) -> Block {
    Block {
        id: BlockId(id.into()),
        block_type: "paragraph".into(),
        attrs: HashMap::new(),
        content: BlockContent::RichText(vec![TextSpan {
            text: text.into(),
            marks: vec![],
        }]),
        children: vec![],
    }
}
fn document(text: &str) -> Document {
    Document {
        blocks: vec![block("a", text)],
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
fn plain(replica: &CrdtDocument) -> String {
    replica
        .to_document()
        .flatten()
        .map(|b| match &b.content {
            BlockContent::RichText(spans) => {
                spans.iter().map(|s| s.text.as_str()).collect::<String>()
            }
            BlockContent::Raw(text) => text.clone(),
            BlockContent::Empty => String::new(),
        })
        .collect()
}
fn canonical(doc: &Document) -> serde_json::Value {
    let mut doc = doc.clone();
    doc.version = 0;
    for block in &mut doc.blocks {
        if let BlockContent::RichText(spans) = &mut block.content {
            spans.retain(|s| !s.text.is_empty());
        }
    }
    serde_json::to_value(doc).unwrap()
}
fn exchange(a: &mut CrdtDocument, b: &mut CrdtDocument) {
    let update_a = a.encode_update_since(&VersionVector::new());
    let update_b = b.encode_update_since(&VersionVector::new());
    a.apply_remote(&update_b).unwrap();
    b.apply_remote(&update_a).unwrap();
    assert_eq!(canonical(&a.to_document()), canonical(&b.to_document()));
}

#[test]
fn concurrent_unicode_runs_converge_without_interleaving_or_duplication() {
    let base = document("Жя");
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    a.try_apply_local(&[insert(1, "😀ab")]).unwrap();
    b.try_apply_local(&[insert(1, "🦀CD")]).unwrap();
    exchange(&mut a, &mut b);
    let text = plain(&a);
    assert!(text == "Ж😀ab🦀CDя" || text == "Ж🦀CD😀abя", "{text}");
    let update = b.encode_update_since(&VersionVector::new());
    assert!(a.apply_remote(&update).unwrap().is_empty());
    assert_eq!(plain(&a), text);
    a.try_apply_local(&[insert(1, "!")]).unwrap();
    exchange(&mut a, &mut b);
}

#[test]
fn concurrent_deletion_targets_original_characters_only() {
    let base = document("Ж😀я");
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    a.try_apply_local(&[Step::DeleteText {
        block_id: BlockId("a".into()),
        from: 1,
        to: 3,
    }])
    .unwrap();
    b.try_apply_local(&[insert(1, "new")]).unwrap();
    exchange(&mut a, &mut b);
    assert_eq!(plain(&a), "Жnewя");
}

#[test]
fn out_of_order_operations_are_replayed_after_dependencies_arrive() {
    let base = document("A");
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    let mut ops = a.try_apply_local(&[insert(1, "😀B")]).unwrap();
    ops.extend(
        a.try_apply_local(&[Step::DeleteText {
            block_id: BlockId("a".into()),
            from: 1,
            to: 3,
        }])
        .unwrap(),
    );
    for op in ops.iter().rev() {
        b.apply_remote(&encode_ops(std::slice::from_ref(op)))
            .unwrap();
    }
    assert_eq!(canonical(&a.to_document()), canonical(&b.to_document()));
    assert_eq!(plain(&b), "AB");
}

#[test]
fn independent_attributes_and_marks_merge_without_overwriting_each_other() {
    let base = document("Ж😀");
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    for (replica, mark, key) in [(&mut a, "bold", "align"), (&mut b, "italic", "color")] {
        replica
            .try_apply_local(&[
                Step::AddMark {
                    block_id: BlockId("a".into()),
                    from: 0,
                    to: 3,
                    mark: Mark::new(mark),
                },
                Step::SetBlockAttrs {
                    block_id: BlockId("a".into()),
                    attrs: HashMap::from([(key.into(), AttrValue::String(mark.into()))]),
                },
            ])
            .unwrap();
    }
    exchange(&mut a, &mut b);
    let doc = a.to_document();
    let node = &doc.blocks[0];
    assert_eq!(node.attrs.len(), 2);
    let BlockContent::RichText(spans) = &node.content else {
        panic!()
    };
    assert_eq!(spans[0].marks.len(), 2);
}

#[test]
fn inserts_preserve_nested_content_attributes_and_raw_type() {
    let base = document("A");
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    let mut parent = block("parent", "Ж");
    parent.block_type = "toggle".into();
    parent.attrs.insert("open".into(), AttrValue::Bool(true));
    let mut child = block("child", "");
    child.block_type = "codeBlock".into();
    child.content = BlockContent::Raw("😀code".into());
    child
        .attrs
        .insert("language".into(), AttrValue::String("rust".into()));
    parent.children.push(child);
    a.try_apply_local(&[Step::InsertBlock {
        parent_id: None,
        index: 1,
        block: parent.clone(),
    }])
    .unwrap();
    exchange(&mut a, &mut b);
    assert_eq!(
        serde_json::to_value(&b.to_document().blocks[1]).unwrap(),
        serde_json::to_value(parent).unwrap()
    );
}

#[test]
fn every_structural_step_replication_matches_the_local_editor_result() {
    let base = document("Ж😀я");
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    let mut expected = Step::SplitBlock {
        block_id: BlockId("a".into()),
        offset: 3,
    }
    .apply(base)
    .unwrap();
    a.apply_local_document(&expected).unwrap();
    exchange(&mut a, &mut b);
    assert_eq!(canonical(&expected), canonical(&b.to_document()));
    let second_id = expected.blocks[1].id.clone();
    for step in [
        Step::SetBlockType {
            block_id: second_id.clone(),
            new_type: "codeBlock".into(),
            attrs: HashMap::new(),
        },
        Step::SetBlockType {
            block_id: second_id.clone(),
            new_type: "paragraph".into(),
            attrs: HashMap::new(),
        },
        Step::MoveBlock {
            block_id: second_id.clone(),
            new_parent_id: None,
            new_index: 0,
        },
        Step::MergeBlocks {
            block_id: second_id.clone(),
            target_id: BlockId("a".into()),
        },
    ] {
        expected = step.apply(expected).unwrap();
        a.apply_local_document(&expected).unwrap();
        exchange(&mut a, &mut b);
        assert_eq!(canonical(&expected), canonical(&b.to_document()));
    }
}

#[test]
fn concurrent_tree_cycles_keep_both_blocks_visible_and_converge() {
    let base = Document {
        blocks: vec![block("a", "A"), block("b", "B")],
        version: 0,
    };
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    a.try_apply_local(&[Step::MoveBlock {
        block_id: BlockId("a".into()),
        new_parent_id: Some(BlockId("b".into())),
        new_index: 0,
    }])
    .unwrap();
    b.try_apply_local(&[Step::MoveBlock {
        block_id: BlockId("b".into()),
        new_parent_id: Some(BlockId("a".into())),
        new_index: 0,
    }])
    .unwrap();
    exchange(&mut a, &mut b);
    assert_eq!(a.to_document().flatten().count(), 2);
}

#[test]
fn invalid_transaction_and_foreign_snapshot_leave_replica_unchanged() {
    let base = document("Ж😀");
    let mut a = CrdtDocument::new("a", &base);
    assert!(a
        .try_apply_local(&[insert(1, "!"), insert(999, "bad")])
        .is_err());
    assert_eq!(plain(&a), "Ж😀");
    let foreign = CrdtDocument::new("b", &document("different"));
    assert!(a
        .apply_remote(&foreign.encode_update_since(&VersionVector::new()))
        .is_err());
    assert_eq!(plain(&a), "Ж😀");
}

#[test]
fn local_undo_and_redo_preserve_remote_edits_and_replicate() {
    let base = document("AB");
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    let ops = a.try_apply_local(&[insert(1, "x")]).unwrap();
    a.history_mut()
        .record(ops, Selection::cursor(BlockId("a".into()), 1));
    b.try_apply_local(&[insert(1, "y")]).unwrap();
    exchange(&mut a, &mut b);
    let (inverse, _) = a.history_mut().undo().unwrap();
    a.apply_local_operations(&inverse).unwrap();
    exchange(&mut a, &mut b);
    assert_eq!(plain(&a), "AyB");
    let (redo, _) = a.history_mut().redo().unwrap();
    a.apply_local_operations(&redo).unwrap();
    exchange(&mut a, &mut b);
    assert!(plain(&a).contains('x'));
    assert!(plain(&a).contains('y'));
}

#[test]
fn three_peers_and_reverse_delivery_converge() {
    let base = document("");
    let mut peers = [
        CrdtDocument::new("a", &base),
        CrdtDocument::new("b", &base),
        CrdtDocument::new("c", &base),
    ];
    let mut updates = vec![];
    for round in 0..12 {
        for (index, peer) in peers.iter_mut().enumerate() {
            let len = peer.to_document().blocks[0].text_length();
            updates.push(
                peer.try_apply_local(&[insert(len, &format!("{index}{round}😀"))])
                    .unwrap(),
            );
        }
    }
    for (index, peer) in peers.iter_mut().enumerate() {
        let order: Vec<_> = if index == 0 {
            (0..updates.len()).collect()
        } else {
            (0..updates.len()).rev().collect()
        };
        for i in order {
            peer.apply_remote(&encode_ops(&updates[i])).unwrap();
        }
    }
    assert_eq!(
        canonical(&peers[0].to_document()),
        canonical(&peers[1].to_document())
    );
    assert_eq!(
        canonical(&peers[1].to_document()),
        canonical(&peers[2].to_document())
    );
    assert_eq!(plain(&peers[0]).matches('😀').count(), 36);
}

#[test]
fn concurrent_edits_follow_a_merged_block_into_its_target() {
    let base = Document {
        blocks: vec![block("a", "A"), block("source", "😀B")],
        version: 0,
    };
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    a.try_apply_local(&[Step::MergeBlocks {
        block_id: BlockId("source".into()),
        target_id: BlockId("a".into()),
    }])
    .unwrap();
    b.try_apply_local(&[
        Step::InsertText {
            block_id: BlockId("source".into()),
            offset: 3,
            text: "kept".into(),
            marks: vec![],
        },
        Step::AddMark {
            block_id: BlockId("source".into()),
            from: 0,
            to: 2,
            mark: Mark::new("bold"),
        },
    ])
    .unwrap();
    exchange(&mut a, &mut b);
    assert_eq!(plain(&a), "A😀Bkept");
    assert_eq!(a.to_document().blocks.len(), 1);
    let doc = a.to_document();
    let BlockContent::RichText(spans) = &doc.blocks[0].content else {
        panic!()
    };
    assert!(spans
        .iter()
        .any(|s| s.text == "😀" && s.marks.iter().any(|m| m.mark_type == "bold")));
}

#[test]
fn concurrent_tail_edits_follow_a_split_to_the_new_block() {
    let base = document("A😀B");
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    a.try_apply_local(&[Step::SplitBlock {
        block_id: BlockId("a".into()),
        offset: 1,
    }])
    .unwrap();
    b.try_apply_local(&[
        insert(4, "kept"),
        Step::DeleteText {
            block_id: BlockId("a".into()),
            from: 1,
            to: 3,
        },
    ])
    .unwrap();
    exchange(&mut a, &mut b);
    assert_eq!(plain(&a), "ABkept");
    let doc = a.to_document();
    assert_eq!(doc.blocks.len(), 2);
    let BlockContent::RichText(spans) = &doc.blocks[1].content else {
        panic!()
    };
    assert_eq!(
        spans.iter().map(|s| s.text.as_str()).collect::<String>(),
        "Bkept"
    );
}

#[test]
fn materialized_snapshot_can_adopt_matching_replication_history() {
    let mut original = CrdtDocument::new("a", &document("Ж😀"));
    original.try_apply_local(&[insert(3, "kept")]).unwrap();
    let mut joined = CrdtDocument::new("b", &original.to_document());
    joined
        .apply_remote(&original.encode_update_since(&VersionVector::new()))
        .unwrap();
    joined.try_apply_local(&[insert(0, "!")]).unwrap();
    exchange(&mut original, &mut joined);
    assert_eq!(plain(&joined), "!Ж😀kept");
}

#[test]
fn snapshot_undo_resurrects_a_merged_source_without_old_text_redirection() {
    let base = Document {
        blocks: vec![block("a", "A"), block("source", "Ж😀")],
        version: 0,
    };
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    a.try_apply_local(&[Step::MergeBlocks {
        block_id: BlockId("source".into()),
        target_id: BlockId("a".into()),
    }])
    .unwrap();
    exchange(&mut a, &mut b);
    a.apply_local_document(&base).unwrap();
    exchange(&mut a, &mut b);
    assert_eq!(canonical(&a.to_document()), canonical(&base));
    a.try_apply_local(&[Step::InsertText {
        block_id: BlockId("source".into()),
        offset: 3,
        text: "kept".into(),
        marks: vec![],
    }])
    .unwrap();
    exchange(&mut a, &mut b);
    assert_eq!(plain(&a), "AЖ😀kept");
}

#[test]
fn wire_clocks_and_local_exhaustion_fail_without_partial_projection_or_log() {
    const MAX: u64 = 9_007_199_254_740_991;
    let base = document("abc");
    let mut peer = CrdtDocument::new("local", &base);
    let envelope = |clock: u64, change: serde_json::Value| {
        serde_json::to_vec(&serde_json::json!({
            "protocol":"gotipe.crdt/1", "base":base,
            "operations":[{"id":{"lamport":clock,"peer_id":"remote"},"change":change}]
        }))
        .unwrap()
    };
    let no_change = serde_json::json!({"SetAttr":{"block_id":"a","key":"seen","value":true}});
    for clock in [MAX + 1, u64::MAX] {
        let before = peer.encode_update_since(&VersionVector::new());
        assert!(peer
            .apply_remote(&envelope(clock, no_change.clone()))
            .is_err());
        assert_eq!(peer.encode_update_since(&VersionVector::new()), before);
    }
    let unsafe_position = serde_json::json!({"InsertChar":{"block_id":"a","position":[{"digit":5,"id":{"lamport":u64::MAX,"peer_id":"remote"}}],"value":"X","marks":[]}});
    assert!(peer.apply_remote(&envelope(1, unsafe_position)).is_err());
    peer.apply_remote(&envelope(MAX - 1, no_change)).unwrap();
    let before = peer.encode_update_since(&VersionVector::new());
    // The first character can be allocated; the second must roll back both.
    assert!(peer.try_apply_local(&[insert(0, "XY")]).is_err());
    assert_eq!(plain(&peer), "abc");
    assert_eq!(peer.encode_update_since(&VersionVector::new()), before);
    peer.try_set_data("comments", "last", Some("{}".into()))
        .unwrap();
    let exhausted = peer.encode_update_since(&VersionVector::new());
    assert!(peer
        .try_set_data("comments", "overflow", Some("{}".into()))
        .is_err());
    assert!(peer.try_apply_local(&[insert(0, "Z")]).is_err());
    assert_eq!(peer.encode_update_since(&VersionVector::new()), exhausted);
}

#[test]
fn replica_constructor_rejects_duplicate_baselines_and_invalid_peer_ids() {
    let mut base = document("text");
    for peer in ["", "  ", "@base/forged"] {
        assert!(CrdtDocument::try_new(peer, &base).is_err());
    }
    assert!(CrdtDocument::try_new(&"x".repeat(257), &base).is_err());
    base.blocks.push(base.blocks[0].clone());
    assert!(CrdtDocument::try_new("valid", &base).is_err());
}
