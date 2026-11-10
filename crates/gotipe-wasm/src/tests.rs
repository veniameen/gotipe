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

fn insert_transaction(offset: usize, text: &str) -> String {
    serde_json::to_string(
        &Transaction::new().with_step(gotipe_core::Step::InsertText {
            block_id: gotipe_core::BlockId("b1".into()),
            offset,
            text: text.into(),
            marks: vec![],
        }),
    )
    .unwrap()
}
fn blocks(editor: &WasmEditor) -> serde_json::Value {
    serde_json::to_value(&editor.state.doc().blocks).unwrap()
}

#[test]
fn peers_exchange_real_updates_and_duplicate_delivery_is_idempotent() {
    let mut a = WasmEditor::with_default_schema(&simple_doc_json()).unwrap();
    let mut b = WasmEditor::with_default_schema(&simple_doc_json()).unwrap();
    a.enable_collaboration("a").unwrap();
    b.enable_collaboration("b").unwrap();
    a.apply(&insert_transaction(5, "Ж😀")).unwrap();
    b.apply(&insert_transaction(5, "🦀B")).unwrap();
    let ua = a.get_update().unwrap();
    let ub = b.get_update().unwrap();
    a.receive_update(&ub).unwrap();
    b.receive_update(&ua).unwrap();
    assert_eq!(blocks(&a), blocks(&b));
    let state = blocks(&a);
    a.receive_update(&ub).unwrap();
    assert_eq!(blocks(&a), state);
    assert!(a.export_json().contains("Ж😀"));
    assert!(a.export_json().contains("🦀B"));
}

#[test]
fn split_identity_is_identical_in_editor_and_replica() {
    let mut editor = WasmEditor::with_default_schema(&simple_doc_json()).unwrap();
    editor.enable_collaboration("a").unwrap();
    let tr = Transaction::new().with_step(gotipe_core::Step::SplitBlock {
        block_id: gotipe_core::BlockId("b1".into()),
        offset: 5,
    });
    editor.apply(&serde_json::to_string(&tr).unwrap()).unwrap();
    assert_eq!(
        blocks(&editor),
        serde_json::to_value(editor.crdt.as_ref().unwrap().to_document().blocks).unwrap()
    );
}

#[test]
fn restored_version_is_broadcast_and_previous_document_remains_recoverable() {
    let mut a = WasmEditor::with_default_schema(&simple_doc_json()).unwrap();
    let mut b = WasmEditor::with_default_schema(&simple_doc_json()).unwrap();
    a.enable_collaboration("a").unwrap();
    b.enable_collaboration("b").unwrap();
    let version: serde_json::Value =
        serde_json::from_str(&a.create_version("Before").unwrap()).unwrap();
    a.apply(&insert_transaction(5, "Ж😀")).unwrap();
    b.receive_update(&a.get_update().unwrap()).unwrap();
    a.restore_version(version["id"].as_str().unwrap()).unwrap();
    b.receive_update(&a.get_update().unwrap()).unwrap();
    assert_eq!(blocks(&a), blocks(&b));
    assert!(!a.export_json().contains("Ж😀"));
    let saved = a
        .version_manager
        .list_versions()
        .iter()
        .find(|v| matches!(v.version_type, gotipe_versioning::VersionType::AutoSave))
        .unwrap();
    assert!(String::from_utf8_lossy(&saved.state_vector).contains("Ж😀"));
}

#[test]
fn comments_and_review_proposals_are_stored_and_replicated() {
    let mut a = WasmEditor::with_default_schema(&simple_doc_json()).unwrap();
    let mut b = WasmEditor::with_default_schema(&simple_doc_json()).unwrap();
    a.enable_collaboration("a").unwrap();
    b.enable_collaboration("b").unwrap();
    let comment = gotipe_comments::Comment::new(
        "alice",
        "Check this",
        gotipe_comments::CommentAnchor::Document,
    );
    let id = a
        .add_comment(&serde_json::to_string(&comment).unwrap())
        .unwrap();
    b.receive_update(&a.get_update().unwrap()).unwrap();
    assert_eq!(a.get_comments().unwrap(), b.get_comments().unwrap());
    b.resolve_comment(&id).unwrap();
    a.receive_update(&b.get_update().unwrap()).unwrap();
    assert!(a.review.comments[&id].is_resolved());
    a.set_suggestion_mode(true);
    a.apply(&insert_transaction(5, "Ж😀")).unwrap();
    assert!(!a.export_json().contains("Ж😀"));
    b.receive_update(&a.get_update().unwrap()).unwrap();
    let proposal = a.review.proposals.keys().next().unwrap().clone();
    b.accept_suggestion(&proposal).unwrap();
    a.receive_update(&b.get_update().unwrap()).unwrap();
    assert_eq!(blocks(&a), blocks(&b));
    assert!(a.export_json().contains("Ж😀"));
}

#[test]
fn comment_anchors_follow_unicode_edits_and_split_without_collaboration() {
    use gotipe_comments::{Comment, CommentAnchor};
    let mut editor = WasmEditor::with_default_schema(&simple_doc_json()).unwrap();
    let comment = Comment::new(
        "alice",
        "World",
        CommentAnchor::Inline {
            block_id: gotipe_core::BlockId("b1".into()),
            from: 6,
            to: 11,
        },
    );
    editor
        .add_comment(&serde_json::to_string(&comment).unwrap())
        .unwrap();
    editor.apply(&insert_transaction(0, "Ж😀")).unwrap();
    let comments: Vec<Comment> = serde_json::from_str(&editor.get_comments().unwrap()).unwrap();
    assert!(matches!(
        comments[0].anchor,
        CommentAnchor::Inline {
            from: 9,
            to: 14,
            ..
        }
    ));
    let split = Transaction::new().with_step(gotipe_core::Step::SplitBlock {
        block_id: gotipe_core::BlockId("b1".into()),
        offset: 9,
    });
    editor
        .apply(&serde_json::to_string(&split).unwrap())
        .unwrap();
    let comments: Vec<Comment> = serde_json::from_str(&editor.get_comments().unwrap()).unwrap();
    assert!(
        matches!(&comments[0].anchor, CommentAnchor::Inline { block_id, from:0, to:5 } if *block_id == editor.state.doc().blocks[1].id)
    );
    editor.enable_collaboration("a").unwrap();
    let comments: Vec<Comment> = serde_json::from_str(&editor.get_comments().unwrap()).unwrap();
    assert!(matches!(
        comments[0].anchor,
        CommentAnchor::Inline { from: 0, to: 5, .. }
    ));
}

#[test]
fn comment_anchor_can_span_both_sides_of_a_split() {
    use gotipe_comments::{Comment, CommentAnchor};
    let mut editor = WasmEditor::with_default_schema(&simple_doc_json()).unwrap();
    let comment = Comment::new(
        "alice",
        "crossing",
        CommentAnchor::Inline {
            block_id: gotipe_core::BlockId("b1".into()),
            from: 2,
            to: 8,
        },
    );
    editor
        .add_comment(&serde_json::to_string(&comment).unwrap())
        .unwrap();
    let split = Transaction::new().with_step(gotipe_core::Step::SplitBlock {
        block_id: gotipe_core::BlockId("b1".into()),
        offset: 5,
    });
    editor
        .apply(&serde_json::to_string(&split).unwrap())
        .unwrap();
    let comments: Vec<Comment> = serde_json::from_str(&editor.get_comments().unwrap()).unwrap();
    assert!(matches!(
        comments[0].anchor,
        CommentAnchor::Range {
            from_offset: 2,
            to_offset: 3,
            ..
        }
    ));
}

#[test]
fn collaboration_undo_preserves_remote_edits_and_redo_replicates() {
    let mut a = WasmEditor::with_default_schema(&simple_doc_json()).unwrap();
    let mut b = WasmEditor::with_default_schema(&simple_doc_json()).unwrap();
    a.enable_collaboration("a").unwrap();
    b.enable_collaboration("b").unwrap();
    a.apply(&insert_transaction(5, "localX")).unwrap();
    b.apply(&insert_transaction(5, "remoteY")).unwrap();
    let ua = a.get_update().unwrap();
    let ub = b.get_update().unwrap();
    a.receive_update(&ub).unwrap();
    b.receive_update(&ua).unwrap();
    assert!(a.can_undo_collaboration());
    a.undo_collaboration().unwrap().unwrap();
    assert!(!a.export_json().contains("localX"));
    assert!(a.export_json().contains("remoteY"));
    b.receive_update(&a.get_update().unwrap()).unwrap();
    assert_eq!(blocks(&a), blocks(&b));
    assert!(a.can_redo_collaboration());
    a.redo_collaboration().unwrap().unwrap();
    b.receive_update(&a.get_update().unwrap()).unwrap();
    assert_eq!(blocks(&a), blocks(&b));
    assert!(a.export_json().contains("localX"));
    assert!(a.export_json().contains("remoteY"));
}

#[test]
fn collaboration_history_restores_directional_selection_and_clear_keeps_log() {
    let mut doc: Document = serde_json::from_str(&simple_doc_json()).unwrap();
    let mut second = doc.blocks[0].clone();
    second.id = gotipe_core::BlockId("b2".into());
    doc.blocks.push(second);
    let mut editor =
        WasmEditor::with_default_schema(&serde_json::to_string(&doc).unwrap()).unwrap();
    editor.enable_collaboration("a").unwrap();
    let selection = serde_json::json!({"Range": {
        "anchor": {"block_id":"b2", "offset":8},
        "head": {"block_id":"b1", "offset":3}
    }});
    editor.set_selection(&selection.to_string()).unwrap();
    editor.apply(&insert_transaction(1, "X")).unwrap();
    editor.undo_collaboration().unwrap().unwrap();
    let restored: serde_json::Value =
        serde_json::from_str(&editor.export_selection().unwrap()).unwrap();
    assert_eq!(restored, selection);
    editor.redo_collaboration().unwrap().unwrap();
    let log = editor.get_update().unwrap();
    editor.clear_collaboration_history();
    assert!(!editor.can_undo_collaboration());
    assert!(!editor.can_redo_collaboration());
    assert_eq!(editor.get_update().unwrap(), log);
}

#[test]
fn batched_structural_edits_keep_concurrent_text_in_the_transferred_block() {
    use gotipe_core::{BlockId, Mark, Step};
    let mut a = WasmEditor::with_default_schema(&simple_doc_json()).unwrap();
    let mut b = WasmEditor::with_default_schema(&simple_doc_json()).unwrap();
    a.enable_collaboration("a").unwrap();
    b.enable_collaboration("b").unwrap();
    let transaction = Transaction::new()
        .with_step(Step::SplitBlock {
            block_id: BlockId("b1".into()),
            offset: 5,
        })
        .with_step(Step::AddMark {
            block_id: BlockId("b1".into()),
            from: 0,
            to: 5,
            mark: Mark::new("bold"),
        });
    a.apply(&serde_json::to_string(&transaction).unwrap())
        .unwrap();
    b.apply(&insert_transaction(8, "Ж😀")).unwrap();
    let ua = a.get_update().unwrap();
    a.receive_update(&b.get_update().unwrap()).unwrap();
    b.receive_update(&ua).unwrap();
    assert_eq!(blocks(&a), blocks(&b));
    let second = &a.state.doc().blocks[1];
    assert_eq!(
        gotipe_core::clipboard::block_to_plain_text(second),
        " WoЖ😀rld"
    );

    let second_id = second.id.clone();
    let transaction = Transaction::new()
        .with_step(Step::MergeBlocks {
            block_id: second_id.clone(),
            target_id: BlockId("b1".into()),
        })
        .with_step(Step::InsertText {
            block_id: BlockId("b1".into()),
            offset: 0,
            text: "!".into(),
            marks: vec![],
        });
    a.apply(&serde_json::to_string(&transaction).unwrap())
        .unwrap();
    let remote = Transaction::new().with_step(Step::InsertText {
        block_id: second_id,
        offset: 0,
        text: "remote".into(),
        marks: vec![],
    });
    b.apply(&serde_json::to_string(&remote).unwrap()).unwrap();
    let ua = a.get_update().unwrap();
    a.receive_update(&b.get_update().unwrap()).unwrap();
    b.receive_update(&ua).unwrap();
    assert_eq!(blocks(&a), blocks(&b));
    assert!(a.export_json().contains("remote"));
    assert_eq!(a.state.doc().blocks.len(), 1);
}

#[test]
fn remote_insert_before_caret_and_history_bookmarks_follow_character_ids() {
    let mut a = WasmEditor::with_default_schema(&simple_doc_json()).unwrap();
    let mut b = WasmEditor::with_default_schema(&simple_doc_json()).unwrap();
    a.enable_collaboration("a").unwrap();
    b.enable_collaboration("b").unwrap();
    a.set_selection(r#"{"Cursor":{"block_id":"b1","offset":5}}"#)
        .unwrap();
    a.apply(&insert_transaction(5, "local")).unwrap();
    b.apply(&insert_transaction(0, "Ж😀")).unwrap();
    a.receive_update(&b.get_update().unwrap()).unwrap();
    assert_eq!(a.state.selection().as_cursor().unwrap().1, 13);
    a.undo_collaboration().unwrap();
    assert_eq!(a.state.selection().as_cursor().unwrap().1, 8);
    a.redo_collaboration().unwrap();
    assert_eq!(a.state.selection().as_cursor().unwrap().1, 13);
}
