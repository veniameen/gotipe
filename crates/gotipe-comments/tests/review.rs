use gotipe_comments::{store::ReviewStore, Comment, CommentAnchor, SuggestionStatus};
use gotipe_core::{
    defaults, Block, BlockContent, BlockId, Document, EditorState, Step, TextSpan, Transaction,
};
fn state() -> EditorState {
    let mut block = Block::new_with_type(
        "paragraph",
        BlockContent::RichText(vec![TextSpan {
            text: "Ж😀".into(),
            marks: vec![],
        }]),
    );
    block.id = BlockId("a".into());
    EditorState::new(
        Document {
            blocks: vec![block],
            version: 0,
        },
        defaults::default_block_editor(),
    )
}
fn insert(offset: usize) -> Transaction {
    Transaction::new().with_step(Step::InsertText {
        block_id: BlockId("a".into()),
        offset,
        text: "!".into(),
        marks: vec![],
    })
}
#[test]
fn comments_validate_unicode_anchors_and_reply_identity() {
    let state = state();
    let mut review = ReviewStore::default();
    let mut comment = Comment::new(
        "a",
        "Review",
        CommentAnchor::Inline {
            block_id: BlockId("a".into()),
            from: 1,
            to: 2,
        },
    );
    assert!(review.add_comment(comment.clone(), state.doc()).is_err());
    comment.anchor = CommentAnchor::Inline {
        block_id: BlockId("a".into()),
        from: 1,
        to: 3,
    };
    let id = review.add_comment(comment.clone(), state.doc()).unwrap();
    assert!(review.add_comment(comment, state.doc()).is_err());
    review.resolve(&id, "b").unwrap();
    assert!(review.comments[&id].is_resolved());
    review.reopen(&id).unwrap();
    assert!(!review.comments[&id].is_resolved());
    assert!(review.resolve("missing", "b").is_err());
}
#[test]
fn proposals_only_change_document_on_acceptance_and_reject_stale_edits() {
    let state = state();
    let mut review = ReviewStore::default();
    let id = review.propose(&state, insert(3)).unwrap();
    assert_eq!(state.doc().blocks[0].text_length(), 3);
    let accepted = review.accept(&id, &state).unwrap();
    assert_eq!(accepted.doc().blocks[0].text_length(), 4);
    assert_eq!(
        review.proposals[&id].suggestion.status,
        SuggestionStatus::Accepted
    );
    assert!(review.accept(&id, &accepted).is_err());
    let stale = review.propose(&state, insert(0)).unwrap();
    assert!(review.accept(&stale, &accepted).is_err());
    assert!(review.proposals[&stale].suggestion.is_pending());
    review.reject(&stale).unwrap();
    assert_eq!(
        review.proposals[&stale].suggestion.status,
        SuggestionStatus::Rejected
    );
}
