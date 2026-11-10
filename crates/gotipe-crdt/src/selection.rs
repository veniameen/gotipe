//! Selection bookmarks resolve against character identities after remote edits.
use crate::{replica::TextAnchor, CrdtDocument};
use gotipe_core::{Selection, TextPosition};
#[derive(Debug, Clone)]
pub struct SelectionBookmark {
    pub selection: Selection,
    points: Vec<Option<TextAnchor>>,
}
impl SelectionBookmark {
    pub fn fallback(selection: Selection) -> Self {
        Self {
            selection,
            points: vec![],
        }
    }
    pub fn capture(doc: &CrdtDocument, selection: &Selection) -> Self {
        let point = |id, offset| doc.text_anchor(id, offset, true);
        let points = match selection {
            Selection::Cursor { block_id, offset } => vec![point(block_id, *offset)],
            Selection::Text { block_id, from, to } => {
                vec![point(block_id, *from), point(block_id, *to)]
            }
            Selection::Range { anchor, head } => vec![
                point(&anchor.block_id, anchor.offset),
                point(&head.block_id, head.offset),
            ],
            _ => vec![],
        };
        Self {
            selection: selection.clone(),
            points,
        }
    }
    pub fn resolve(&self, doc: &CrdtDocument) -> Selection {
        let point = |index: usize| {
            self.points
                .get(index)
                .and_then(Option::as_ref)
                .and_then(|a| doc.resolve_anchor(a))
        };
        let selection = match (&self.selection, point(0), point(1)) {
            (Selection::Cursor { .. }, Some((id, offset)), _) => Selection::cursor(id, offset),
            (Selection::Text { .. }, Some((anchor_id, from)), Some((head_id, to)))
                if anchor_id == head_id =>
            {
                Selection::text(anchor_id, from.min(to), from.max(to))
            }
            (
                Selection::Text { .. } | Selection::Range { .. },
                Some((block_id, offset)),
                Some((head_id, head_offset)),
            ) => Selection::Range {
                anchor: TextPosition { block_id, offset },
                head: TextPosition {
                    block_id: head_id,
                    offset: head_offset,
                },
            },
            _ => self.selection.clone(),
        };
        selection.recover_in(&doc.to_document())
    }
}
