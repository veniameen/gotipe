use std::collections::HashMap;

use gotipe_schema::{
    atoms::with_inline_atoms, defaults, AttrValue, Block, BlockContent, BlockId, Document, Mark,
    TextSpan,
};

use super::*;
use crate::{EditorState, Transaction};

fn mention(id: &str, key: Option<&str>) -> Mark {
    let mut attrs = HashMap::from([
        ("id".to_string(), AttrValue::String(id.into())),
        ("label".to_string(), AttrValue::String("Анна".into())),
        ("kind".to_string(), AttrValue::String("user".into())),
    ]);
    if let Some(key) = key {
        attrs.insert("key".into(), AttrValue::String(key.into()));
    }
    Mark {
        mark_type: "mention".into(),
        attrs,
    }
}

fn span(text: &str, marks: Vec<Mark>) -> TextSpan {
    TextSpan {
        text: text.into(),
        marks,
    }
}

fn id() -> BlockId {
    BlockId("b".into())
}

/// "Привет " + mention "@Анна😀" (UTF-16 7..14) + " и всё".
fn state_with(spans: Vec<TextSpan>) -> EditorState {
    let doc = Document {
        version: 0,
        blocks: vec![Block {
            id: id(),
            block_type: "paragraph".into(),
            attrs: HashMap::new(),
            content: BlockContent::RichText(spans),
            children: vec![],
        }],
    };
    EditorState::new(doc, with_inline_atoms(defaults::default_block_editor()))
}

fn state() -> EditorState {
    state_with(vec![
        span("Привет ", vec![]),
        span("@Анна😀", vec![mention("42", None)]),
        span(" и всё", vec![]),
    ])
}

fn spans(state: &EditorState) -> Vec<TextSpan> {
    match &state.doc().blocks[0].content {
        BlockContent::RichText(spans) => spans.clone(),
        _ => panic!("rich text"),
    }
}

fn text(state: &EditorState) -> String {
    spans(state).iter().map(|span| span.text.as_str()).collect()
}

fn apply(state: &EditorState, step: Step) -> Result<EditorState, crate::TransformError> {
    state.apply(Transaction::new().with_step(step))
}

#[test]
fn atoms_are_maximal_runs_and_a_key_separates_equal_neighbours() {
    let schema = with_inline_atoms(defaults::default_block_editor());
    let spans = vec![
        span("a", vec![]),
        span("@А", vec![mention("1", None)]),
        span("нна", vec![Mark::new("bold"), mention("1", None)]),
        span("@Б", vec![mention("1", Some("2"))]),
        span("x", vec![Mark::new("bold")]),
    ];
    assert_eq!(atom_ranges(&spans, &schema), vec![1..6, 6..8]);
    let plain = defaults::default_block_editor();
    assert!(atom_ranges(&spans, &plain).is_empty());
}

#[test]
fn backspace_at_the_atom_end_removes_the_whole_atom_and_records_it() {
    let state = state();
    // The last code unit of the emoji: an offset inside the surrogate pair.
    let next = apply(
        &state,
        Step::DeleteText {
            block_id: id(),
            from: 13,
            to: 14,
        },
    )
    .unwrap();
    assert_eq!(text(&next), "Привет  и всё");
    assert!(matches!(
        next.last_steps(),
        [Step::DeleteText {
            from: 7,
            to: 14,
            ..
        }]
    ));
}

#[test]
fn a_deletion_across_an_atom_edge_grows_to_the_atom() {
    let next = apply(
        &state(),
        Step::DeleteText {
            block_id: id(),
            from: 5,
            to: 9,
        },
    )
    .unwrap();
    assert_eq!(text(&next), "Приве и всё");
    let untouched = apply(
        &state(),
        Step::DeleteText {
            block_id: id(),
            from: 5,
            to: 7,
        },
    )
    .unwrap();
    assert_eq!(text(&untouched), "Приве@Анна😀 и всё");
}

#[test]
fn marks_on_part_of_an_atom_cover_the_whole_atom() {
    let bold = apply(
        &state(),
        Step::AddMark {
            block_id: id(),
            from: 9,
            to: 15,
            mark: Mark::new("bold"),
        },
    )
    .unwrap();
    let bold = spans(&bold);
    assert_eq!(bold[1].text, "@Анна😀");
    assert_eq!(bold[1].marks, vec![mention("42", None), Mark::new("bold")]);
    let removed = apply(
        &state(),
        Step::RemoveMark {
            block_id: id(),
            from: 8,
            to: 9,
            mark_type: "mention".into(),
        },
    )
    .unwrap();
    let removed = spans(&removed);
    assert_eq!(removed.len(), 1);
    assert_eq!(removed[0].text, "Привет @Анна😀 и всё");
    assert!(removed[0].marks.is_empty());
}

#[test]
fn text_and_splits_inside_an_atom_go_to_the_nearer_edge() {
    let start = apply(
        &state(),
        Step::InsertText {
            block_id: id(),
            offset: 8,
            text: "Ж".into(),
            marks: vec![mention("42", None)],
        },
    )
    .unwrap();
    // The typed text joins the atom only by its marks, never by splitting it.
    assert_eq!(text(&start), "Привет Ж@Анна😀 и всё");
    assert!(matches!(
        start.last_steps(),
        [Step::InsertText { offset: 7, .. }]
    ));
    let plain = apply(
        &state(),
        Step::InsertText {
            block_id: id(),
            offset: 11,
            text: "!".into(),
            marks: vec![],
        },
    )
    .unwrap();
    assert_eq!(text(&plain), "Привет @Анна😀! и всё");
    // Offset 4 is as far from 2 as from 6: a tie goes to the end.
    let tie = apply(
        &state_with(vec![
            span("ab", vec![]),
            span("@Аня", vec![mention("7", None)]),
        ]),
        Step::SplitBlock {
            block_id: id(),
            offset: 4,
        },
    )
    .unwrap();
    assert_eq!(text(&tie), "ab@Аня");
    let split = apply(
        &state(),
        Step::SplitBlock {
            block_id: id(),
            offset: 12,
        },
    )
    .unwrap();
    assert_eq!(split.doc().blocks.len(), 2);
    assert_eq!(text(&split), "Привет @Анна😀");
}

#[test]
fn a_surrogate_split_outside_an_atom_still_fails() {
    let state = state_with(vec![
        span("😀", vec![]),
        span("@Анна", vec![mention("42", None)]),
    ]);
    assert!(apply(
        &state,
        Step::InsertText {
            block_id: id(),
            offset: 1,
            text: "x".into(),
            marks: vec![],
        },
    )
    .is_err());
    let ok = apply(
        &state,
        Step::InsertText {
            block_id: id(),
            offset: 3,
            text: "x".into(),
            marks: vec![],
        },
    )
    .unwrap();
    assert_eq!(text(&ok), "😀x@Анна");
}

#[test]
fn neighbouring_atoms_with_different_keys_stay_apart() {
    let state = state_with(vec![
        span("@Анна", vec![mention("42", None)]),
        span("@Анна", vec![mention("42", Some("2"))]),
    ]);
    let next = apply(
        &state,
        Step::DeleteText {
            block_id: id(),
            from: 4,
            to: 5,
        },
    )
    .unwrap();
    assert_eq!(text(&next), "@Анна");
    assert_eq!(spans(&next)[0].marks, vec![mention("42", Some("2"))]);
}

#[test]
fn selections_snap_in_the_direction_of_movement() {
    let state = state().with_selection(Selection::cursor(id(), 7));
    let forward = state
        .clone()
        .with_valid_selection(Selection::cursor(id(), 8))
        .unwrap();
    assert!(matches!(
        forward.selection(),
        Selection::Cursor { offset: 14, .. }
    ));
    let backward = forward
        .clone()
        .with_valid_selection(Selection::cursor(id(), 12))
        .unwrap();
    assert!(matches!(
        backward.selection(),
        Selection::Cursor { offset: 7, .. }
    ));
    let range = backward
        .with_valid_selection(Selection::Range {
            anchor: TextPosition {
                block_id: id(),
                offset: 2,
            },
            head: TextPosition {
                block_id: id(),
                offset: 9,
            },
        })
        .unwrap();
    match range.selection() {
        Selection::Range { anchor, head } => {
            assert_eq!((anchor.offset, head.offset), (2, 14));
        }
        other => panic!("{other:?}"),
    }
    let explicit = state
        .apply(Transaction::new().with_selection(Selection::cursor(id(), 9)))
        .unwrap();
    assert!(matches!(
        explicit.selection(),
        Selection::Cursor { offset: 14, .. }
    ));
}

#[test]
fn a_schema_without_atomic_marks_leaves_steps_untouched() {
    // The same marks, declared without `atomic`.
    let mut schema = with_inline_atoms(defaults::default_block_editor());
    for spec in schema.marks.values_mut() {
        spec.atomic = false;
    }
    let plain = EditorState::new(state().doc().clone(), schema);
    let next = apply(
        &plain,
        Step::DeleteText {
            block_id: id(),
            from: 13,
            to: 14,
        },
    );
    // Without atoms the same offset splits the emoji's surrogate pair.
    assert!(next.is_err());
    let next = apply(
        &plain,
        Step::DeleteText {
            block_id: id(),
            from: 8,
            to: 9,
        },
    )
    .unwrap();
    assert_eq!(text(&next), "Привет @нна😀 и всё");
    assert!(matches!(
        next.last_steps(),
        [Step::DeleteText { from: 8, to: 9, .. }]
    ));
}

#[test]
fn a_caret_after_a_range_moves_from_the_previous_head_as_in_the_editor() {
    // Anchor before the atom, head after it: a click inside goes back from the head.
    let previous = Selection::Range {
        anchor: TextPosition {
            block_id: id(),
            offset: 2,
        },
        head: TextPosition {
            block_id: id(),
            offset: 16,
        },
    };
    let state = state();
    let snapped = snap_selection(
        Selection::cursor(id(), 9),
        Some(&previous),
        state.doc(),
        state.schema(),
    );
    assert_eq!(snapped.as_cursor(), Some((&id(), 7)));
}

#[test]
fn a_range_within_one_atom_selects_the_whole_atom_in_its_direction() {
    let state = state();
    let range = |anchor, head| Selection::Range {
        anchor: TextPosition {
            block_id: id(),
            offset: anchor,
        },
        head: TextPosition {
            block_id: id(),
            offset: head,
        },
    };
    let offsets = |selection: Selection| match selection {
        Selection::Range { anchor, head } => (anchor.offset, head.offset),
        other => panic!("{other:?}"),
    };
    let snap = |selection| snap_selection(selection, None, state.doc(), state.schema());
    assert_eq!(offsets(snap(range(8, 10))), (7, 14));
    assert_eq!(offsets(snap(range(10, 7))), (14, 7));
    // A range reaching outside the atom keeps its outer end.
    assert_eq!(offsets(snap(range(2, 10))), (2, 7));
}
