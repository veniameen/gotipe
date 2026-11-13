//! Mark commands over every rich-text block a selection covers, as the JavaScript
//! `MarkCommands` (`packages/core/src/commands/mark-commands.ts`) do. Lists, tables and
//! other blocks without their own text are passed over; their rows and cells are not.
//! A collapsed selection gives no transaction: stored marks belong to the view.
use gotipe_schema::{AttrValue, Block, BlockContent, BlockId, Mark, MarksRule};

use crate::selection::Selection;
use crate::state::EditorState;
use crate::transaction::{Step, Transaction};

struct TextRange<'a> {
    block: &'a Block,
    from: usize,
    to: usize,
}

/// Selected characters in blocks that may carry `mark_type` (any text for `None`).
fn selected_text<'a>(state: &'a EditorState, mark_type: Option<&str>) -> Vec<TextRange<'a>> {
    let accepts = |block: &Block| {
        matches!(block.content, BlockContent::RichText(_))
            && mark_type.is_none_or(|mark| accepts_mark(state, block, mark))
    };
    let whole = |block: &'a Block| TextRange {
        block,
        from: 0,
        to: block.text_length(),
    };
    let mut ranges = Vec::new();
    match state.selection() {
        Selection::Cursor { .. } => {}
        Selection::Block { block_id } => collect_selected(
            &state.doc().blocks,
            std::slice::from_ref(block_id),
            false,
            &mut ranges,
        ),
        Selection::Multi { block_ids } => {
            collect_selected(&state.doc().blocks, block_ids, false, &mut ranges)
        }
        Selection::Text { block_id, from, to } => {
            if let Some(block) = state.doc().find_block(block_id) {
                ranges.push(TextRange {
                    block,
                    from: (*from).min(*to),
                    to: (*from).max(*to),
                });
            }
        }
        Selection::Range { anchor, head } => {
            let blocks: Vec<&Block> = state.doc().flatten().collect();
            let index = |id: &BlockId| blocks.iter().position(|block| block.id == *id);
            let (Some(a), Some(b)) = (index(&anchor.block_id), index(&head.block_id)) else {
                return Vec::new();
            };
            let (start, end) = if a > b || (a == b && anchor.offset > head.offset) {
                (head, anchor)
            } else {
                (anchor, head)
            };
            for block in &blocks[a.min(b)..=a.max(b)] {
                let mut range = whole(block);
                if block.id == start.block_id {
                    range.from = start.offset;
                }
                if block.id == end.block_id {
                    range.to = end.offset;
                }
                ranges.push(range);
            }
        }
    }
    ranges.retain(|range| accepts(range.block) && range.from < range.to);
    ranges
}

fn collect_selected<'a>(
    blocks: &'a [Block],
    roots: &[BlockId],
    inside: bool,
    ranges: &mut Vec<TextRange<'a>>,
) {
    for block in blocks {
        let covered = inside || roots.contains(&block.id);
        if covered {
            ranges.push(TextRange {
                block,
                from: 0,
                to: block.text_length(),
            });
        }
        collect_selected(&block.children, roots, covered, ranges);
    }
}

fn accepts_mark(state: &EditorState, block: &Block, mark_type: &str) -> bool {
    match state.schema().nodes.get(&block.block_type) {
        None => true,
        Some(spec) => match &spec.marks_allowed {
            MarksRule::All => true,
            MarksRule::None => false,
            MarksRule::Only(types) => types.iter().any(|allowed| allowed == mark_type),
        },
    }
}

fn fully_marked(range: &TextRange, mark_type: &str) -> bool {
    let BlockContent::RichText(spans) = &range.block.content else {
        return false;
    };
    let mut position = 0;
    spans.iter().all(|span| {
        let start = position;
        position += span.text.encode_utf16().count();
        position <= range.from
            || start >= range.to
            || span.marks.iter().any(|mark| mark.mark_type == mark_type)
    })
}

/// Add `mark`, with the schema's attribute defaults, to the selected text. Text that has
/// a mark of this type takes the new attributes; its exclusive group is left to the engine.
pub fn add_mark(state: &EditorState, mark: Mark) -> Option<Transaction> {
    let mark = state.schema().mark_with_defaults(mark);
    let steps: Vec<Step> = selected_text(state, Some(&mark.mark_type))
        .into_iter()
        .map(|range| Step::AddMark {
            block_id: range.block.id.clone(),
            from: range.from,
            to: range.to,
            mark: mark.clone(),
        })
        .collect();
    transaction(steps)
}

/// Remove marks of `mark_type` from the selected text.
pub fn remove_mark(state: &EditorState, mark_type: &str) -> Option<Transaction> {
    let steps: Vec<Step> = selected_text(state, None)
        .into_iter()
        .map(|range| Step::RemoveMark {
            block_id: range.block.id.clone(),
            from: range.from,
            to: range.to,
            mark_type: mark_type.into(),
        })
        .collect();
    transaction(steps)
}

/// Remove `mark` when every selected character that may carry it has it; add it otherwise.
pub fn toggle_mark_with(state: &EditorState, mark: Mark) -> Option<Transaction> {
    let ranges = selected_text(state, Some(&mark.mark_type));
    if ranges.is_empty() {
        return None;
    }
    if ranges
        .iter()
        .all(|range| fully_marked(range, &mark.mark_type))
    {
        remove_mark(state, &mark.mark_type)
    } else {
        add_mark(state, mark)
    }
}

fn transaction(steps: Vec<Step>) -> Option<Transaction> {
    (!steps.is_empty()).then(|| Transaction {
        steps,
        ..Transaction::new()
    })
}

pub fn toggle_mark(state: &EditorState, mark_type: &str) -> Option<Transaction> {
    toggle_mark_with(state, Mark::new(mark_type))
}

pub fn toggle_bold(state: &EditorState) -> Option<Transaction> {
    toggle_mark(state, "bold")
}

pub fn toggle_italic(state: &EditorState) -> Option<Transaction> {
    toggle_mark(state, "italic")
}

pub fn toggle_underline(state: &EditorState) -> Option<Transaction> {
    toggle_mark(state, "underline")
}

pub fn toggle_strikethrough(state: &EditorState) -> Option<Transaction> {
    toggle_mark(state, "strikethrough")
}

pub fn toggle_code(state: &EditorState) -> Option<Transaction> {
    toggle_mark(state, "code")
}

pub fn toggle_highlight(state: &EditorState, color: &str) -> Option<Transaction> {
    toggle_mark_with(
        state,
        Mark::new("highlight").with_attr("color", AttrValue::String(color.into())),
    )
}

pub fn set_link(state: &EditorState, href: &str) -> Option<Transaction> {
    add_mark(
        state,
        Mark::new("link").with_attr("href", AttrValue::String(href.into())),
    )
}

pub fn remove_link(state: &EditorState) -> Option<Transaction> {
    remove_mark(state, "link")
}
