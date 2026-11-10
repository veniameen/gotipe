use gotipe_core::{
    defaults, AttrValue, Block, BlockContent, BlockId, ContentRule, Document, EditorState, Mark,
    Selection, Step, TextSpan, Transaction, TransformError,
};
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
fn doc(blocks: Vec<Block>) -> Document {
    Document { blocks, version: 0 }
}
fn plain(block: &Block) -> String {
    match &block.content {
        BlockContent::RichText(spans) => spans.iter().map(|span| span.text.as_str()).collect(),
        BlockContent::Raw(text) => text.clone(),
        BlockContent::Empty => String::new(),
    }
}
fn insert(id: &str, offset: usize, text: &str) -> Step {
    Step::InsertText {
        block_id: BlockId(id.into()),
        offset,
        text: text.into(),
        marks: vec![],
    }
}
fn convert(id: &str, to: &str) -> Step {
    Step::SetBlockType {
        block_id: BlockId(id.into()),
        new_type: to.into(),
        attrs: HashMap::new(),
    }
}

#[test]
fn every_unicode_boundary_inserts_and_deletes_in_dom_coordinates() {
    let text = "Ж😀é中e\u{301}";
    for raw in [false, true] {
        let mut original = block("a", text);
        if raw {
            original.block_type = "codeBlock".into();
            original.content = BlockContent::Raw(text.into());
        }
        assert_eq!(original.text_length(), 7);
        let mut units = 0;
        for (byte, ch) in text.char_indices() {
            let edited = insert("a", units, "🦀")
                .apply(doc(vec![original.clone()]))
                .unwrap();
            assert_eq!(
                plain(&edited.blocks[0]),
                format!("{}🦀{}", &text[..byte], &text[byte..])
            );
            let deleted = Step::DeleteText {
                block_id: original.id.clone(),
                from: units,
                to: units + ch.len_utf16(),
            }
            .apply(doc(vec![original.clone()]))
            .unwrap();
            assert_eq!(
                plain(&deleted.blocks[0]),
                format!("{}{}", &text[..byte], &text[byte + ch.len_utf8()..])
            );
            units += ch.len_utf16();
        }
        let edited = insert("a", units, "!").apply(doc(vec![original])).unwrap();
        assert_eq!(plain(&edited.blocks[0]), format!("{text}!"));
    }
}

#[test]
fn invalid_utf16_ranges_return_errors_without_panicking() {
    let id = BlockId("a".into());
    for raw in [false, true] {
        let mut original = block("a", "Ж😀a");
        if raw {
            original.content = BlockContent::Raw("Ж😀a".into());
        }
        for offset in [2, 5, usize::MAX] {
            assert!(matches!(
                insert("a", offset, "!").apply(doc(vec![original.clone()])),
                Err(TransformError::OffsetOutOfRange)
            ));
            assert!(Step::SplitBlock {
                block_id: id.clone(),
                offset
            }
            .apply(doc(vec![original.clone()]))
            .is_err());
        }
        for (from, to) in [(1, 2), (2, 3), (0, 5), (3, 1), (5, 5)] {
            assert!(Step::DeleteText {
                block_id: id.clone(),
                from,
                to
            }
            .apply(doc(vec![original.clone()]))
            .is_err());
            assert!(Step::AddMark {
                block_id: id.clone(),
                from,
                to,
                mark: Mark::new("bold")
            }
            .apply(doc(vec![original.clone()]))
            .is_err());
            assert!(Step::RemoveMark {
                block_id: id.clone(),
                from,
                to,
                mark_type: "bold".into()
            }
            .apply(doc(vec![original.clone()]))
            .is_err());
        }
    }
    assert!(insert("a", 1, "!")
        .apply(doc(vec![block("a", "")]))
        .is_err());
}

#[test]
fn unicode_mark_ranges_and_splits_preserve_content() {
    let original = doc(vec![block("a", "Ж😀я")]);
    let marked = Step::AddMark {
        block_id: BlockId("a".into()),
        from: 1,
        to: 3,
        mark: Mark::new("bold"),
    }
    .apply(original)
    .unwrap();
    let BlockContent::RichText(spans) = &marked.blocks[0].content else {
        panic!()
    };
    assert_eq!(spans.len(), 3);
    assert_eq!(spans[1].text, "😀");
    assert_eq!(spans[1].marks[0].mark_type, "bold");
    let split = Step::SplitBlock {
        block_id: BlockId("a".into()),
        offset: 3,
    }
    .apply(marked)
    .unwrap();
    assert_eq!(plain(&split.blocks[0]), "Ж😀");
    assert_eq!(plain(&split.blocks[1]), "я");
    let unmarked = Step::RemoveMark {
        block_id: BlockId("a".into()),
        from: 1,
        to: 3,
        mark_type: "bold".into(),
    }
    .apply(split)
    .unwrap();
    let BlockContent::RichText(spans) = &unmarked.blocks[0].content else {
        panic!()
    };
    assert_eq!(spans.len(), 1);
    assert!(spans[0].marks.is_empty());
}

#[test]
fn transaction_validates_against_each_intermediate_document_and_rolls_back() {
    let state = EditorState::new(doc(vec![block("a", "Ж")]), defaults::default_block_editor());
    let tr = Transaction::new()
        .with_step(Step::InsertBlock {
            parent_id: None,
            index: 1,
            block: block("new", "😀"),
        })
        .with_step(Step::AddMark {
            block_id: BlockId("new".into()),
            from: 0,
            to: 2,
            mark: Mark::new("bold"),
        });
    assert_eq!(state.apply(tr).unwrap().doc().blocks.len(), 2);
    let failing = Transaction::new()
        .with_step(insert("a", 1, "!"))
        .with_step(insert("missing", 0, "fail"));
    assert!(state.apply(failing).is_err());
    assert_eq!(plain(&state.doc().blocks[0]), "Ж");
    assert_eq!(state.doc().version, 0);
    let converted = Transaction::new()
        .with_step(convert("a", "codeBlock"))
        .with_step(Step::AddMark {
            block_id: BlockId("a".into()),
            from: 0,
            to: 1,
            mark: Mark::new("bold"),
        });
    assert!(state.apply(converted).is_err());
}

#[test]
fn delete_range_wire_alias_is_a_text_deletion() {
    let step: Step =
        serde_json::from_str(r#"{"DeleteRange":{"block_id":"a","from":1,"to":3}}"#).unwrap();
    assert!(matches!(step, Step::DeleteText { .. }));
    assert_eq!(
        plain(&step.apply(doc(vec![block("a", "Ж😀я")])).unwrap().blocks[0]),
        "Жя"
    );
}

#[test]
fn conversions_follow_schema_content_rules_and_keep_unicode() {
    let state = EditorState::new(
        doc(vec![block("a", "Ж😀")]),
        defaults::default_block_editor(),
    );
    let raw = state
        .apply(Transaction::new().with_step(convert("a", "codeBlock")))
        .unwrap();
    assert!(matches!(&raw.doc().blocks[0].content, BlockContent::Raw(text) if text == "Ж😀"));
    let rich = raw
        .apply(Transaction::new().with_step(convert("a", "paragraph")))
        .unwrap();
    assert!(matches!(
        rich.doc().blocks[0].content,
        BlockContent::RichText(_)
    ));
    assert_eq!(plain(&rich.doc().blocks[0]), "Ж😀");
    let empty = rich
        .apply(Transaction::new().with_step(convert("a", "divider")))
        .unwrap();
    assert!(matches!(empty.doc().blocks[0].content, BlockContent::Empty));
    let mut schema = defaults::default_block_editor();
    let mut custom = schema.nodes["paragraph"].clone();
    custom.name = "customRaw".into();
    custom.content = ContentRule::RawText;
    schema.nodes.insert("customRaw".into(), custom);
    let state = EditorState::new(doc(vec![block("a", "Ж😀")]), schema);
    let custom = state
        .apply(Transaction::new().with_step(convert("a", "customRaw")))
        .unwrap();
    assert!(matches!(&custom.doc().blocks[0].content, BlockContent::Raw(text) if text == "Ж😀"));
}

#[test]
fn empty_text_blocks_accept_typing_and_splitting_but_empty_leaf_nodes_reject_it() {
    for kind in ["paragraph", "codeBlock", "math"] {
        let mut original = block("a", "");
        original.block_type = kind.into();
        original.content = BlockContent::Empty;
        let edited = insert("a", 0, "Ж😀")
            .apply(doc(vec![original.clone()]))
            .unwrap();
        assert_eq!(plain(&edited.blocks[0]), "Ж😀");
        let split = Step::SplitBlock {
            block_id: original.id.clone(),
            offset: 0,
        }
        .apply(doc(vec![original]))
        .unwrap();
        assert_eq!(split.blocks.len(), 2);
    }
    let mut leaf = block("a", "");
    leaf.block_type = "divider".into();
    leaf.content = BlockContent::Empty;
    assert!(insert("a", 0, "bad").apply(doc(vec![leaf])).is_err());
}

#[test]
fn merge_keeps_source_children_and_rejects_cycles_and_incompatible_content() {
    let mut source = block("source", "😀");
    source.children.push(block("nested", "kept"));
    let mut target = block("target", "Ж");
    target.children.push(block("existing", "also kept"));
    let original = doc(vec![target, source]);
    let merged = Step::MergeBlocks {
        block_id: BlockId("source".into()),
        target_id: BlockId("target".into()),
    }
    .apply(original.clone())
    .unwrap();
    assert_eq!(plain(&merged.blocks[0]), "Ж😀");
    assert_eq!(merged.blocks[0].children.len(), 2);
    assert_eq!(merged.blocks[0].children[1].id.0, "nested");
    for (source, target) in [
        ("source", "nested"),
        ("nested", "source"),
        ("source", "source"),
    ] {
        assert!(Step::MergeBlocks {
            block_id: BlockId(source.into()),
            target_id: BlockId(target.into())
        }
        .apply(original.clone())
        .is_err());
    }
    let mut raw = block("raw", "");
    raw.content = BlockContent::Raw("raw".into());
    assert!(Step::MergeBlocks {
        block_id: raw.id.clone(),
        target_id: BlockId("rich".into())
    }
    .apply(doc(vec![block("rich", "rich"), raw]))
    .is_err());
}

#[test]
fn moving_a_parent_into_itself_or_descendant_is_rejected() {
    let mut parent = block("parent", "");
    parent.children.push(block("child", ""));
    let state = EditorState::new(doc(vec![parent]), defaults::default_block_editor());
    for destination in ["parent", "child", "missing"] {
        let step = Step::MoveBlock {
            block_id: BlockId("parent".into()),
            new_parent_id: Some(BlockId(destination.into())),
            new_index: 0,
        };
        assert!(state.apply(Transaction::new().with_step(step)).is_err());
        assert!(state.doc().find_block(&BlockId("child".into())).is_some());
    }
}

#[test]
fn split_keeps_code_language_and_changes_heading_continuation_to_paragraph() {
    let mut raw = block("a", "");
    raw.block_type = "codeBlock".into();
    raw.content = BlockContent::Raw("Ж😀я".into());
    raw.attrs
        .insert("language".into(), AttrValue::String("rust".into()));
    let split = Step::SplitBlock {
        block_id: raw.id.clone(),
        offset: 3,
    }
    .apply(doc(vec![raw]))
    .unwrap();
    assert_eq!(plain(&split.blocks[0]), "Ж😀");
    assert_eq!(plain(&split.blocks[1]), "я");
    assert_eq!(
        split.blocks[1].attrs["language"],
        AttrValue::String("rust".into())
    );
    let mut heading = block("h", "Ж😀");
    heading.block_type = "heading".into();
    heading.attrs.insert("level".into(), AttrValue::Number(2.0));
    heading.children.push(block("child", "kept"));
    let split = Step::SplitBlock {
        block_id: heading.id.clone(),
        offset: 1,
    }
    .apply(doc(vec![heading]))
    .unwrap();
    assert_eq!(split.blocks[1].block_type, "paragraph");
    assert!(split.blocks[1].attrs.is_empty());
    assert_eq!(split.blocks[0].children.len(), 1);
    assert!(split.blocks[1].children.is_empty());
}

#[test]
fn cursor_and_text_selection_offsets_count_utf16_units() {
    let id = BlockId("a".into());
    let selection = Selection::cursor(id.clone(), 1).map_through(&[insert("a", 1, "Ж😀")]);
    assert_eq!(selection.as_cursor(), Some((&id, 4)));
    let selection = Selection::text(id.clone(), 1, 2).map_through(&[insert("a", 1, "Ж😀")]);
    assert_eq!(selection.as_text(), Some((&id, 4, 5)));
}

#[test]
fn merging_an_empty_paragraph_preserves_text() {
    for reverse in [false, true] {
        let mut empty = block("empty", "");
        empty.content = BlockContent::Empty;
        let (source, target) = if reverse {
            ("rich", "empty")
        } else {
            ("empty", "rich")
        };
        let merged = Step::MergeBlocks {
            block_id: BlockId(source.into()),
            target_id: BlockId(target.into()),
        }
        .apply(doc(vec![empty, block("rich", "Ж😀")]))
        .unwrap();
        assert_eq!(merged.blocks.len(), 1);
        assert_eq!(plain(&merged.blocks[0]), "Ж😀");
    }
}

#[test]
fn selection_follows_split_merge_and_deleted_parent_without_invalid_ids() {
    let state = EditorState::new(
        doc(vec![block("a", "Ж😀я")]),
        defaults::default_block_editor(),
    )
    .with_selection(Selection::cursor(BlockId("a".into()), 3));
    let split = state
        .apply(Transaction::new().with_step(Step::SplitBlock {
            block_id: BlockId("a".into()),
            offset: 1,
        }))
        .unwrap();
    let next_id = split.doc().blocks[1].id.clone();
    assert_eq!(split.selection().as_cursor(), Some((&next_id, 2)));
    let merged = split
        .apply(Transaction::new().with_step(Step::MergeBlocks {
            block_id: next_id,
            target_id: BlockId("a".into()),
        }))
        .unwrap();
    assert_eq!(
        merged.selection().as_cursor(),
        Some((&BlockId("a".into()), 3))
    );
    let deleted = merged
        .apply(Transaction::new().with_step(Step::DeleteBlock {
            block_id: BlockId("a".into()),
        }))
        .unwrap();
    assert!(matches!(deleted.selection(), Selection::Multi { block_ids } if block_ids.is_empty()));
    assert_eq!(deleted.selection().block_id().0, "");
}

#[test]
fn duplicate_ids_in_inserted_subtrees_are_rejected_atomically() {
    let state = EditorState::new(
        doc(vec![block("a", "kept")]),
        defaults::default_block_editor(),
    );
    let mut subtree = block("new", "");
    subtree.children.push(block("a", "collision"));
    let tr = Transaction::new().with_step(Step::InsertBlock {
        parent_id: None,
        index: 1,
        block: subtree,
    });
    assert!(state.apply(tr).is_err());
    assert_eq!(plain(&state.doc().blocks[0]), "kept");
    let mut subtree = block("new", "");
    subtree.children.push(block("new", "internal collision"));
    let tr = Transaction::new().with_step(Step::InsertBlock {
        parent_id: None,
        index: 1,
        block: subtree,
    });
    assert!(state.apply(tr).is_err());
}

#[test]
fn invalid_explicit_selection_rejects_the_whole_transaction() {
    let state = EditorState::new(
        doc(vec![block("a", "Ж😀")]),
        defaults::default_block_editor(),
    );
    for selection in [
        Selection::cursor(BlockId("a".into()), 2),
        Selection::cursor(BlockId("a".into()), 99),
        Selection::cursor(BlockId("missing".into()), 0),
    ] {
        let tr = Transaction::new()
            .with_step(insert("a", 3, "!"))
            .with_selection(selection);
        assert!(state.apply(tr).is_err());
        assert_eq!(plain(&state.doc().blocks[0]), "Ж😀");
    }
}

#[test]
fn directional_cross_block_selection_maps_both_unicode_endpoints() {
    use gotipe_core::TextPosition;
    let range = Selection::Range {
        anchor: TextPosition {
            block_id: BlockId("b".into()),
            offset: 2,
        },
        head: TextPosition {
            block_id: BlockId("a".into()),
            offset: 3,
        },
    };
    let state = EditorState::new(
        doc(vec![block("a", "Ж😀я"), block("b", "βb")]),
        defaults::default_block_editor(),
    )
    .with_valid_selection(range)
    .unwrap();
    let split = state
        .apply(Transaction::new().with_step(Step::SplitBlock {
            block_id: BlockId("a".into()),
            offset: 1,
        }))
        .unwrap();
    let split_id = split.doc().blocks[1].id.clone();
    let Selection::Range { anchor, head } = split.selection() else {
        panic!("range lost")
    };
    assert_eq!((&anchor.block_id.0, anchor.offset), (&"b".to_owned(), 2));
    assert_eq!((&head.block_id, head.offset), (&split_id, 2));
    let merged = split
        .apply(Transaction::new().with_step(Step::MergeBlocks {
            block_id: split_id,
            target_id: BlockId("a".into()),
        }))
        .unwrap();
    let Selection::Range { anchor, head } = merged.selection() else {
        panic!("range lost")
    };
    assert_eq!((&anchor.block_id.0, anchor.offset), (&"b".to_owned(), 2));
    assert_eq!((&head.block_id.0, head.offset), (&"a".to_owned(), 3));
    assert!(state
        .clone()
        .with_valid_selection(Selection::Range {
            anchor: anchor.clone(),
            head: TextPosition {
                block_id: BlockId("a".into()),
                offset: 2
            }
        })
        .is_err());
}

#[test]
fn native_clipboard_uses_utf16_and_list_toggle_keeps_nested_blocks() {
    use gotipe_core::command;
    for mut node in [block("a", "Ж😀я"), block("a", "")] {
        if node.text_length() == 0 {
            node.block_type = "codeBlock".into();
            node.content = BlockContent::Raw("Ж😀я".into());
        }
        let state = EditorState::new(doc(vec![node]), defaults::default_block_editor())
            .with_selection(Selection::text(BlockId("a".into()), 1, 3));
        assert_eq!(command::copy(&state).unwrap().plain_text, "😀");
        let invalid = state
            .clone()
            .with_selection(Selection::text(BlockId("a".into()), 2, 3));
        assert!(command::copy(&invalid).is_none());
    }
    let mut paragraph = block("a", "parent");
    paragraph.children.push(block("child", "nested"));
    let state = EditorState::new(doc(vec![paragraph]), defaults::default_block_editor());
    assert_eq!(
        gotipe_core::clipboard::block_to_plain_text(&state.doc().blocks[0]),
        "parent\nnested"
    );
    let wrapped = state
        .apply(command::toggle_bullet_list(&state).unwrap())
        .unwrap();
    let item = wrapped.doc().find_block(&BlockId("a".into())).unwrap();
    assert_eq!(item.block_type, "listItem");
    assert_eq!(item.children[0].id.0, "child");
    let unwrapped = wrapped
        .apply(command::toggle_bullet_list(&wrapped).unwrap())
        .unwrap();
    assert_eq!(unwrapped.doc().blocks.len(), 2);
    assert_eq!(unwrapped.doc().blocks[0].id.0, "a");
    assert_eq!(unwrapped.doc().blocks[1].id.0, "child");
}

#[test]
fn exhausted_document_revision_returns_an_error_without_panicking() {
    let doc = gotipe_core::Document {
        version: u64::MAX,
        blocks: vec![],
    };
    let result = gotipe_core::Step::InsertBlock {
        parent_id: None,
        index: 0,
        block: gotipe_core::Block::new_with_type(
            "paragraph",
            gotipe_core::BlockContent::RichText(vec![]),
        ),
    }
    .apply(doc);
    assert!(result.is_err());
}
